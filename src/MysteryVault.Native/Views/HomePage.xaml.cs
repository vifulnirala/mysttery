using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Native.Models;
using MysteryVault.Native.Services.Search;

namespace MysteryVault.Native.Views;

public sealed partial class HomePage : Page
{
    private readonly ProviderSearchService _search = new();
    private CancellationTokenSource? _searchCancellation;
    private IReadOnlyList<MediaSearchResult> _lastResults = Array.Empty<MediaSearchResult>();

    public HomePage() => InitializeComponent();

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
