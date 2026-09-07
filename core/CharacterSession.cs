namespace ElfiesPawpost.Core;

/// <summary>Keeps a login alive while the local player is unavailable during loading.</summary>
public sealed class CharacterSession
{
    public string Identity { get; private set; } = "";

    public bool Observe(string identity)
    {
        if (string.IsNullOrEmpty(identity) || identity == Identity) return false;
        Identity = identity;
        return true;
    }

    public void Logout() => Identity = "";
}
