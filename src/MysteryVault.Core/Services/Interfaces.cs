using MysteryVault.Core.Configuration;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public interface ITmdbClientService
{
    Task<IReadOnlyList<MediaItem>> SearchTitlesAsync(string query, CancellationToken ct = default);
    Task<IReadOnlyList<MediaItem>> GetTrendingAsync(CancellationToken ct = default);
    Task<IReadOnlyList<MediaItem>> DiscoverByGenreAsync(int genreId, CancellationToken ct = default);
    Task<IReadOnlyList<TvSeason>> GetTvSeasonsAsync(string tmdbId, CancellationToken ct = default);
    Task<IReadOnlyList<TvEpisode>> GetTvEpisodesAsync(string tmdbId, int seasonNumber, CancellationToken ct = default);
    Task<string> GetExternalImdbIdAsync(string tmdbId, MediaType type, CancellationToken ct = default);
}

public interface ILocalCatalogService
{
    Task<IReadOnlyList<MediaItem>> SearchCatalogAsync(string? query = null, CancellationToken ct = default);
}

public interface ITorrentSearchService
{
    Task<IReadOnlyList<TorrentResult>> SearchAsync(string query, string? quality = null, int pageSize = 24, CancellationToken ct = default);
}

public interface IWatchlistService
{
    Task<IReadOnlyList<WatchlistEntry>> GetAllAsync(CancellationToken ct = default);
    Task AddOrUpdateAsync(WatchlistEntry entry, CancellationToken ct = default);
    Task RemoveAsync(string id, CancellationToken ct = default);
    Task ClearAsync(CancellationToken ct = default);
}

public interface IEmbedProviderService
{
    Task<IReadOnlyList<EmbedServerDefinition>> GetAllAsync(CancellationToken ct = default);
    Task<int> ImportFromTextAsync(string content, string formatExtension, CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
}

public interface ICacheManagerService
{
    string GetCacheDirectory();
    Task SetCacheDirectoryAsync(string path, CancellationToken ct = default);
    Task ClearCacheAsync(CancellationToken ct = default);
}
