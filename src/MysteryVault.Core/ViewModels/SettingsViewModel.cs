using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MysteryVault.Core.Configuration;
using MysteryVault.Core.Services;

namespace MysteryVault.Core.ViewModels;

public sealed partial class SettingsViewModel : ObservableObject
{
    private readonly AppSettings _settings;
    private readonly IEmbedProviderService _embeds;
    private readonly ICacheManagerService _cache;

    [ObservableProperty]
    private string _dohEndpoint = string.Empty;

    [ObservableProperty]
    private string _cacheDirectory = string.Empty;

    [ObservableProperty]
    private string _importText = string.Empty;

    [ObservableProperty]
    private string? _statusMessage;

    public ObservableCollection<EmbedServerDefinition> EmbedProviders { get; } = new();

    public SettingsViewModel(
        AppSettings settings,
        IEmbedProviderService embeds,
        ICacheManagerService cache)
    {
        _settings = settings;
        _embeds = embeds;
        _cache = cache;
        _dohEndpoint = settings.DohEndpoint;
        _cacheDirectory = cache.GetCacheDirectory();
    }

    [RelayCommand]
    public async Task LoadAsync(CancellationToken ct = default)
    {
        CacheDirectory = _cache.GetCacheDirectory();
        var list = await _embeds.GetAllAsync(ct);
        EmbedProviders.Clear();
        foreach (var item in list)
            EmbedProviders.Add(item);
    }

    [RelayCommand]
    public void UseAdGuardDns()
    {
        DohEndpoint = AppSettings.DefaultDohEndpoint;
        _settings.DohEndpoint = AppSettings.DefaultDohEndpoint;
        StatusMessage = "DNS-over-HTTPS set to AdGuard DNS.";
    }

    [RelayCommand]
    public void SaveDohEndpoint()
    {
        if (!Uri.TryCreate(DohEndpoint, UriKind.Absolute, out _))
        {
            StatusMessage = "Enter a valid HTTPS DNS-over-HTTPS URL.";
            return;
        }
        _settings.DohEndpoint = DohEndpoint.Trim();
        StatusMessage = "DNS-over-HTTPS endpoint updated.";
    }

    [RelayCommand]
    public async Task ClearCacheAsync(CancellationToken ct = default)
    {
        await _cache.ClearCacheAsync(ct);
        StatusMessage = "Torrent cache cleared.";
    }

    [RelayCommand]
    public async Task ImportServersAsync(CancellationToken ct = default)
    {
        try
        {
            var count = await _embeds.ImportFromTextAsync(ImportText, ".txt", ct);
            ImportText = string.Empty;
            await LoadAsync(ct);
            StatusMessage = $"Imported {count} embed server(s).";
        }
        catch (Exception ex)
        {
            StatusMessage = ex.Message;
        }
    }

    [RelayCommand]
    public async Task DeleteServerAsync(string id, CancellationToken ct = default)
    {
        await _embeds.DeleteAsync(id, ct);
        await LoadAsync(ct);
        StatusMessage = $"Removed server '{id}'.";
    }
}
