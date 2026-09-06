using System.Collections.Concurrent;
using System.Diagnostics;
using System.Numerics;
using Dalamud.Bindings.ImGui;
using Dalamud.Game.Chat;
using Dalamud.Game.ClientState.Objects.SubKinds;
using Dalamud.Game.Command;
using Dalamud.Game.Text;
using Dalamud.Game.Text.SeStringHandling.Payloads;
using Dalamud.IoC;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;
using ElfiesPawpost.Core;
using FFXIVClientStructs.FFXIV.Client.System.String;
using FFXIVClientStructs.FFXIV.Client.UI;
using Lumina.Excel.Sheets;

namespace ElfiesPawpost;

public sealed class Plugin : IDalamudPlugin
{
    [PluginService] internal static IDalamudPluginInterface PluginInterface { get; private set; } = null!;
    [PluginService] internal static ICommandManager Commands { get; private set; } = null!;
    [PluginService] internal static IChatGui Chat { get; private set; } = null!;
    [PluginService] internal static IObjectTable Objects { get; private set; } = null!;
    [PluginService] internal static IClientState Client { get; private set; } = null!;
    [PluginService] internal static IFramework Framework { get; private set; } = null!;
    [PluginService] internal static IDataManager Data { get; private set; } = null!;
    [PluginService] internal static IPluginLog Log { get; private set; } = null!;

    private readonly Configuration config;
    private readonly PawState state = new();
    private readonly TargetTracker tracker = new();
    private readonly ConcurrentQueue<PendingSend> outgoing = new();
    private LocalServer? server;
    private bool settingsOpen;
    private volatile bool disposed;
    private string serverError = "";
    private string character = "";
    private uint territory;
    private DateTimeOffset nextScan;
    private DateTimeOffset lastSend;
    private string zone = "";
    private sealed record PendingSend(SendRequest Request, CancellationToken Token, TaskCompletionSource<SendResult> Result, string Session);

    public Plugin()
    {
        config = PluginInterface.GetPluginConfig() as Configuration ?? new();
        config.Port = Math.Clamp(config.Port, 1024, 65535);
        config.TargetCooldownSeconds = Math.Clamp(config.TargetCooldownSeconds, 5, 300);
        StartServer();
        Commands.AddHandler("/elfie", new CommandInfo(OnCommand)
        { HelpMessage = "Opens Pawpost. /elfie config · /elfie auto on|off · /elfie start|stop · /elfie clear" });
        Chat.ChatMessage += OnChat;
        Framework.Update += OnUpdate;
        PluginInterface.UiBuilder.Draw += Draw;
        PluginInterface.UiBuilder.OpenConfigUi += OpenSettings;
        PluginInterface.UiBuilder.OpenMainUi += OpenPanel;
    }

    private void StartServer()
    {
        if (server != null) return;
        try
        {
            var web = Path.Combine(PluginInterface.AssemblyLocation.Directory!.FullName, "web");
            server = new LocalServer(config.Port, web, state, QueueSend);
            serverError = "";
        }
        catch (Exception ex)
        {
            serverError = "The local server could not start. Check the port and that the web folder sits next to the plugin.";
            Log.Error(ex, "Pawpost local server startup failed");
        }
    }

    private Task<SendResult> QueueSend(SendRequest request, CancellationToken token)
    {
        if (disposed) return Task.FromResult(new SendResult(false, "The plugin is shutting down."));
        if (outgoing.Count >= 8) return Task.FromResult(new SendResult(false, "Too many messages are already queued."));
        var result = new TaskCompletionSource<SendResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        outgoing.Enqueue(new(request, token, result, state.Read().Session));
        return result.Task.WaitAsync(token);
    }

