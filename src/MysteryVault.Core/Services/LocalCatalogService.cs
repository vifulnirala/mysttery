using System.Text.Json;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public sealed class LocalCatalogService : ILocalCatalogService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _catalogPath;
    private readonly string? _thumbCachePath;
    private readonly ITmdbClientService? _tmdb;
    private IReadOnlyList<MediaItem>? _cached;

    public LocalCatalogService(string catalogPath, string? thumbCachePath = null, ITmdbClientService? tmdb = null)
    {
        _catalogPath = catalogPath;
        _thumbCachePath = thumbCachePath;
        _tmdb = tmdb;
    }

    public async Task<IReadOnlyList<MediaItem>> SearchCatalogAsync(string? query = null, CancellationToken ct = default)
    {
        _cached ??= await LoadAndEnrichAsync(ct);
        if (string.IsNullOrWhiteSpace(query))
            return _cached;

        var q = query.Trim();
        return _cached
            .Where(item => item.Title.Contains(q, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    private async Task<IReadOnlyList<MediaItem>> LoadAndEnrichAsync(CancellationToken ct)
    {
        if (!File.Exists(_catalogPath))
            return Array.Empty<MediaItem>();

        var thumbCache = await ReadThumbCacheAsync(ct);
        var thumbCacheDirty = false;

        await using var stream = File.OpenRead(_catalogPath);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (!doc.RootElement.TryGetProperty("items", out var items))
            return Array.Empty<MediaItem>();

        var list = new List<MediaItem>();
        foreach (var el in items.EnumerateArray())
        {
            var id = el.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? Guid.NewGuid().ToString("N") : Guid.NewGuid().ToString("N");
            var title = el.TryGetProperty("title", out var t) ? t.GetString() ?? "Untitled" : "Untitled";
            int? year = el.TryGetProperty("first_release_year", out var y) && y.ValueKind == JsonValueKind.Number ? y.GetInt32() : null;
            var note = el.TryGetProperty("availability_note", out var n) ? n.GetString() : null;
            var kind = el.TryGetProperty("kind", out var k) && k.GetString() == "movie" ? MediaType.Movie : MediaType.Tv;

            thumbCache.TryGetValue(id, out var posterUrl);
            if (string.IsNullOrEmpty(posterUrl) && _tmdb is not null)
            {
                try
                {
                    var hits = await _tmdb.SearchTitlesAsync(title, ct);
                    var best = hits.FirstOrDefault(h => !string.IsNullOrEmpty(h.PosterUrl));
                    if (best?.PosterUrl is { Length: > 0 } fetched)
                    {
                        posterUrl = fetched.Replace("/w185/", "/w342/");
                        thumbCache[id] = posterUrl;
                        thumbCacheDirty = true;
                    }
                }
                catch
                {
                    // Ignore transient TMDB lookup failures for individual thumbnails
                }
            }

            list.Add(new MediaItem(id, title, note, posterUrl, null, year, null, kind, "Catalog"));
        }

        if (thumbCacheDirty)
            await WriteThumbCacheAsync(thumbCache, ct);

        return list;
    }

    private async Task<Dictionary<string, string>> ReadThumbCacheAsync(CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_thumbCachePath) || !File.Exists(_thumbCachePath))
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            await using var stream = File.OpenRead(_thumbCachePath);
            return await JsonSerializer.DeserializeAsync<Dictionary<string, string>>(stream, JsonOptions, ct)
                   ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private async Task WriteThumbCacheAsync(Dictionary<string, string> cache, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_thumbCachePath)) return;
        var dir = Path.GetDirectoryName(_thumbCachePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        await using var stream = File.Create(_thumbCachePath);
        await JsonSerializer.SerializeAsync(stream, cache, JsonOptions, ct);
    }
}
