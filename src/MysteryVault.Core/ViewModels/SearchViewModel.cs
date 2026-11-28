using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;

namespace MysteryVault.Core.ViewModels;

public sealed partial class SearchViewModel : ObservableObject
{
    private readonly ITmdbClientService _tmdb;
    private readonly ILocalCatalogService _catalog;
    private readonly ITorrentSearchService _torrents;

    [ObservableProperty]
    private string _query = string.Empty;

    [ObservableProperty]
    private string _selectedQuality = "All";

    [ObservableProperty]
    private int _pageSize = 24;

    [ObservableProperty]
    private bool _isSearching;

    [ObservableProperty]
    private string? _statusMessage;

    public IReadOnlyList<string> QualityOptions { get; } = ["All", "2160p", "1080p", "720p"];
    public IReadOnlyList<int> PageSizeOptions { get; } = [12, 24, 48];

    public ObservableCollection<MediaItem> TitleResults { get; } = new();
    public ObservableCollection<TorrentResult> TorrentResults { get; } = new();

    public SearchViewModel(
        ITmdbClientService tmdb,
        ILocalCatalogService catalog,
        ITorrentSearchService torrents)
    {
        _tmdb = tmdb;
        _catalog = catalog;
        _torrents = torrents;
    }

    [RelayCommand]
    public async Task SearchAsync(CancellationToken ct = default)
    {
        var q = Query.Trim();
        if (q.Length < 2)
        {
            StatusMessage = "Enter at least two characters to search.";
            return;
        }

        IsSearching = true;
        StatusMessage = $"Searching for "{q}"...";
        try
        {
            var tmdbTask = _tmdb.SearchTitlesAsync(q, ct);
            var catalogTask = _catalog.SearchCatalogAsync(q, ct);
            var qualityFilter = SelectedQuality == "All" ? null : SelectedQuality;
            var torrentTask = _torrents.SearchAsync(q, qualityFilter, PageSize, ct);

            await Task.WhenAll(tmdbTask, catalogTask, torrentTask);

            TitleResults.Clear();
            foreach (var item in catalogTask.Result.Concat(tmdbTask.Result))
                TitleResults.Add(item);

            TorrentResults.Clear();
            foreach (var t in torrentTask.Result)
                TorrentResults.Add(t);

            StatusMessage = $"Found {TitleResults.Count} titles and {TorrentResults.Count} torrent matches.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Search failed: {ex.Message}";
        }
        finally
        {
            IsSearching = false;
        }
    }
}