    private void OnUpdate(IFramework framework)
    {
        if (disposed) return;
        var now = DateTimeOffset.UtcNow;
        if (now >= nextScan || CurrentIdentity() != character)
        {
            nextScan = now.AddMilliseconds(500);
            try { Scan(now); }
            catch (Exception ex) { Log.Warning(ex, "Pawpost could not refresh nearby players"); }
        }
        while (outgoing.TryDequeue(out var pending))
        {
            if (pending.Token.IsCancellationRequested) { pending.Result.TrySetCanceled(pending.Token); continue; }
            if (pending.Session != state.Read().Session)
            { pending.Result.TrySetResult(new(false, "The session changed; check the recipient.")); continue; }
            try
            {
                if (!Client.IsLoggedIn || Objects.LocalPlayer == null)
                    pending.Result.TrySetResult(new(false, "Log in with your character to send messages."));
                else if (now - lastSend < TimeSpan.FromSeconds(1))
                    pending.Result.TrySetResult(new(false, "Wait a second before sending another message."));
                else
                {
                    var command = ChatRules.BuildCommand(pending.Request);
                    var clean = PluginInterface.Sanitizer.Sanitize(command);
                    if (clean != command) throw new ArgumentException("The message contains characters the game rejects.");
                    pending.Token.ThrowIfCancellationRequested();
                    SubmitToGame(command);
                    lastSend = now;
                    pending.Result.TrySetResult(new(true, "Sent to the game. Any errors will show up in Activity."));
                }
            }
            catch (OperationCanceledException) { pending.Result.TrySetCanceled(pending.Token); }
            catch (ArgumentException ex) { pending.Result.TrySetResult(new(false, ex.Message)); }
            catch (Exception ex)
            {
                Log.Error(ex, "Pawpost could not submit a chat message");
                pending.Result.TrySetResult(new(false, "Could not send to the game. Check /xllog."));
            }
        }
    }

    private static string CurrentIdentity()
    {
        var player = Objects.LocalPlayer;
        return Client.IsLoggedIn && player != null ? player.Name.TextValue + "@" + player.HomeWorld.Value.Name.ToString() : "";
    }

    private static unsafe void SubmitToGame(string command)
    {
        var ui = UIModule.Instance();
        if (ui == null) throw new InvalidOperationException("UIModule unavailable");
        using var text = new Utf8String(command);
        ui->ProcessChatBoxEntry(&text);
    }

    private void Scan(DateTimeOffset now)
    {
        var player = Objects.LocalPlayer;
        if (!Client.IsLoggedIn || player == null)
        {
            if (character != "") { character = ""; tracker.Clear(); state.Clear(); }
            state.Update(new(false, "", "", "", false), []);
            return;
        }
        var world = player.HomeWorld.Value.Name.ToString();
        var identity = player.Name.TextValue + "@" + world;
        if (identity != character)
        {
            state.Clear(); tracker.Clear(); character = identity;
            territory = 0;
            if (config.OpenOnLogin) OpenPanel();
        }
        if (territory != Client.TerritoryType)
        {
            territory = Client.TerritoryType;
            zone = Data.GetExcelSheet<TerritoryType>().GetRowOrDefault(territory)?.PlaceName.Value.Name.ToString() ?? "Eorzea";
            tracker.Clear();
        }
        var tracking = config.TrackTargets && !Client.IsPvP;
        var watchers = tracking ? Objects.OfType<IPlayerCharacter>()
            .Where(p => p.GameObjectId != player.GameObjectId && p.TargetObjectId == player.GameObjectId)
            .Select(p => new Watcher(p.Name.TextValue, p.HomeWorld.Value.Name.ToString(),
                MathF.Round(Vector3.Distance(p.Position, player.Position), 1)))
            .OrderBy(p => p.Distance).ToArray() : [];
        state.Update(new(true, player.Name.TextValue, world, zone, tracking), watchers);
        foreach (var watcher in tracker.Update(watchers, now, TimeSpan.FromSeconds(config.TargetCooldownSeconds)))
            state.Add("target", "target", watcher.Name, watcher.World, "Targeted you.", attention: true);
    }

