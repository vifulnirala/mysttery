using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using MysteryVault.Native.Models;

namespace MysteryVault.Native.Services.Search;

public sealed class ProviderSearchService
{
    private static readonly HttpClient Http = CreateClient();
    private readonly string? _tmdbToken;

    public ProviderSearchService(string? tmdbReadAccessToken = null) =>
        _tmdbToken = tmdbReadAccessToken ?? Environment.GetEnvironmentVariable("TMDB_API_READ_ACCESS_TOKEN");

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(18) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("MysteryVault-Native/1.0");
        return client;
    }

    public async Task<IReadOnlyList<MediaSearchResult>> SearchAsync(string query, int limit = 50, CancellationToken cancellationToken = default)
    {
        query = query.Trim();
        if (query.Length == 0) return Array.Empty<MediaSearchResult>();
        limit = Math.Clamp(limit, 1, 50);

        var tasks = new[]
        {
            SafeSearch(() => SearchTmdbAsync(query, limit, cancellationToken)),
            SafeSearch(() => SearchYtsAsync(query, limit, cancellationToken)),
            SafeSearch(() => SearchApiBayAsync(query, limit, cancellationToken)),
            SafeSearch(() => SearchArchiveAsync(query, limit, cancellationToken))
        };
        var results = await Task.WhenAll(tasks);
        return results.SelectMany(x => x)
            .OrderByDescending(x => x.Provider == "TMDB" ? 1 : 0)
            .ThenByDescending(x => x.Seeders ?? 0)
            .ToArray();
    }

    private static async Task<IReadOnlyList<MediaSearchResult>> SafeSearch(Func<Task<IReadOnlyList<MediaSearchResult>>> search)
    {
        try { return await search(); }
        catch (OperationCanceledException) { throw; }
        catch { return Array.Empty<MediaSearchResult>(); }
    }

    private async Task<IReadOnlyList<MediaSearchResult>> SearchTmdbAsync(string query, int limit, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_tmdbToken)) return Array.Empty<MediaSearchResult>();
        using var request = new HttpRequestMessage(HttpMethod.Get,
            "https://api.themoviedb.org/3/search/multi?query=" + Uri.EscapeDataString(query) + "&include_adult=false&page=1");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _tmdbToken);
        using var response = await Http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var output = new List<MediaSearchResult>();
        foreach (var item in doc.RootElement.GetProperty("results").EnumerateArray().Take(limit))
        {
            var type = GetString(item, "media_type");
            if (type is not ("movie" or "tv")) continue;
            var date = GetString(item, type == "movie" ? "release_date" : "first_air_date");
            if (type == "movie" && DateTime.TryParse(date, CultureInfo.InvariantCulture, DateTimeStyles.None, out var release) && release.Date > DateTime.UtcNow.Date)
                continue;
            var id = item.GetProperty("id").GetInt32();
            output.Add(new MediaSearchResult
            {
                Id = $"tmdb:{type}:{id}", TmdbId = id, Title = GetString(item, type == "movie" ? "title" : "name") ?? "Untitled",
                Overview = GetString(item, "overview"), PosterUrl = ImageUrl(GetString(item, "poster_path")),
                BackdropUrl = ImageUrl(GetString(item, "backdrop_path"), "w1280"), Provider = "TMDB",
                MediaType = type, ReleaseDate = date, Rating = GetDouble(item, "vote_average")
            });
        }
        return output;
    }

    private static async Task<IReadOnlyList<MediaSearchResult>> SearchYtsAsync(string query, int limit, CancellationToken ct)
    {
        var url = $"https://yts.lt/api/v2/list_movies.json?query_term={Uri.EscapeDataString(query)}&limit={limit}&sort_by=seeds&order_by=desc";
        using var response = await Http.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        if (GetString(doc.RootElement, "status") != "ok") return Array.Empty<MediaSearchResult>();
        var output = new List<MediaSearchResult>();
        if (!doc.RootElement.GetProperty("data").TryGetProperty("movies", out var movies) || movies.ValueKind != JsonValueKind.Array) return output;
        foreach (var movie in movies.EnumerateArray())
        {
            var title = GetString(movie, "title") ?? "YTS movie";
            var year = GetInt(movie, "year");
            if (!movie.TryGetProperty("torrents", out var torrents) || torrents.ValueKind != JsonValueKind.Array) continue;
            foreach (var torrent in torrents.EnumerateArray())
            {
                var hash = GetString(torrent, "hash");
                if (string.IsNullOrWhiteSpace(hash) || hash.Length != 40) continue;
                var quality = GetString(torrent, "quality") ?? "";
                var name = $"{title} ({year}) {quality}".Trim();
                var magnet = $"magnet:?xt=urn:btih:{hash}&dn={Uri.EscapeDataString(name)}";
                output.Add(new MediaSearchResult
                {
                    Id = "yts:" + hash, Title = name, Provider = "YTS", MediaType = "torrent",
                    ReleaseDate = year?.ToString(CultureInfo.InvariantCulture),
                    PosterUrl = GetString(movie, "medium_cover_image") ?? GetString(movie, "large_cover_image"),
                    Source = magnet, Seeders = GetInt(torrent, "seeds"),
                    SizeBytes = GetLong(torrent, "size_bytes"), Quality = quality
                });
            }
        }
        return output;
    }

    private static async Task<IReadOnlyList<MediaSearchResult>> SearchApiBayAsync(string query, int limit, CancellationToken ct)
    {
        using var response = await Http.GetAsync($"https://apibay.org/q.php?q={Uri.EscapeDataString(query)}&cat=200", ct);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var output = new List<MediaSearchResult>();
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return output;
        foreach (var item in doc.RootElement.EnumerateArray().Take(limit))
        {
            var hash = GetString(item, "info_hash");
            if (string.IsNullOrWhiteSpace(hash) || hash.Length != 40) continue;
            var name = GetString(item, "name") ?? "API Bay result";
            output.Add(new MediaSearchResult
            {
                Id = "apibay:" + hash, Title = name, Provider = "APIBay", MediaType = "torrent",
                Source = $"magnet:?xt=urn:btih:{hash}&dn={Uri.EscapeDataString(name)}",
                Seeders = GetInt(item, "seeders"), SizeBytes = GetLong(item, "size")
            });
        }
        return output;
    }

    private static async Task<IReadOnlyList<MediaSearchResult>> SearchArchiveAsync(string query, int limit, CancellationToken ct)
    {
        var terms = string.Join(" AND ", query.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => "title:\"" + x.Replace("\"", "") + "\""));
        if (terms.Length == 0) return Array.Empty<MediaSearchResult>();
        var url = "https://archive.org/advancedsearch.php?q=" + Uri.EscapeDataString(terms + " AND mediatype:(movies)") +
                  "&fl[]=identifier,title,year&rows=" + limit + "&page=1&output=json";
        using var response = await Http.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var output = new List<MediaSearchResult>();
        if (!doc.RootElement.TryGetProperty("response", out var result) || !result.TryGetProperty("docs", out var docs)) return output;
        foreach (var item in docs.EnumerateArray())
        {
            var identifier = GetString(item, "identifier");
            if (string.IsNullOrWhiteSpace(identifier)) continue;
            output.Add(new MediaSearchResult
            {
                Id = "archive:" + identifier, Title = GetString(item, "title") ?? identifier,
                Provider = "Internet Archive", MediaType = "torrent", ReleaseDate = GetString(item, "year"),
                PosterUrl = $"https://archive.org/services/img/{identifier}",
                Source = $"https://archive.org/download/{identifier}/{identifier}_archive.torrent"
            });
        }
        return output;
    }

    private static string? GetString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() :
        element.TryGetProperty(name, out value) && value.ValueKind == JsonValueKind.Number ? value.ToString() : null;
    private static int? GetInt(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : null;
    private static long? GetLong(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt64(out var number) ? number : null;
    private static double? GetDouble(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : null;
    private static string? ImageUrl(string? path, string size = "w500") =>
        string.IsNullOrWhiteSpace(path) ? null : $"https://image.tmdb.org/t/p/{size}{path}";
}
