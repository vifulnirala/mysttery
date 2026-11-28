using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;
using MysteryVault.Core.ViewModels;

namespace MysteryVault.App.Views;

public sealed partial class SearchResultsPage : Page
{
    private readonly IWatchlistService _watchlist;
    private readonly ITmdbClientService _tmdb;
    public SearchViewModel ViewModel { get; }

    public SearchResultsPage()
    {
        ViewModel = App.Current.Services.GetRequiredService<SearchViewModel>();
        _watchlist = App.Current.Services.GetRequiredService<IWatchlistService>();
        _tmdb = App.Current.Services.GetRequiredService<ITmdbClientService>();
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is string q && !string.IsNullOrWhiteSpace(q))
        {
            ViewModel.Query = q;
            await RunSearchAsync();
        }
    }

    private async void SearchBox_QuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        ViewModel.Query = args.QueryText;
        await RunSearchAsync();
    }

    private async void SearchButton_Click(object sender, RoutedEventArgs e) => await RunSearchAsync();

    private async Task RunSearchAsync()
    {
        await ViewModel.SearchCommand.ExecuteAsync(null);
        if (!string.IsNullOrEmpty(ViewModel.StatusMessage))
        {
            StatusInfoBar.Message = ViewModel.StatusMessage;
            StatusInfoBar.Severity = InfoBarSeverity.Informational;
            StatusInfoBar.IsOpen = true;
        }
    }

    private async void TitleItem_Click(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is not MediaItem item) return;

        var isTmdb = string.Equals(item.Source, "TMDB", StringComparison.OrdinalIgnoreCase);
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = item.ReleaseYear is int y ? $"{item.Title} ({y})" : item.Title,
            Content = new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(item.Overview) ? $"Source: {item.Source}" : item.Overview,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 440
            },
            PrimaryButtonText = isTmdb ? "Watch Now" : "Search Torrents",
            SecondaryButtonText = "Add to Watchlist",
            CloseButtonText = "Close",
            DefaultButton = ContentDialogButton.Primary
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            if (isTmdb)
            {
                var playbackId = await _tmdb.GetExternalImdbIdAsync(item.Id, item.Type);
                Frame?.Navigate(typeof(PlayerPage), new EmbedPlaybackRequest(item.Title, playbackId, item.Type));
                return;
            }
            ViewModel.Query = item.Title;
            await RunSearchAsync();
        }
        else if (result == ContentDialogResult.Secondary)
        {
            await _watchlist.AddOrUpdateAsync(new WatchlistEntry(
                item.Id, item.Title, item.Type, item.PosterUrl, item.ReleaseYear, DateTimeOffset.UtcNow));
            StatusInfoBar.Message = $"Saved '{item.Title}' to Watchlist.";
            StatusInfoBar.Severity = InfoBarSeverity.Success;
            StatusInfoBar.IsOpen = true;
        }
    }

    private void TorrentItem_Click(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is not TorrentResult torrent) return;
        Frame?.Navigate(typeof(PlayerPage), torrent.MagnetUri);
    }
}
