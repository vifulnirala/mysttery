using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Native.Models;
using MysteryVault.Native.Services.Search;

namespace MysteryVault.Native.Views;

public sealed partial class HomePage : Page
{
    private readonly ProviderSearchService _search = new(App.Settings.TmdbReadAccessToken);
    private readonly DiscoveryService _discovery = new();
    private CancellationTokenSource? _searchCancellation;
    private IReadOnlyList<MediaSearchResult> _lastResults = Array.Empty<MediaSearchResult>();

    public HomePage()
    {
        InitializeComponent();
        Loaded += HomePage_Loaded;
    }

    private async void HomePage_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var trendingTask = _discovery.GetTrendingAsync();
            var mysteryTask = _discovery.GetGenreAsync(9648);
            var romanceTask = _discovery.GetGenreAsync(10749);
            var horrorTask = _discovery.GetGenreAsync(27);
            var animationTask = _discovery.GetGenreAsync(16);
            var comedyTask = _discovery.GetGenreAsync(35);
            await Task.WhenAll(trendingTask, mysteryTask, romanceTask, horrorTask, animationTask, comedyTask);

            TrendingItems.ItemsSource = trendingTask.Result;
            MysteryItems.ItemsSource = mysteryTask.Result;
            RomanceItems.ItemsSource = romanceTask.Result;
            HorrorItems.ItemsSource = horrorTask.Result;
            AnimationItems.ItemsSource = animationTask.Result;
            ComedyItems.ItemsSource = comedyTask.Result;

            if (trendingTask.Result.Count == 0)
                StatusText.Text = "Add TMDB_API_READ_ACCESS_TOKEN to your environment to load trending and genre shelves.";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Discovery could not be loaded: {ex.Message}";
        }
    }

    private async void SearchButton_Click(object sender, RoutedEventArgs e)
    {
        var query = SearchBox.Text.Trim();
        if (query.Length == 0)
        {
            StatusText.Text = "Enter a title or torrent query.";
            return;
        }

        _searchCancellation?.Cancel();
        _searchCancellation?.Dispose();
        _searchCancellation = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        StatusText.Text = "Searching TMDB, YTS, APIBay and Internet Archive…";
        SearchButton.IsEnabled = false;
        try
        {
            _lastResults = await _search.SearchAsync(query, 50, _searchCancellation.Token);
            SearchResults.ItemsSource = _lastResults;
            StatusText.Text = $"Found {_lastResults.Count} results. Select a title to save it to your Watchlist.";
        }
        catch (OperationCanceledException)
        {
            StatusText.Text = "Search cancelled or timed out.";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Search failed: {ex.Message}";
        }
        finally
        {
            SearchButton.IsEnabled = true;
        }
    }

    private async void AddToWatchlistButton_Click(object sender, RoutedEventArgs e)
    {
        if (SearchResults.SelectedItem is not MediaSearchResult selected)
        {
            StatusText.Text = "Select a result first.";
            return;
        }

        var entries = await App.DataStore.LoadWatchlistAsync();
        if (entries.Any(x => x.Id == selected.Id))
        {
            StatusText.Text = "This title is already in your Watchlist.";
            return;
        }

        entries.Add(new WatchlistEntry
        {
            Id = selected.Id,
            Title = selected.Title,
            MediaType = selected.MediaType,
            Provider = selected.Provider,
            TmdbId = selected.TmdbId,
            PosterUrl = selected.PosterUrl,
            ReleaseDate = selected.ReleaseDate
        });
        await App.DataStore.SaveWatchlistAsync(entries);
        StatusText.Text = $"Added “{selected.Title}” to your Watchlist.";
    }
}
