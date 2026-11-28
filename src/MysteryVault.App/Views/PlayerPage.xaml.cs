using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using MysteryVault.Core.Services;
using Windows.Media.Core;

namespace MysteryVault.App.Views;

public sealed partial class PlayerPage : Page
{
    private readonly ITorrentStreamingService _streaming;

    public PlayerPage()
    {
        _streaming = App.Current.Services.GetRequiredService<ITorrentStreamingService>();
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is string target)
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

    private async Task PlayTorrentAsync(string magnetUri)
    {
        EmbedWebView.Visibility = Visibility.Collapsed;
        VideoPlayer.Visibility = Visibility.Visible;
        PlayerStatusText.Text = "Buffering torrent stream...";
        try
        {
            var stream = await _streaming.StartStreamAsync(magnetUri);
            VideoPlayer.Source = MediaSource.CreateFromStream(stream.AsRandomAccessStream(), "video/mp4");
            VideoPlayer.MediaPlayer.Play();
            PlayerStatusText.Text = "Streaming via MonoTorrent";
        }
        catch (Exception ex)
        {
            PlayerStatusText.Text = $"Stream error: {ex.Message}";
        }
    }

    private async Task PlayEmbedAsync(Uri embedUri)
    {
        VideoPlayer.Visibility = Visibility.Collapsed;
        EmbedWebView.Visibility = Visibility.Visible;
        await EmbedWebView.EnsureCoreWebView2Async();
        ApplySandboxSettings();
        EmbedWebView.CoreWebView2.NewWindowRequested += (_, args) => args.Handled = true;
        EmbedWebView.Source = embedUri;
        PlayerStatusText.Text = $"Embed: {embedUri.Host}";
    }

    private void ApplySandboxSettings()
    {
        if (EmbedWebView.CoreWebView2 is null) return;
        var sandboxed = SandboxToggle.IsChecked == true;
        EmbedWebView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = !sandboxed;
        EmbedWebView.CoreWebView2.Settings.AreDevToolsEnabled = !sandboxed;
    }

    private void SandboxToggle_Click(object sender, RoutedEventArgs e) => ApplySandboxSettings();

    private async void Back_Click(object sender, RoutedEventArgs e)
    {
        VideoPlayer.MediaPlayer?.Pause();
        await _streaming.StopAsync();
        if (Frame.CanGoBack) Frame.GoBack();
    }
}
