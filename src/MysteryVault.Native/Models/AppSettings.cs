namespace MysteryVault.Native.Models;

public sealed class AppSettings
{
    public string Theme { get; set; } = "Dark";
    public bool PlayerSandboxEnabled { get; set; } = true;
    public string DnsOverHttpsEndpoint { get; set; } = "https://dns.adguard-dns.com/dns-query";
    public string? TorrentCachePath { get; set; }
    public string? SelectedEmbedServerId { get; set; }
}
