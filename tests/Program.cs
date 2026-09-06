using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using ElfiesPawpost.Core;

var passed = 0;
void Check(bool valid, string name) { if (!valid) throw new Exception("FAIL: " + name); Console.WriteLine("PASS " + name); passed++; }
void Reject(SendRequest request, string name)
{
    try { ChatRules.BuildCommand(request); throw new Exception("FAIL accepted " + name); }
    catch (ArgumentException) { Check(true, name); }
}

Check(ChatRules.BuildCommand(new("tell", "Luna Moonpetal@Moogle", "Hola ♡")) == "/tell Luna Moonpetal@Moogle Hola ♡", "Tell exact recipient and Unicode");
Check(ChatRules.BuildCommand(new("party", null, "hello")) == "/p hello", "Channel command mapping");
Check(ChatRules.BuildCommand(new("cwls8", null, "hello")) == "/cwl8 hello", "Cross-world channel mapping");
Reject(new("tell", "Luna Moonpetal@Moogle\n/logout", "Hi"), "Recipient command injection rejected");
Reject(new("tell", "Luna Moonpetal", "Hi"), "World is required for a tell");
Reject(new("say", null, "hello\n/logout"), "Newline injection rejected");
Reject(new("say", null, "\0hi"), "Control payload rejected");
Reject(new("say", null, "/logout"), "Slash commands rejected");
Reject(new("logout", null, "Hi"), "Unknown channel rejected");
Reject(new("say", null, new string('界', 170)), "UTF-8 byte limit enforced");
Reject(new("say", null, "    "), "Blank messages rejected");
Check(ChatRules.Mentions("¡ELFIE! ven", ["Elfie"]), "Mention case and punctuation");
Check(!ChatRules.Mentions("Elfiecat", ["Elfie"]), "Mention word boundaries prevent false matches");
Check(!ChatRules.Mentions("Anything", ["", " "]), "Blank aliases ignored");

bool Own(bool tell, bool source, bool target, string sender, string senderWorld) =>
    ChatRules.IsOwnMessage(tell, source, target, sender, senderWorld, "Elfie Pawpost", "Moogle");
Check(Own(true, false, false, "Luna Moonpetal", "Moogle"), "Outgoing tell is own even though the sender field holds the recipient");
Check(Own(false, true, false, "", ""), "Line attributed to the local player is own");
Check(Own(false, false, false, "Elfie Pawpost", "Moogle"), "Own name and world make a channel line own");
Check(Own(false, false, false, "Elfie Pawpost", ""), "Own name without a World payload still counts as own");
Check(!Own(false, false, false, "Elfie Pawpost", "Ragnarok"), "Same name on another world is not own");
Check(!Own(false, false, false, "Luna Moonpetal", "Moogle"), "Another character's line is not own");
Check(!Own(false, false, true, "Elfie Pawpost", "Moogle"), "An emote aimed at the player is never own");
Check(!Own(false, false, false, "", ""), "A nameless system line is not own");

var state = new PawState();
Parallel.For(0, 1700, i => state.Add("chat", "say", "Luna", "Moogle", i.ToString()));
var initial = state.Read();
Check(initial.Events.Length == PawState.Capacity, "History is bounded under concurrent producers");
Check(initial.Events.Select(e => e.Id).Distinct().Count() == PawState.Capacity, "Event IDs are unique");
Check(state.Read(initial.Cursor - 3).Events.Length == 3, "Reconnect cursor returns only missing events");
state.Clear();
Check(state.Read().Session != initial.Session && state.Read().Events.Length == 0, "Character/session reset drops old history");
var tracker = new TargetTracker(); var now = DateTimeOffset.UtcNow;
Watcher[] watchers = [new("Luna Moonpetal", "Moogle", 2)];
Check(tracker.Update(watchers, now, TimeSpan.FromSeconds(30)).Count() == 1, "Target acquisition alerts once");
Check(!tracker.Update(watchers, now.AddSeconds(1), TimeSpan.FromSeconds(30)).Any(), "Held target does not spam");
tracker.Update([], now.AddSeconds(2), TimeSpan.FromSeconds(30));
Check(!tracker.Update(watchers, now.AddSeconds(3), TimeSpan.FromSeconds(30)).Any(), "Retarget cooldown prevents spam");
tracker.Update([], now.AddSeconds(31), TimeSpan.FromSeconds(30));
Check(tracker.Update(watchers, now.AddSeconds(32), TimeSpan.FromSeconds(30)).Count() == 1, "New target after cooldown alerts");

