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
    private string _selectedSource = "All clues";

    [ObservableProperty]
    private string _selectedQuality = "All";

    [ObservableProperty]
    private int _pageSize = 24;

    [ObservableProperty]
    private bool _isSearching;

    [ObservableProperty]
    private string? _statusMessage;

    public IReadOnlyList<string> SourceOptions { get; } = ["All clues", "TMDB", "YTS", "Catalog"];
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
        StatusMessage = $"Searching for '{q}'...";
        try
        {
            var runTmdb = SelectedSource is "All clues" or "TMDB";
            var runCatalog = SelectedSource is "All clues" or "Catalog";
            var runYts = SelectedSource is "All clues" or "YTS";

            var tmdbTask = runTmdb ? _tmdb.SearchTitlesAsync(q, ct) : Task.FromResult<IReadOnlyList<MediaItem>>(Array.Empty<MediaItem>());
            var catalogTask = runCatalog ? _catalog.SearchCatalogAsync(q, ct) : Task.FromResult<IReadOnlyList<MediaItem>>(Array.Empty<MediaItem>());
            var qualityFilter = SelectedQuality == "All" ? null : SelectedQuality;
            var torrentTask = runYts ? _torrents.SearchAsync(q, qualityFilter, PageSize, ct) : Task.FromResult<IReadOnlyList<TorrentResult>>(Array.Empty<TorrentResult>());

            await Task.WhenAll(tmdbTask, catalogTask, torrentTask);

            TitleResults.Clear();
            foreach (var item in catalogTask.Result.Concat(tmdbTask.Result))
                TitleResults.Add(item);

            TorrentResults.Clear();
            foreach (var t in torrentTask.Result)
                TorrentResults.Add(t);

            StatusMessage = $"Found {TitleResults.Count} titles and {TorrentResults.Count} torrent matches ({SelectedSource}).";
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
