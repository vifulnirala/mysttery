using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Native.Models;
using MysteryVault.Native.Services.Search;

namespace MysteryVault.Native.Views;

public sealed partial class HomePage : Page
{
    private readonly ProviderSearchService _search = new();
    private CancellationTokenSource? _searchCancellation;

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
            var results = await _search.SearchAsync(query, 50, _searchCancellation.Token);
            SearchResults.ItemsSource = results.Select(x => $"{x.Provider}  ·  {x.Title}" +
                (x.Year is int year ? $" ({year})" : "")).ToList();
            StatusText.Text = $"Found {results.Count} results.";
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
}
