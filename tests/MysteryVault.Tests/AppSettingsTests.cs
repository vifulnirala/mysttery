using MysteryVault.Core.Configuration;
using Xunit;

namespace MysteryVault.Tests;

public sealed class AppSettingsTests
{
    [Fact]
    public void Defaults_UseAdGuardDohAndSandboxEnabled()
    {
        var settings = new AppSettings();
        Assert.Equal("https://dns.adguard-dns.com/dns-query", settings.DohEndpoint);
        Assert.True(settings.EnableEmbedSandbox);
        Assert.Equal(500, AppSettings.MaxWatchlistItems);
    }
}
