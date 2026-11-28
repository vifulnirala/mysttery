using MysteryVault.Core.Configuration;
using MysteryVault.Core.Services;
using MysteryVault.Core.ViewModels;
using Xunit;

namespace MysteryVault.Tests;

public sealed class Phase4And5Tests
{
    [Fact]
    public async Task EmbedProviderService_ImportsCsvAndDeletesById()
    {
        var store = Path.Combine(Path.GetTempPath(), $"mv-embeds-{Guid.NewGuid():N}.json");
        try
        {
            var svc = new EmbedProviderService(store, new AppSettings { DefaultEmbedServers = [] });
            var count = await svc.ImportFromTextAsync("vidcore,VidCore,https://example.com/movie/{id}", ".csv");
            Assert.Equal(1, count);

            var all = await svc.GetAllAsync();
            Assert.Single(all);
            Assert.Equal("vidcore", all[0].Id);

            await svc.DeleteAsync("vidcore");
            Assert.Empty(await svc.GetAllAsync());
        }
        finally
        {
            if (File.Exists(store)) File.Delete(store);
        }
    }

    [Fact]
    public async Task CacheManagerService_UpdatesAndClearsDirectory()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"mv-cache-root-{Guid.NewGuid():N}");
        var customCache = Path.Combine(tempRoot, "custom-cache");
        try
        {
            var svc = new CacheManagerService(tempRoot);
            await svc.SetCacheDirectoryAsync(customCache);
            Assert.Equal(customCache, svc.GetCacheDirectory());

            var dummyFile = Path.Combine(customCache, "part.bin");
            await File.WriteAllTextAsync(dummyFile, "data");
            Assert.True(File.Exists(dummyFile));

            await svc.ClearCacheAsync();
            Assert.False(File.Exists(dummyFile));
        }
        finally
        {
            if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public void SettingsViewModel_UseAdGuardDnsResetsEndpoint()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"mv-vm-{Guid.NewGuid():N}");
        var settings = new AppSettings { DohEndpoint = "https://custom.example/dns" };
        var vm = new SettingsViewModel(
            settings,
            new EmbedProviderService(Path.Combine(tempRoot, "embeds.json"), settings),
            new CacheManagerService(tempRoot));

        vm.UseAdGuardDnsCommand.Execute(null);
        Assert.Equal(AppSettings.DefaultDohEndpoint, vm.DohEndpoint);
        Assert.Equal(AppSettings.DefaultDohEndpoint, settings.DohEndpoint);
    }
}
