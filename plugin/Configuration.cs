using Dalamud.Configuration;

namespace ElfiesPawpost;

[Serializable]
public sealed class Configuration : IPluginConfiguration
{
    public int Version { get; set; } = 1;
    public int Port { get; set; } = 17423;
    public bool OpenOnLogin { get; set; }
    public bool TrackTargets { get; set; } = true;
    public int TargetCooldownSeconds { get; set; } = 30;
    public string MentionAliases { get; set; } = "Elfie";
}
