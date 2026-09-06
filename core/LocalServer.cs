using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ElfiesPawpost.Core;

/// <summary>Loopback-only HTTP host. A fresh capability secret is required for every API request.</summary>
public sealed class LocalServer : IDisposable
{
    private readonly HttpListener listener = new();
    private readonly CancellationTokenSource stop = new();
    private readonly SemaphoreSlim slots = new(16);
    private readonly PawState state;
    private readonly Func<SendRequest, CancellationToken, Task<SendResult>> send;
    private readonly string webRoot;
    private readonly string token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private readonly Task loop;
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public string Origin { get; }
    public string LaunchUrl => Origin + "/#key=" + token;

    public LocalServer(int port, string webRoot, PawState state,
        Func<SendRequest, CancellationToken, Task<SendResult>> send)
    {
        if (port is < 1024 or > 65535) throw new ArgumentOutOfRangeException(nameof(port));
        this.webRoot = Path.GetFullPath(webRoot);
        if (!File.Exists(Path.Combine(this.webRoot, "index.html")))
            throw new IOException("web/index.html is missing next to the plugin. Copy the whole folder from the release.");
        this.state = state;
        this.send = send;
        Origin = $"http://127.0.0.1:{port}";
        listener.Prefixes.Add(Origin + "/");
        listener.Start();
        loop = Task.Run(Accept);
    }

    private async Task Accept()
    {
        while (!stop.IsCancellationRequested)
        {
            HttpListenerContext context;
            try { context = await listener.GetContextAsync().WaitAsync(stop.Token); }
            catch (Exception) when (stop.IsCancellationRequested) { break; }
            if (!slots.Wait(0)) { context.Response.StatusCode = 503; context.Response.Close(); continue; }
            _ = Handle(context).ContinueWith(_ => slots.Release(), TaskScheduler.Default);
        }
    }

    private async Task Handle(HttpListenerContext context)
    {
        var response = context.Response;
        try
        {
            var request = context.Request;
            response.Headers["Cache-Control"] = "no-store";
            response.Headers["X-Content-Type-Options"] = "nosniff";
            response.Headers["Referrer-Policy"] = "no-referrer";
            response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
            if (request.RemoteEndPoint is not { } remote || !IPAddress.IsLoopback(remote.Address) ||
                request.Url?.GetLeftPart(UriPartial.Authority) != Origin ||
                (request.Headers["Origin"] is { } origin && origin != Origin) ||
                request.Headers["Sec-Fetch-Site"] == "cross-site")
            { await Reply(response, 403, new { error = "Origen no permitido." }); return; }
            var path = request.Url.AbsolutePath;
            if (!path.StartsWith("/api/", StringComparison.Ordinal))
            {
                if (request.HttpMethod != "GET") { response.StatusCode = 405; return; }
                var relative = Uri.UnescapeDataString(path).TrimStart('/');
                if (relative == "") relative = "index.html";
                var file = Path.GetFullPath(Path.Combine(webRoot, relative));
                if (!file.StartsWith(webRoot + Path.DirectorySeparatorChar, StringComparison.Ordinal) || !File.Exists(file))
                { response.StatusCode = 404; return; }
                var mime = Path.GetExtension(file) switch
                {
                    ".html" => "text/html; charset=utf-8", ".js" => "text/javascript; charset=utf-8",
                    ".css" => "text/css; charset=utf-8", ".png" => "image/png", ".svg" => "image/svg+xml",
                    ".webp" => "image/webp", ".woff2" => "font/woff2", ".ico" => "image/x-icon", _ => "application/octet-stream",
                };
                response.ContentType = mime;
                var data = await File.ReadAllBytesAsync(file, stop.Token);
                response.ContentLength64 = data.Length;
                await response.OutputStream.WriteAsync(data, stop.Token);
                return;
            }
            var authorization = request.Headers["Authorization"] ?? "";
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(authorization), Encoding.UTF8.GetBytes("Bearer " + token)))
            { await Reply(response, 401, new { error = "Open the panel with /elfie to connect this tab." }); return; }
            if (path == "/api/events" && request.HttpMethod == "GET")
            {
                _ = long.TryParse(request.QueryString["after"], out var after);
                var snapshot = state.Read();
                if (request.QueryString["session"] == snapshot.Session)
                    snapshot = snapshot with { Events = snapshot.Events.Where(e => e.Id > Math.Max(0, after)).ToArray() };
                await Reply(response, 200, snapshot); return;
            }
            if (path == "/api/stream" && request.HttpMethod == "GET")
            {
                response.ContentType = "text/event-stream";
                response.SendChunked = true;
                _ = long.TryParse(request.QueryString["after"], out var after);
                var session = request.QueryString["session"] ?? "";
                while (!stop.IsCancellationRequested)
                {
                    var snapshot = state.Read();
                    if (session == snapshot.Session) snapshot = snapshot with { Events = snapshot.Events.Where(e => e.Id > after).ToArray() };
                    var data = Encoding.UTF8.GetBytes("data: " + JsonSerializer.Serialize(snapshot, Json) + "\n\n");
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
                    timeout.CancelAfter(TimeSpan.FromSeconds(10));
                    await response.OutputStream.WriteAsync(data, timeout.Token);
                    await response.OutputStream.FlushAsync(timeout.Token);
                    session = snapshot.Session; after = snapshot.Cursor;
                    await Task.Delay(1000, stop.Token);
                }
                return;
            }
            if (path == "/api/send" && request.HttpMethod == "POST")
            {
                if (request.ContentType?.Split(';')[0] != "application/json")
                { await Reply(response, 415, new { error = "Se requiere JSON." }); return; }
                if (request.ContentLength64 > 4096)
                { await Reply(response, 413, new { error = "Mensaje demasiado grande." }); return; }
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
                timeout.CancelAfter(TimeSpan.FromSeconds(5));
                // Browsers send Content-Length; other clients may use chunked transfer. Bound both paths.
                var bytes = new byte[4097];
                var length = 0;
                while (length < bytes.Length)
                {
                    var read = await request.InputStream.ReadAsync(bytes.AsMemory(length), timeout.Token);
                    if (read == 0) break;
                    length += read;
                }
                if (length > 4096) { await Reply(response, 413, new { error = "Mensaje demasiado grande." }); return; }
                var body = JsonSerializer.Deserialize<SendRequest>(bytes.AsSpan(0, length), Json) ?? throw new ArgumentException("Empty message.");
                _ = ChatRules.BuildCommand(body);
                var result = await send(body, timeout.Token);
                await Reply(response, result.Ok ? 200 : 409, result); return;
            }
            await Reply(response, 404, new { error = "Ruta no encontrada." });
        }
        catch (ArgumentException ex) { await TryReply(response, 400, ex.Message); }
        catch (JsonException) { await TryReply(response, 400, "Invalid JSON."); }
        catch (OperationCanceledException) { await TryReply(response, 503, "The game did not answer in time. Check the conversation before resending."); }
        catch (Exception) { await TryReply(response, 500, "The connection to the panel was lost."); }
        finally { try { response.Close(); } catch { /* disconnected browser */ } }
    }

    private static async Task Reply(HttpListenerResponse response, int status, object body)
    {
        response.StatusCode = status;
        response.ContentType = "application/json; charset=utf-8";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(body, Json);
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
    }
    private static async Task TryReply(HttpListenerResponse response, int status, string error)
    { try { await Reply(response, status, new { error }); } catch { /* peer disconnected */ } }
    public void Dispose()
    {
        stop.Cancel();
        listener.Close();
        try { loop.Wait(TimeSpan.FromSeconds(1)); } catch { }
    }
}