if (args.Contains("--unit-only")) { Console.WriteLine($"{passed} tests passed."); return; }

var temp = Path.Combine(Path.GetTempPath(), "elfie-test-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
await File.WriteAllTextAsync(Path.Combine(temp, "index.html"), "<html>Elfie test</html>");
var portProbe = new TcpListener(IPAddress.Loopback, 0); portProbe.Start();
var port = ((IPEndPoint)portProbe.LocalEndpoint).Port; portProbe.Stop();
var sends = 0;
using var server = new LocalServer(port, temp, state, (request, token) => { Interlocked.Increment(ref sends); return Task.FromResult(new SendResult(true, "submitted")); });
using var client = new HttpClient { BaseAddress = new Uri(server.Origin), Timeout = TimeSpan.FromSeconds(5) };
var page = await client.GetAsync("/");
Check(page.StatusCode == HttpStatusCode.OK, "Static panel served on loopback");
Check(page.Headers.Contains("Content-Security-Policy") && page.Headers.Contains("Referrer-Policy"), "Browser isolation headers present");
Check((await client.GetAsync("/api/events")).StatusCode == HttpStatusCode.Unauthorized, "Unauthenticated history rejected");
client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", server.LaunchUrl.Split("#key=")[1]);
Check((await client.GetAsync("/api/events")).StatusCode == HttpStatusCode.OK, "Authenticated history accessible");
using var crossOrigin = new HttpRequestMessage(HttpMethod.Get, "/api/events");
crossOrigin.Headers.Add("Origin", "https://evil.example");
Check((await client.SendAsync(crossOrigin)).StatusCode == HttpStatusCode.Forbidden, "Foreign origin rejected even with token");
using var nullOrigin = new HttpRequestMessage(HttpMethod.Get, "/api/events"); nullOrigin.Headers.Add("Origin", "null");
Check((await client.SendAsync(nullOrigin)).StatusCode == HttpStatusCode.Forbidden, "Opaque origin rejected");
Check((await client.PostAsJsonAsync("/api/send", new SendRequest("say", null, "Hi"))).StatusCode == HttpStatusCode.OK && sends == 1, "Explicit authenticated send is dispatched once");
Check((await client.PostAsJsonAsync("/api/send", new SendRequest("say", null, "/logout"))).StatusCode == HttpStatusCode.BadRequest && sends == 1, "Invalid message never reaches game callback");
using var badJson = new StringContent("{bad", Encoding.UTF8, "application/json");
Check((await client.PostAsync("/api/send", badJson)).StatusCode == HttpStatusCode.BadRequest, "Malformed JSON rejected");
using var big = new StringContent(new string('x', 5000), Encoding.UTF8, "application/json");
Check((await client.PostAsync("/api/send", big)).StatusCode == HttpStatusCode.RequestEntityTooLarge, "Oversized body rejected");
state.Add("chat", "tell", "Luna", "Moogle", "hello");
using var streamResponse = await client.GetAsync("/api/stream", HttpCompletionOption.ResponseHeadersRead);
using var reader = new StreamReader(await streamResponse.Content.ReadAsStreamAsync());
var line = await reader.ReadLineAsync();
Check(line?.StartsWith("data: ") == true, "SSE stream emits live snapshot");
var streamed = JsonSerializer.Deserialize<Snapshot>(line![6..], LocalServer.Json)!;
Check(streamed.Events.Length == 1 && streamed.Events[0].Text == "hello", "SSE contains captured event");
await client.GetStringAsync($"/api/events?session={streamed.Session}&after={streamed.Cursor}").ContinueWith(t =>
    Check(JsonSerializer.Deserialize<Snapshot>(t.Result, LocalServer.Json)!.Events.Length == 0, "Reconnect avoids duplicate delivery"));
state.Clear(); state.Add("chat", "say", "Nora", "Moogle", "new character");
var reset = await client.GetFromJsonAsync<Snapshot>($"/api/events?session={streamed.Session}&after=9000");
Check(reset!.Events.Length == 1, "New session ignores stale high cursor");
Console.WriteLine($"{passed} tests passed.");