    private void OnChat(IHandleableChatMessage message)
    {
        if (disposed || !Client.IsLoggedIn || Objects.LocalPlayer is not { } player) return;
        try
        {
            if (CurrentIdentity() != character) Scan(DateTimeOffset.UtcNow);
            var type = message.LogKind;
            var channel = Channel(type);
            if (channel == null) return;
            var payload = message.Sender.Payloads.OfType<PlayerPayload>().FirstOrDefault();
            var isEmote = type is XivChatType.StandardEmote or XivChatType.CustomEmote;
            if (payload == null && isEmote) payload = message.Message.Payloads.OfType<PlayerPayload>().FirstOrDefault();
            var name = payload?.PlayerName ?? message.Sender.TextValue;
            var world = payload?.World.Value.Name.ToString() ?? "";
            // Same-world names may arrive without a World payload. Only use a known matching object.
            if (world == "" && name != "")
            {
                var known = Objects.OfType<IPlayerCharacter>().Where(p => p.Name.TextValue == name).Take(2).ToArray();
                if (known.Length == 1) world = known[0].HomeWorld.Value.Name.ToString();
            }
            var targetsPlayer = message.TargetKind == XivChatRelationKind.LocalPlayer;
            var outgoingMessage = ChatRules.IsOwnMessage(type == XivChatType.TellOutgoing,
                message.SourceKind == XivChatRelationKind.LocalPlayer, targetsPlayer,
                name, world, player.Name.TextValue, player.HomeWorld.Value.Name.ToString());
            var text = message.Message.TextValue;
            var directed = isEmote && targetsPlayer;
            var aliases = config.MentionAliases.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Append(player.Name.TextValue);
            var mention = !outgoingMessage && ChatRules.Mentions(text, aliases);
            var error = type is XivChatType.ErrorMessage or XivChatType.SystemError;
            var attention = !outgoingMessage && (type is XivChatType.TellIncoming or XivChatType.GmTell || directed || mention || error);
            var kind = error ? "error" : isEmote ? (directed ? "emote" : "ambient-emote") : mention ? "mention" : "chat";
            var conversation = channel == "tell" && name != "" && world != "" ? name + "@" + world : null;
            state.Add(kind, channel, name == "" ? "Eorzea" : name, world, text, outgoingMessage, attention, conversation);
        }
        catch (Exception ex) { Log.Warning(ex, "Pawpost could not read a chat message"); }
    }

    private static string? Channel(XivChatType type) => type switch
    {
        XivChatType.Say or XivChatType.GmSay => "say",
        XivChatType.Shout or XivChatType.GmShout => "shout",
        XivChatType.Yell or XivChatType.GmYell => "yell",
        XivChatType.TellIncoming or XivChatType.TellOutgoing or XivChatType.GmTell => "tell",
        XivChatType.Party or XivChatType.CrossParty or XivChatType.GmParty => "party",
        XivChatType.Alliance => "alliance",
        XivChatType.FreeCompany or XivChatType.GmFreeCompany => "fc",
        XivChatType.NoviceNetwork or XivChatType.GmNoviceNetwork => "novice",
        XivChatType.CustomEmote or XivChatType.StandardEmote => "emote",
        XivChatType.ErrorMessage or XivChatType.SystemError => "system",
        >= XivChatType.Ls1 and <= XivChatType.Ls8 => "ls" + ((int)type - (int)XivChatType.Ls1 + 1),
        XivChatType.CrossLinkShell1 => "cwls1",
        >= XivChatType.CrossLinkShell2 and <= XivChatType.CrossLinkShell8 => "cwls" + ((int)type - (int)XivChatType.CrossLinkShell2 + 2),
        _ => null,
    };

