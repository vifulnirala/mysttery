using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using MysteryVault.Core.Configuration;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;
using Windows.Media.Core;
using Windows.System;

namespace MysteryVault.App.Views;

public sealed partial class PlayerPage : Page
{
    private readonly ITorrentStreamingService _streaming;
    private readonly IEmbedProviderService _embeds;
    private EmbedPlaybackRequest? _embedRequest;
    private Uri? _currentEmbedUri;
    private bool _isLoadingServers;

    public PlayerPage()
    {
        _streaming = App.Current.Services.GetRequiredService<ITorrentStreamingService>();
        _embeds = App.Current.Services.GetRequiredService<IEmbedProviderService>();
        _streaming.StatusChanged += (_, msg) =>
            DispatcherQueue.TryEnqueue(() => PlayerStatusText.Text = msg);
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is EmbedPlaybackRequest req)
        {
            _embedRequest = req;
            await InitializeEmbedServersAsync(req);
        }
        else if (e.Parameter is string target)
        {
            if (target.StartsWith("magnet:", StringComparison.OrdinalIgnoreCase))
            {
                await PlayTorrentAsync(target);
            }
            else if (Uri.TryCreate(target, UriKind.Absolute, out var embedUri))
            {
                await PlayEmbedAsync(embedUri);
            }
        }
    }

    private async Task InitializeEmbedServersAsync(EmbedPlaybackRequest req)
    {
        var providers = await _embeds.GetAllAsync();
        if (providers.Count == 0)
        {
            PlayerStatusText.Text = "No embed servers configured. Add one in Settings.";
            return;
        }

        _isLoadingServers = true;
        ServerSelector.ItemsSource = providers;
        ServerSelector.Visibility = Visibility.Visible;
        OpenExternalBtn.Visibility = Visibility.Visible;
        var initial = providers.FirstOrDefault(p => string.Equals(p.Id, req.PreferredProviderId, StringComparison.OrdinalIgnoreCase))
                      ?? providers[0];
        ServerSelector.SelectedItem = initial;
        _isLoadingServers = false;

        await LoadSelectedServerAsync(initial, req);
    }

    private async Task LoadSelectedServerAsync(EmbedServerDefinition provider, EmbedPlaybackRequest req)
    {
        var template = req.Type == MediaType.Tv ? provider.TvUrlTemplate : provider.MovieUrlTemplate;
        var url = template
            .Replace("{id}", Uri.EscapeDataString(req.PlaybackId))
            .Replace("{season}", req.Season.ToString())
            .Replace("{episode}", req.Episode.ToString());

        if (Uri.TryCreate(url, UriKind.Absolute, out var embedUri))
            await PlayEmbedAsync(embedUri, $"{req.Title} · {provider.Name}");
    }

    private async void ServerSelector_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_isLoadingServers || _embedRequest is null) return;
        if (ServerSelector.SelectedItem is EmbedServerDefinition provider)
            await LoadSelectedServerAsync(provider, _embedRequest);
    }

    private async Task PlayTorrentAsync(string magnetUri)
    {
        EmbedWebView.Visibility = Visibility.Collapsed;
        EmbedWebView.IsHitTestVisible = false;
        VideoPlayer.Visibility = Visibility.Visible;
        VideoPlayer.IsHitTestVisible = true;
        PlayerStatusText.Text = "Connecting to peers & fetching torrent metadata...";
        try
        {
            var localStreamUri = await _streaming.StartHttpStreamAsync(magnetUri);
            VideoPlayer.Source = MediaSource.CreateFromUri(localStreamUri);
            VideoPlayer.MediaPlayer.Play();
            PlayerStatusText.Text = $"Streaming via MonoTorrent ({localStreamUri})";
        }
        catch (Exception ex)
        {
            PlayerStatusText.Text = $"Stream error: {ex.Message}";
        }
    }

    private async Task PlayEmbedAsync(Uri embedUri, string? label = null)
    {
        _currentEmbedUri = embedUri;
        VideoPlayer.Visibility = Visibility.Collapsed;
        VideoPlayer.IsHitTestVisible = false;
        EmbedWebView.Visibility = Visibility.Visible;
        EmbedWebView.IsHitTestVisible = true;
        await EmbedWebView.EnsureCoreWebView2Async();
        ApplySandboxSettings();
        EmbedWebView.CoreWebView2.NewWindowRequested += (_, args) =>
        {
            if (SandboxToggle.IsChecked == true)
                args.Handled = true;
        };
        EmbedWebView.Source = embedUri;
        EmbedWebView.Focus(FocusState.Programmatic);
        PlayerStatusText.Text = label ?? $"Embed Player: {embedUri.Host}";
    }

    private void ApplySandboxSettings()
    {
        if (EmbedWebView.CoreWebView2 is null) return;
        EmbedWebView.CoreWebView2.Settings.IsScriptEnabled = true;
        EmbedWebView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
        EmbedWebView.CoreWebView2.Settings.AreWebMessageEnabled = true;
    }

    private void SandboxToggle_Click(object sender, RoutedEventArgs e) => ApplySandboxSettings();

    private async void OpenExternal_Click(object sender, RoutedEventArgs e)
    {
        if (_currentEmbedUri is not null)
            await Launcher.LaunchUriAsync(_currentEmbedUri);
    }

    private async void Back_Click(object sender, RoutedEventArgs e)
    {
        VideoPlayer.MediaPlayer?.Pause();
        await _streaming.StopAsync();
        if (Frame.CanGoBack) Frame.GoBack();
    }
}
