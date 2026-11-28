using MysteryVault.Core.Models;
using MysteryVault.Core.Services;
using MysteryVault.Core.ViewModels;
using Xunit;

namespace MysteryVault.Tests;

public sealed class Phase3ViewModelsTests
{
    [Fact]
    public async Task HomeViewModel_PopulatesMidnightAndTrendingShelves()
    {
        var vm = new HomeViewModel(new FakeTmdbService(), new FakeCatalogService());
        await vm.LoadCommand.ExecuteAsync(null);

        Assert.Single(vm.MidnightShelf);
        Assert.Single(vm.Trending);
        Assert.Null(vm.StatusMessage);
    }

    [Fact]
    public async Task SearchViewModel_RejectsShortQuery()
    {
        var vm = new SearchViewModel(new FakeTmdbService(), new FakeCatalogService(), new FakeTorrentService());
        vm.Query = "a";
        await vm.SearchCommand.ExecuteAsync(null);

        Assert.Equal("Enter at least two characters to search.", vm.StatusMessage);
        Assert.Empty(vm.TitleResults);
    }

    [Fact]
    public async Task SearchViewModel_CombinesCatalogAndTmdbResults()
    {
        var vm = new SearchViewModel(new FakeTmdbService(), new FakeCatalogService(), new FakeTorrentService());
        vm.Query = "Scooby";
        await vm.SearchCommand.ExecuteAsync(null);

        Assert.Equal(2, vm.TitleResults.Count);
        Assert.Single(vm.TorrentResults);
    }

    private sealed class FakeTmdbService : ITmdbClientService
    {
        public Task<IReadOnlyList<MediaItem>> SearchTitlesAsync(string query, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<MediaItem>>([new MediaItem("t1", "TMDB Hit", null, null, null, 2024, 8.0, MediaType.Movie, "TMDB")]);

        public Task<IReadOnlyList<MediaItem>> GetTrendingAsync(CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<MediaItem>>([new MediaItem("t2", "Trending Hit", null, null, null, 2025, 8.5, MediaType.Tv, "TMDB")]);

        public Task<IReadOnlyList<MediaItem>> DiscoverByGenreAsync(int genreId, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<MediaItem>>(Array.Empty<MediaItem>());

        public Task<IReadOnlyList<TvSeason>> GetTvSeasonsAsync(string tmdbId, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<TvSeason>>(Array.Empty<TvSeason>());

        public Task<IReadOnlyList<TvEpisode>> GetTvEpisodesAsync(string tmdbId, int seasonNumber, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<TvEpisode>>(Array.Empty<TvEpisode>());
    }

    private sealed class FakeCatalogService : ILocalCatalogService
    {
        public Task<IReadOnlyList<MediaItem>> SearchCatalogAsync(string? query = null, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<MediaItem>>([new MediaItem("c1", "Scooby-Doo", null, null, null, 1969, null, MediaType.Tv, "Catalog")]);
    }

    private sealed class FakeTorrentService : ITorrentSearchService
    {
        public Task<IReadOnlyList<TorrentResult>> SearchAsync(string query, string? quality = null, int pageSize = 24, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<TorrentResult>>([new TorrentResult("Scooby (1969)", "abc", "magnet:?xt=urn:btih:abc", "1080p", "1.2 GB", 42, 5, "YTS")]);
    }
}
