using System.Net.Http.Headers;
using System.Text.Json;
using MysteryVault.Core.Configuration;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public sealed class TmdbClientService : ITmdbClientService
{
    private readonly HttpClient _http;
    private readonly AppSettings _settings;

    public TmdbClientService(HttpClient http, AppSettings settings)
    {
        _http = http;
        _settings = settings;
    }

    public async Task<IReadOnlyList<MediaItem>> SearchTitlesAsync(string query, CancellationToken ct = default)
    {
        var trimmed = query.Trim();
        if (trimmed.Length < 2 || string.IsNullOrWhiteSpace(_settings.TmdbReadAccessToken))
            return Array.Empty<MediaItem>();

        var movieTask = SearchOneAsync("movie", trimmed, ct);
        var tvTask = SearchOneAsync("tv", trimmed, ct);
        await Task.WhenAll(movieTask, tvTask);

        return movieTask.Result
            .Concat(tvTask.Result)
            .OrderByDescending(x => x.Popularity)
            .Take(16)
            .Select(x => x.Item)
            .ToList();
    }

    public async Task<IReadOnlyList<MediaItem>> GetTrendingAsync(CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_settings.TmdbReadAccessToken))
            return Array.Empty<MediaItem>();

        using var doc = await GetJsonAsync("https://api.themoviedb.org/3/trending/all/week?language=en-US", ct);
        if (doc is null || !doc.RootElement.TryGetProperty("results", out var results))
            return Array.Empty<MediaItem>();

        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var list = new List<MediaItem>();
        foreach (var el in results.EnumerateArray())
        {
            var mediaTypeStr = el.TryGetProperty("media_type", out var mt) ? mt.GetString() : null;
            if (mediaTypeStr is not ("movie" or "tv")) continue;
            if (mediaTypeStr == "movie" && IsFutureRelease(el, "release_date", today)) continue;

            list.Add(MapMediaItem(el, mediaTypeStr == "tv" ? MediaType.Tv : MediaType.Movie, "w342"));
            if (list.Count >= 20) break;
        }
        return list;
    }

    public async Task<IReadOnlyList<MediaItem>> DiscoverByGenreAsync(int genreId, CancellationToken ct = default)
    {
        if (genreId < 1 || string.IsNullOrWhiteSpace(_settings.TmdbReadAccessToken))
            return Array.Empty<MediaItem>();

        var movieTask = DiscoverOneAsync("movie", genreId, ct);
        var tvTask = DiscoverOneAsync("tv", genreId, ct);
        await Task.WhenAll(movieTask, tvTask);

        return movieTask.Result
            .Concat(tvTask.Result)
            .OrderByDescending(x => x.Popularity)
            .Take(20)
            .Select(x => x.Item)
            .ToList();
    }

    public async Task<IReadOnlyList<TvSeason>> GetTvSeasonsAsync(string tmdbId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_settings.TmdbReadAccessToken))
            return Array.Empty<TvSeason>();

        using var doc = await GetJsonAsync($"https://api.themoviedb.org/3/tv/{Uri.EscapeDataString(tmdbId)}?language=en-US", ct);
        if (doc is null || !doc.RootElement.TryGetProperty("seasons", out var seasons))
            return Array.Empty<TvSeason>();

        var list = new List<TvSeason>();
        foreach (var s in seasons.EnumerateArray())
        {
            var num = s.TryGetProperty("season_number", out var sn) ? sn.GetInt32() : 0;
            var name = s.TryGetProperty("name", out var nm) ? nm.GetString() ?? $"Season {num}" : $"Season {num}";
            var count = s.TryGetProperty("episode_count", out var ec) ? ec.GetInt32() : 0;
            list.Add(new TvSeason(num, name, count));
        }
        return list;
    }

    public async Task<IReadOnlyList<TvEpisode>> GetTvEpisodesAsync(string tmdbId, int seasonNumber, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_settings.TmdbReadAccessToken))
            return Array.Empty<TvEpisode>();

        using var doc = await GetJsonAsync($"https://api.themoviedb.org/3/tv/{Uri.EscapeDataString(tmdbId)}/season/{seasonNumber}?language=en-US", ct);
        if (doc is null || !doc.RootElement.TryGetProperty("episodes", out var episodes))
            return Array.Empty<TvEpisode>();

        var list = new List<TvEpisode>();
        foreach (var ep in episodes.EnumerateArray())
        {
            var num = ep.TryGetProperty("episode_number", out var en) ? en.GetInt32() : 0;
            var name = ep.TryGetProperty("name", out var nm) ? nm.GetString() ?? "Untitled episode" : "Untitled episode";
            var overview = ep.TryGetProperty("overview", out var ov) ? ov.GetString() : null;
            var still = ep.TryGetProperty("still_path", out var sp) && sp.GetString() is { Length: > 0 } p
                ? $"https://image.tmdb.org/t/p/w300{p}"
                : null;
            list.Add(new TvEpisode(num, name, overview, still));
        }
        return list;
    }

    public async Task<string> GetExternalImdbIdAsync(string tmdbId, MediaType type, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_settings.TmdbReadAccessToken) || !long.TryParse(tmdbId, out _))
            return tmdbId;

        var endpoint = type == MediaType.Tv ? "tv" : "movie";
        using var doc = await GetJsonAsync($"https://api.themoviedb.org/3/{endpoint}/{Uri.EscapeDataString(tmdbId)}/external_ids", ct);
        if (doc is not null &&
            doc.RootElement.TryGetProperty("imdb_id", out var imdb) &&
            imdb.GetString() is { Length: > 0 } imdbId)
        {
            return imdbId;
        }
        return tmdbId;
    }

    private async Task<List<(MediaItem Item, double Popularity)>> SearchOneAsync(string mediaType, string query, CancellationToken ct)
    {
        var url = $"https://api.themoviedb.org/3/search/{mediaType}?query={Uri.EscapeDataString(query)}&include_adult=false&language=en-US&page=1";
        using var doc = await GetJsonAsync(url, ct);
        return ExtractScoredItems(doc, mediaType, 10, "w185");
    }

    private async Task<List<(MediaItem Item, double Popularity)>> DiscoverOneAsync(string mediaType, int genreId, CancellationToken ct)
    {
        var url = $"https://api.themoviedb.org/3/discover/{mediaType}?with_genres={genreId}&sort_by=popularity.desc&include_adult=false&language=en-US&page=1";
        using var doc = await GetJsonAsync(url, ct);
        return ExtractScoredItems(doc, mediaType, 12, "w342");
    }

    private static List<(MediaItem Item, double Popularity)> ExtractScoredItems(JsonDocument? doc, string mediaType, int limit, string posterSize)
    {
        var list = new List<(MediaItem, double)>();
        if (doc is null || !doc.RootElement.TryGetProperty("results", out var results))
            return list;

        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var type = mediaType == "tv" ? MediaType.Tv : MediaType.Movie;

        foreach (var el in results.EnumerateArray())
        {
            if (type == MediaType.Movie && IsFutureRelease(el, "release_date", today)) continue;
            var pop = el.TryGetProperty("popularity", out var p) ? p.GetDouble() : 0d;
            list.Add((MapMediaItem(el, type, posterSize), pop));
            if (list.Count >= limit) break;
        }
        return list;
    }

    private static bool IsFutureRelease(JsonElement el, string prop, string today)
    {
        if (!el.TryGetProperty(prop, out var d)) return false;
        var val = d.GetString();
        return !string.IsNullOrEmpty(val) && string.CompareOrdinal(val, today) > 0;
    }

    private static MediaItem MapMediaItem(JsonElement el, MediaType type, string posterSize)
    {
        var id = el.TryGetProperty("id", out var idEl) ? idEl.ToString() : string.Empty;
        var titleProp = type == MediaType.Movie ? "title" : "name";
        var origProp = type == MediaType.Movie ? "original_title" : "original_name";
        var dateProp = type == MediaType.Movie ? "release_date" : "first_air_date";

        var title = (el.TryGetProperty(titleProp, out var t) ? t.GetString() : null)
                 ?? (el.TryGetProperty(origProp, out var ot) ? ot.GetString() : null)
                 ?? "Untitled";
        var dateStr = el.TryGetProperty(dateProp, out var dt) ? dt.GetString() : null;
        int? year = dateStr is { Length: >= 4 } && int.TryParse(dateStr[..4], out var y) ? y : null;
        var overview = el.TryGetProperty("overview", out var ov) ? ov.GetString() : null;
        var poster = el.TryGetProperty("poster_path", out var pp) && pp.GetString() is { Length: > 0 } pPath
            ? $"https://image.tmdb.org/t/p/{posterSize}{pPath}"
            : null;
        var backdrop = el.TryGetProperty("backdrop_path", out var bp) && bp.GetString() is { Length: > 0 } bPath
            ? $"https://image.tmdb.org/t/p/w780{bPath}"
            : null;
        double? rating = el.TryGetProperty("vote_average", out var va) && va.ValueKind == JsonValueKind.Number
            ? va.GetDouble()
            : null;

        return new MediaItem(id, title, overview, poster, backdrop, year, rating, type, "TMDB");
    }

    private async Task<JsonDocument?> GetJsonAsync(string url, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.TmdbReadAccessToken);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;
            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        }
        catch
        {
            return null;
        }
    }
}
