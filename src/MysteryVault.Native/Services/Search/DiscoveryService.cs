using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using MysteryVault.Native.Models;

namespace MysteryVault.Native.Services.Search;

public sealed class DiscoveryService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly string? _token;

    public DiscoveryService(string? token = null)
    {
        _token = token ?? Environment.GetEnvironmentVariable("TMDB_API_READ_ACCESS_TOKEN");
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("MysteryVault-Native/1.0");
    }

    public Task<IReadOnlyList<MediaSearchResult>> GetTrendingAsync(CancellationToken ct = default) =>
        GetAsync("https://api.themoviedb.org/3/trending/all/week", ct);

    public Task<IReadOnlyList<MediaSearchResult>> GetGenreAsync(int genreId, CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var movie = $"https://api.themoviedb.org/3/discover/movie?with_genres={genreId}&sort_by=popularity.desc&primary_release_date.lte={today}";
        var tv = $"https://api.themoviedb.org/3/discover/tv?with_genres={genreId}&sort_by=popularity.desc";
        return GetCombinedAsync(movie, tv, ct);
    }

    private async Task<IReadOnlyList<MediaSearchResult>> GetCombinedAsync(string movieUrl, string tvUrl, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_token)) return Array.Empty<MediaSearchResult>();
        var movieTask = GetAsync(movieUrl, ct);
        var tvTask = GetAsync(tvUrl, ct);
        var results = await Task.WhenAll(movieTask, tvTask);
        return results.SelectMany(x => x).OrderByDescending(x => x.Rating ?? 0).ToArray();
    }

    private async Task<IReadOnlyList<MediaSearchResult>> GetAsync(string url, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_token)) return Array.Empty<MediaSearchResult>();
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        using var response = await Http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        if (!doc.RootElement.TryGetProperty("results", out var items) || items.ValueKind != JsonValueKind.Array)
            return Array.Empty<MediaSearchResult>();

        var output = new List<MediaSearchResult>();
        foreach (var item in items.EnumerateArray())
        {
            var mediaType = ReadString(item, "media_type") ??
                (item.TryGetProperty("title", out _) ? "movie" : "tv");
            if (mediaType is not ("movie" or "tv")) continue;
            var date = ReadString(item, mediaType == "movie" ? "release_date" : "first_air_date");
            if (mediaType == "movie" && DateTime.TryParse(date, CultureInfo.InvariantCulture, DateTimeStyles.None, out var release) && release.Date > DateTime.UtcNow.Date)
                continue;
            if (!item.TryGetProperty("id", out var idElement) || !idElement.TryGetInt32(out var tmdbId)) continue;
            output.Add(new MediaSearchResult
            {
                Id = $"tmdb:{mediaType}:{tmdbId}",
                TmdbId = tmdbId,
                Title = ReadString(item, mediaType == "movie" ? "title" : "name") ?? "Untitled",
                Overview = ReadString(item, "overview"),
                PosterUrl = ImageUrl(ReadString(item, "poster_path")),
                BackdropUrl = ImageUrl(ReadString(item, "backdrop_path"), "w1280"),
                Provider = "TMDB",
                MediaType = mediaType,
                ReleaseDate = date,
                Rating = ReadDouble(item, "vote_average")
            });
        }
        return output;
    }

    private static string? ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static double? ReadDouble(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : null;

    private static string? ImageUrl(string? path, string size = "w500") =>
        string.IsNullOrWhiteSpace(path) ? null : $"https://image.tmdb.org/t/p/{size}{path}";
}
