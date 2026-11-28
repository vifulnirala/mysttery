using System.Collections.ObjectModel;
using System.Text.Json;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;

namespace MysteryVault.Core.ViewModels;

public sealed partial class HomeViewModel : ObservableObject
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly ITmdbClientService _tmdb;
    private readonly ILocalCatalogService _catalog;
    private readonly string? _homeCachePath;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _statusMessage;

    public ObservableCollection<MediaItem> MidnightShelf { get; } = new();
    public ObservableCollection<MediaItem> Trending { get; } = new();
    public ObservableCollection<MediaItem> MysteryGenre { get; } = new();
    public ObservableCollection<MediaItem> RomanceGenre { get; } = new();
    public ObservableCollection<MediaItem> HorrorGenre { get; } = new();
    public ObservableCollection<MediaItem> AnimationGenre { get; } = new();
    public ObservableCollection<MediaItem> ComedyGenre { get; } = new();

    public HomeViewModel(ITmdbClientService tmdb, ILocalCatalogService catalog, string? homeCachePath = null)
    {
        _tmdb = tmdb;
        _catalog = catalog;
        _homeCachePath = homeCachePath;
    }

    [RelayCommand]
    public async Task LoadAsync(CancellationToken ct = default)
    {
        if (IsLoading) return;
        IsLoading = true;
        StatusMessage = null;

        await LoadFromCacheAsync(ct);

        var errors = new List<string>();
        try
        {
            var midnightTask = LoadShelfSafelyAsync(() => _catalog.SearchCatalogAsync(null, ct), MidnightShelf, "Midnight Shelf", errors);
            var trendingTask = LoadShelfSafelyAsync(() => _tmdb.GetTrendingAsync(ct), Trending, "Trending", errors);
            var mysteryTask = LoadShelfSafelyAsync(() => _tmdb.DiscoverByGenreAsync(9648, ct), MysteryGenre, "Mystery", errors);
            var romanceTask = LoadShelfSafelyAsync(() => _tmdb.DiscoverByGenreAsync(10749, ct), RomanceGenre, "Romance", errors);
            var horrorTask = LoadShelfSafelyAsync(() => _tmdb.DiscoverByGenreAsync(27, ct), HorrorGenre, "Horror", errors);
            var animationTask = LoadShelfSafelyAsync(() => _tmdb.DiscoverByGenreAsync(16, ct), AnimationGenre, "Animation", errors);
            var comedyTask = LoadShelfSafelyAsync(() => _tmdb.DiscoverByGenreAsync(35, ct), ComedyGenre, "Comedy", errors);

            await Task.WhenAll(midnightTask, trendingTask, mysteryTask, romanceTask, horrorTask, animationTask, comedyTask);
            await SaveToCacheAsync(ct);

            if (errors.Count > 0 && Trending.Count == 0)
                StatusMessage = $"Some shelves could not be loaded: {errors[0]}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    private async Task LoadFromCacheAsync(CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_homeCachePath) || !File.Exists(_homeCachePath)) return;
        try
        {
            await using var stream = File.OpenRead(_homeCachePath);
            var snapshot = await JsonSerializer.DeserializeAsync<HomeCacheSnapshot>(stream, JsonOptions, ct);
            if (snapshot is null) return;

            ApplyIfNotEmpty(MidnightShelf, snapshot.MidnightShelf);
            ApplyIfNotEmpty(Trending, snapshot.Trending);
            ApplyIfNotEmpty(MysteryGenre, snapshot.MysteryGenre);
            ApplyIfNotEmpty(RomanceGenre, snapshot.RomanceGenre);
            ApplyIfNotEmpty(HorrorGenre, snapshot.HorrorGenre);
            ApplyIfNotEmpty(AnimationGenre, snapshot.AnimationGenre);
            ApplyIfNotEmpty(ComedyGenre, snapshot.ComedyGenre);
        }
        catch { /* ignore corrupt cache */ }
    }

    private async Task SaveToCacheAsync(CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_homeCachePath)) return;
        try
        {
            var dir = Path.GetDirectoryName(_homeCachePath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            var snapshot = new HomeCacheSnapshot(
                MidnightShelf.ToList(),
                Trending.ToList(),
                MysteryGenre.ToList(),
                RomanceGenre.ToList(),
                HorrorGenre.ToList(),
                AnimationGenre.ToList(),
                ComedyGenre.ToList());
            await using var stream = File.Create(_homeCachePath);
            await JsonSerializer.SerializeAsync(stream, snapshot, JsonOptions, ct);
        }
        catch { /* ignore cache write errors */ }
    }

    private static void ApplyIfNotEmpty(ObservableCollection<MediaItem> target, List<MediaItem>? items)
    {
        if (items is null || items.Count == 0) return;
        target.Clear();
        foreach (var item in items) target.Add(item);
    }

    private static async Task LoadShelfSafelyAsync(
        Func<Task<IReadOnlyList<MediaItem>>> loader,
        ObservableCollection<MediaItem> target,
        string shelfName,
        List<string> errors)
    {
        try
        {
            var items = await loader();
            if (items.Count == 0 && target.Count > 0) return;
            target.Clear();
            foreach (var item in items)
                target.Add(item);
        }
        catch (Exception ex)
        {
            lock (errors)
            {
                errors.Add($"{shelfName} ({ex.Message})");
            }
        }
    }

    private sealed record HomeCacheSnapshot(
        List<MediaItem> MidnightShelf,
        List<MediaItem> Trending,
        List<MediaItem> MysteryGenre,
        List<MediaItem> RomanceGenre,
        List<MediaItem> HorrorGenre,
        List<MediaItem> AnimationGenre,
        List<MediaItem> ComedyGenre);
}
