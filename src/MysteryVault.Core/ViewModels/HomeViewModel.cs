using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;

namespace MysteryVault.Core.ViewModels;

public sealed partial class HomeViewModel : ObservableObject
{
    private readonly ITmdbClientService _tmdb;
    private readonly ILocalCatalogService _catalog;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _statusMessage;

    public IReadOnlyList<string> QuickSearchChips { get; } =
        ["Scooby-Doo", "Avatar", "Interstellar", "Inception"];

    public ObservableCollection<MediaItem> MidnightShelf { get; } = new();
    public ObservableCollection<MediaItem> Trending { get; } = new();
    public ObservableCollection<MediaItem> MysteryGenre { get; } = new();
    public ObservableCollection<MediaItem> RomanceGenre { get; } = new();
    public ObservableCollection<MediaItem> HorrorGenre { get; } = new();
    public ObservableCollection<MediaItem> AnimationGenre { get; } = new();
    public ObservableCollection<MediaItem> ComedyGenre { get; } = new();

    public HomeViewModel(ITmdbClientService tmdb, ILocalCatalogService catalog)
    {
        _tmdb = tmdb;
        _catalog = catalog;
    }

    [RelayCommand]
    public async Task LoadAsync(CancellationToken ct = default)
    {
        if (IsLoading) return;
        IsLoading = true;
        StatusMessage = "Loading shelves...";
        try
        {
            var midnightTask = _catalog.SearchCatalogAsync(null, ct);
            var trendingTask = _tmdb.GetTrendingAsync(ct);
            var mysteryTask = _tmdb.DiscoverByGenreAsync(9648, ct);
            var romanceTask = _tmdb.DiscoverByGenreAsync(10749, ct);
            var horrorTask = _tmdb.DiscoverByGenreAsync(27, ct);
            var animationTask = _tmdb.DiscoverByGenreAsync(16, ct);
            var comedyTask = _tmdb.DiscoverByGenreAsync(35, ct);

            await Task.WhenAll(midnightTask, trendingTask, mysteryTask, romanceTask, horrorTask, animationTask, comedyTask);

            ReplaceAll(MidnightShelf, midnightTask.Result);
            ReplaceAll(Trending, trendingTask.Result);
            ReplaceAll(MysteryGenre, mysteryTask.Result);
            ReplaceAll(RomanceGenre, romanceTask.Result);
            ReplaceAll(HorrorGenre, horrorTask.Result);
            ReplaceAll(AnimationGenre, animationTask.Result);
            ReplaceAll(ComedyGenre, comedyTask.Result);
            StatusMessage = null;
        }
        catch (Exception ex)
        {
            StatusMessage = $"Could not load home shelves: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    private static void ReplaceAll(ObservableCollection<MediaItem> target, IReadOnlyList<MediaItem> items)
    {
        target.Clear();
        foreach (var item in items)
            target.Add(item);
    }
}
