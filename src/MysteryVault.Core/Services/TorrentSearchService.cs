using System.Text.Json;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public sealed class TorrentSearchService : ITorrentSearchService
{
    private static readonly string[] DefaultTrackers =
    [
        "udp://open.demonii.com:1337/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://tracker.openbittorrent.com:80/announce",
        "udp://p4p.arenabg.com:1337/announce",
        "udp://tracker.torrent.eu.org:451/announce"
    ];

    private readonly HttpClient _http;

    public TorrentSearchService(HttpClient http)
    {
        _http = http;
    }

    public async Task<IReadOnlyList<TorrentResult>> SearchAsync(
        string query,
        string? quality = null,
        int pageSize = 24,
        CancellationToken ct = default)
    {
        var trimmed = query.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return Array.Empty<TorrentResult>();

        var limit = Math.Clamp(pageSize, 1, 50);
        var url = $"https://yts.lt/api/v2/list_movies.json?query_term={Uri.EscapeDataString(trimmed)}&limit={limit}&sort_by=seeds";

        using var resp = await _http.GetAsync(url, ct);
        if (!resp.IsSuccessStatusCode)
            return Array.Empty<TorrentResult>();

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        if (!doc.RootElement.TryGetProperty("data", out var data) ||
            !data.TryGetProperty("movies", out var movies) ||
            movies.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<TorrentResult>();
        }

        var trackerSuffix = string.Join("", DefaultTrackers.Select(tr => $"&tr={Uri.EscapeDataString(tr)}"));
        var results = new List<TorrentResult>();

        foreach (var movie in movies.EnumerateArray())
        {
            var title = movie.TryGetProperty("title_long", out var tl) ? tl.GetString() ?? "Untitled" : "Untitled";
            if (!movie.TryGetProperty("torrents", out var torrents) || torrents.ValueKind != JsonValueKind.Array)
                continue;

            foreach (var t in torrents.EnumerateArray())
            {
                var q = t.TryGetProperty("quality", out var qEl) ? qEl.GetString() ?? "Unknown" : "Unknown";
                if (!string.IsNullOrWhiteSpace(quality) &&
                    !string.Equals(quality, "all", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(q, quality, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var hash = t.TryGetProperty("hash", out var hEl) ? hEl.GetString() ?? string.Empty : string.Empty;
                if (string.IsNullOrWhiteSpace(hash)) continue;

                var size = t.TryGetProperty("size", out var sEl) ? sEl.GetString() ?? "" : "";
                var seeds = t.TryGetProperty("seeds", out var sdEl) ? sdEl.GetInt32() : 0;
                var peers = t.TryGetProperty("peers", out var prEl) ? prEl.GetInt32() : 0;
                var magnet = $"magnet:?xt=urn:btih:{hash}&dn={Uri.EscapeDataString(title)}{trackerSuffix}";

                results.Add(new TorrentResult(title, hash, magnet, q, size, seeds, peers, "YTS"));
            }
        }

        return results
            .OrderByDescending(r => r.Seeds)
            .ThenByDescending(r => r.Peers)
            .Take(limit)
            .ToList();
    }
}
