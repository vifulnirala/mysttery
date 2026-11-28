using System.Text.Json;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public sealed class LocalCatalogService : ILocalCatalogService
{
    private readonly string _catalogPath;
    private IReadOnlyList<MediaItem>? _cached;

    public LocalCatalogService(string catalogPath)
    {
        _catalogPath = catalogPath;
    }

    public async Task<IReadOnlyList<MediaItem>> SearchCatalogAsync(string? query = null, CancellationToken ct = default)
    {
        _cached ??= await LoadAsync(ct);
        if (string.IsNullOrWhiteSpace(query))
            return _cached;

        var q = query.Trim();
        return _cached
            .Where(item => item.Title.Contains(q, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    private async Task<IReadOnlyList<MediaItem>> LoadAsync(CancellationToken ct)
    {
        if (!File.Exists(_catalogPath))
            return Array.Empty<MediaItem>();

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

            list.Add(new MediaItem(id, title, note, null, null, year, null, kind, "Catalog"));
        }
        return list;
    }
}