    private void OnCommand(string command, string args)
    {
        switch (args.Trim().ToLowerInvariant())
        {
            case "config": OpenSettings(); break;
            case "start": StartServer(); PrintStatus(); break;
            case "stop": server?.Dispose(); server = null; Chat.Print("Pawpost: server stopped."); break;
            case "clear": state.Clear(); Chat.Print("Pawpost: history for this session cleared."); break;
            case "auto on": config.OpenOnLogin = true; Save(); Chat.Print("Pawpost will open when you log in with your character."); break;
            case "auto off": config.OpenOnLogin = false; Save(); Chat.Print("Pawpost will open with /elfie."); break;
            default: OpenPanel(); break;
        }
    }
    private void PrintStatus()
    {
        if (server == null) Chat.PrintError("Pawpost: " + serverError);
        else Chat.Print("Pawpost is ready. Use /elfie to open the mailbox.");
    }
    private void OpenPanel()
    {
        StartServer();
        if (server == null) { PrintStatus(); settingsOpen = true; return; }
        try { Process.Start(new ProcessStartInfo(server.LaunchUrl) { UseShellExecute = true }); }
        catch (Exception ex) { Log.Warning(ex, "Could not open browser"); settingsOpen = true; }
    }
    private void OpenSettings() => settingsOpen = true;
    private void Save() => PluginInterface.SavePluginConfig(config);

    private void Draw()
    {
        if (!settingsOpen) return;
        ImGui.SetNextWindowSize(new Vector2(510, 390), ImGuiCond.FirstUseEver);
        if (ImGui.Begin("Elfie's Pawpost###ElfieSettings", ref settingsOpen))
        {
            ImGui.TextWrapped("Your Eorzea mailbox, with cat ears. Open the panel in your browser with /elfie.");
            ImGui.Separator();
            var auto = config.OpenOnLogin;
            if (ImGui.Checkbox("Open the browser when I log in", ref auto)) { config.OpenOnLogin = auto; Save(); }
            var track = config.TrackTargets;
            if (ImGui.Checkbox("Detect who targets me (outside PvP)", ref track)) { config.TrackTargets = track; Save(); }
            var seconds = config.TargetCooldownSeconds;
            if (ImGui.SliderInt("Pause between alerts from the same person", ref seconds, 5, 300, "%d s"))
            { config.TargetCooldownSeconds = seconds; Save(); }
            var aliases = config.MentionAliases;
            if (ImGui.InputText("Mention nicknames", ref aliases, 256)) { config.MentionAliases = aliases; Save(); }
            ImGui.TextWrapped("Comma separated. Your full name is always included.");
            var port = config.Port;
            if (ImGui.InputInt("Local port", ref port)) config.Port = Math.Clamp(port, 1024, 65535);
            if (ImGui.Button("Apply port / restart server")) { Save(); server?.Dispose(); server = null; StartServer(); }
            if (serverError != "") ImGui.TextWrapped(serverError);
            if (ImGui.Button("Open mailbox")) OpenPanel();
            ImGui.SameLine();
            if (ImGui.Button("Copy private link") && server != null) ImGui.SetClipboardText(server.LaunchUrl);
            ImGui.TextWrapped("If Wine does not open the browser, copy the link and paste it into your Linux browser. The link grants access to this session: do not share it.");
            ImGui.TextWrapped("History lives in memory, up to 1500 events. It clears when you log out or reload the plugin. Emotes without text are not captured.");
        }
        ImGui.End();
    }
    public void Dispose()
    {
        disposed = true;
        Commands.RemoveHandler("/elfie");
        Chat.ChatMessage -= OnChat;
        Framework.Update -= OnUpdate;
        PluginInterface.UiBuilder.Draw -= Draw;
        PluginInterface.UiBuilder.OpenConfigUi -= OpenSettings;
        PluginInterface.UiBuilder.OpenMainUi -= OpenPanel;
        server?.Dispose();
        while (outgoing.TryDequeue(out var pending)) pending.Result.TrySetResult(new(false, "Plugin closed."));
        state.Clear();
    }
}
