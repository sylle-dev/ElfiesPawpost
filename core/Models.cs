using System.Text;
using System.Text.RegularExpressions;

namespace ElfiesPawpost.Core;

public sealed record PawEvent(long Id, DateTimeOffset At, string Kind, string Channel,
    string Sender, string World, string Text, bool Outgoing = false, bool Attention = false,
    string? Conversation = null, bool SuppressAlert = false);
public sealed record Watcher(string Name, string World, float Distance);
public sealed record RecentWatcher(string Name, string World, DateTimeOffset LastSeen);
public sealed record PlayerStatus(bool Online, string Name, string World, string Zone, bool TargetTracking, bool GameFocused = true);
public sealed record Snapshot(string Session, long Cursor, PawEvent[] Events, Watcher[] Watchers, PlayerStatus Player, RecentWatcher[] RecentWatchers);
public sealed record SendRequest(string Channel, string? Recipient, string Text);
public sealed record SendResult(bool Ok, string Message);

public static partial class ChatRules
{
    public static readonly IReadOnlyDictionary<string, string> Commands = new Dictionary<string, string>
    {
        ["say"] = "/s", ["party"] = "/p", ["fc"] = "/fc", ["alliance"] = "/a",
        ["shout"] = "/sh", ["yell"] = "/y",
        ["ls1"] = "/l1", ["ls2"] = "/l2", ["ls3"] = "/l3", ["ls4"] = "/l4",
        ["ls5"] = "/l5", ["ls6"] = "/l6", ["ls7"] = "/l7", ["ls8"] = "/l8",
        ["cwls1"] = "/cwl1", ["cwls2"] = "/cwl2", ["cwls3"] = "/cwl3", ["cwls4"] = "/cwl4",
        ["cwls5"] = "/cwl5", ["cwls6"] = "/cwl6", ["cwls7"] = "/cwl7", ["cwls8"] = "/cwl8",
    };

    [GeneratedRegex(@"\A[A-Za-z'-]{2,15} [A-Za-z'-]{2,15}@[A-Za-z][A-Za-z0-9-]{1,31}\z", RegexOptions.CultureInvariant)]
    private static partial Regex RecipientPattern();

    public static string BuildCommand(SendRequest request)
    {
        var message = (request.Text ?? "").Trim();
        if (message.Length == 0) throw new ArgumentException("Write a message first.");
        if (message.Any(char.IsControl) || message.Contains('\u2028') || message.Contains('\u2029'))
            throw new ArgumentException("The message must be a single line without control characters.");
        if (message.StartsWith('/')) throw new ArgumentException("Write text; game commands are not run from the panel.");
        string prefix;
        if (request.Channel == "tell")
        {
            if (!RecipientPattern().IsMatch(request.Recipient ?? ""))
                throw new ArgumentException("Use Firstname Lastname@World for the recipient.");
            prefix = "/tell " + request.Recipient;
        }
        else if (!Commands.TryGetValue(request.Channel ?? "", out prefix!))
            throw new ArgumentException("That channel does not accept outgoing messages.");
        var command = prefix + " " + message;
        if (Encoding.UTF8.GetByteCount(command) > 500)
            throw new ArgumentException("The message is too long: 500 bytes maximum, including channel and recipient.");
        return command;
    }

    /// <summary>A line the player produced: an outgoing tell, a line the game attributes to the local
    /// player, or a line whose sender is the character itself. An emote aimed at the player is never own.</summary>
    public static bool IsOwnMessage(bool outgoingTell, bool sourceIsLocalPlayer, bool targetIsLocalPlayer,
        string senderName, string senderWorld, string playerName, string playerWorld)
    {
        if (outgoingTell || sourceIsLocalPlayer) return true;
        if (targetIsLocalPlayer || senderName.Length == 0 || playerName.Length == 0) return false;
        // Same-world lines can arrive without a World payload; an unknown world still matches our own name.
        return senderName == playerName && (senderWorld.Length == 0 || senderWorld == playerWorld);
    }

    public static bool Mentions(string text, IEnumerable<string> names) => names
        .Where(n => !string.IsNullOrWhiteSpace(n))
        .Any(n => Regex.IsMatch(text, @"(?<![\p{L}\p{N}_])" + Regex.Escape(n.Trim()) + @"(?![\p{L}\p{N}_])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant));
}

/// <summary>All data leaving the game is copied into managed records. No game pointers cross threads.</summary>
public sealed class PawState
{
    private readonly object gate = new();
    private readonly Queue<PawEvent> events = new();
    private long cursor;
    private string session = Guid.NewGuid().ToString("N");
    private Watcher[] watchers = [];
    private readonly Dictionary<string, RecentWatcher> recentWatchers = new();
    public const int RecentWatcherCapacity = 100;
    public static readonly TimeSpan RecentWatcherRetention = TimeSpan.FromMinutes(30);
    private PlayerStatus player = new(false, "", "", "", false);
    public const int Capacity = 1500;

    public void Add(string kind, string channel, string sender, string world, string text,
        bool outgoing = false, bool attention = false, string? conversation = null, bool suppressAlert = false)
    {
        lock (gate)
        {
            events.Enqueue(new(++cursor, DateTimeOffset.UtcNow, kind, channel, sender, world, text,
                outgoing, attention, conversation, suppressAlert));
            while (events.Count > Capacity) events.Dequeue();
        }
    }
    public void Update(PlayerStatus status, Watcher[] current, DateTimeOffset? observedAt = null)
    {
        lock (gate)
        {
            var now = observedAt ?? DateTimeOffset.UtcNow;
            player = status;
            watchers = current.ToArray();
            foreach (var watcher in current)
                recentWatchers[watcher.Name + "@" + watcher.World] = new(watcher.Name, watcher.World, now);
            foreach (var key in recentWatchers.Where(p => now - p.Value.LastSeen >= RecentWatcherRetention)
                .Select(p => p.Key).ToArray()) recentWatchers.Remove(key);
            foreach (var key in recentWatchers.OrderByDescending(p => p.Value.LastSeen)
                .Skip(RecentWatcherCapacity).Select(p => p.Key).ToArray()) recentWatchers.Remove(key);
        }
    }
    public void SetGameFocused(bool focused)
    {
        lock (gate) player = player with { GameFocused = focused };
    }
    public Snapshot Read(long after = 0)
    {
        lock (gate) return new(session, cursor, events.Where(e => e.Id > after).ToArray(), watchers.ToArray(), player, recentWatchers.Values.OrderByDescending(w => w.LastSeen).ToArray());
    }
    public void Clear()
    {
        lock (gate) { events.Clear(); watchers = []; recentWatchers.Clear(); cursor = 0; session = Guid.NewGuid().ToString("N"); }
    }
}

public sealed class TargetTracker
{
    private HashSet<string> current = [];
    private readonly Dictionary<string, DateTimeOffset> lastAlert = new();
    public IEnumerable<Watcher> Update(Watcher[] watchers, DateTimeOffset now, TimeSpan cooldown)
    {
        var next = watchers.Select(w => w.Name + "@" + w.World).ToHashSet();
        var alerts = watchers.Where(w =>
        {
            var key = w.Name + "@" + w.World;
            if (current.Contains(key) || (lastAlert.TryGetValue(key, out var at) && now - at < cooldown)) return false;
            lastAlert[key] = now;
            return true;
        }).ToArray();
        current = next;
        foreach (var key in lastAlert.Where(p => now - p.Value > TimeSpan.FromMinutes(10)).Select(p => p.Key).ToArray())
            lastAlert.Remove(key);
        return alerts;
    }
    public void Clear() { current.Clear(); lastAlert.Clear(); }
}
