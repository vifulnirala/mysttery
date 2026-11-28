namespace MysteryVault.Core.Configuration;

public sealed class AppSettings
{
    public const string DefaultDohEndpoint = "https://dns.adguard-dns.com/dns-query";
    public const int MaxWatchlistItems = 500;

    public string TmdbReadAccessToken { get; set; } = string.Empty;
    public string DohEndpoint { get; set; } = DefaultDohEndpoint;
    public string? TorrentCacheDirectory { get; set; }
    public bool EnableEmbedSandbox { get; set; } = true;
    public List<EmbedServerDefinition> DefaultEmbedServers { get; set; } = new();
}

public sealed record EmbedServerDefinition(
    string Id,
    string Name,
    string MovieUrlTemplate,
    string TvUrlTemplate,
    bool IsUserImported = false);
