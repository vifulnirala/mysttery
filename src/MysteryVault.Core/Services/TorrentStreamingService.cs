using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using MonoTorrent;
using MonoTorrent.Client;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public interface ITorrentStreamingService : IAsyncDisposable
{
    event EventHandler<string>? StatusChanged;
    Task<IReadOnlyList<TorrentFileEntry>> GetFilesAsync(string magnetUri, CancellationToken ct = default);
    Task<Uri> StartHttpStreamAsync(string magnetUri, int? fileIndex = null, CancellationToken ct = default);
    Task StopAsync();
}

public sealed partial class TorrentStreamingService : ITorrentStreamingService
{
    private static readonly string[] VideoExtensions = [".mp4", ".mkv", ".webm", ".avi", ".mov"];
    private static readonly HttpClient TorrentDownloadClient = new() { Timeout = TimeSpan.FromSeconds(10) };

    private readonly ICacheManagerService _cache;
    private ClientEngine? _engine;
    private TorrentManager? _activeManager;
    private HttpListener? _listener;
    private CancellationTokenSource? _serverCts;
    private Stream? _activeStream;
    private string _activeMime = "video/mp4";

    public event EventHandler<string>? StatusChanged;

    public TorrentStreamingService(ICacheManagerService cache)
    {
        _cache = cache;
    }

    private ClientEngine GetOrCreateEngine()
    {
        if (_engine is not null) return _engine;
        var cacheDir = _cache.GetCacheDirectory();
        Directory.CreateDirectory(cacheDir);
        var settings = new EngineSettingsBuilder
        {
            CacheDirectory = cacheDir,
            AllowLocalPeerDiscovery = true,
            AllowPortForwarding = true,
            DhtEndPoint = new IPEndPoint(IPAddress.Any, 0)
        }.ToSettings();
        _engine = new ClientEngine(settings);
        return _engine;
    }

    public async Task<IReadOnlyList<TorrentFileEntry>> GetFilesAsync(string magnetUri, CancellationToken ct = default)
    {
        var manager = await PrepareManagerAsync(magnetUri, ct);
        return manager.Files
            .Select((f, idx) => new TorrentFileEntry(idx, f.Path, f.Length))
            .ToList();
    }

    public async Task<Uri> StartHttpStreamAsync(string magnetUri, int? fileIndex = null, CancellationToken ct = default)
    {
        var manager = await PrepareManagerAsync(magnetUri, ct);
        var files = manager.Files;
        if (files.Count == 0)
            throw new InvalidOperationException("Torrent contains no files.");

        var target = fileIndex is int idx && idx >= 0 && idx < files.Count
            ? files[idx]
            : files.OrderByDescending(f => VideoExtensions.Any(ext => f.Path.EndsWith(ext, StringComparison.OrdinalIgnoreCase)) ? 1 : 0)
                   .ThenByDescending(f => f.Length)
                   .First();

        _activeMime = target.Path.EndsWith(".mkv", StringComparison.OrdinalIgnoreCase)
            ? "video/x-matroska"
            : target.Path.EndsWith(".webm", StringComparison.OrdinalIgnoreCase)
                ? "video/webm"
                : "video/mp4";

        StatusChanged?.Invoke(this, $"Starting stream for {Path.GetFileName(target.Path)}...");
        await manager.StartAsync();
        _activeStream = await manager.StreamProvider!.CreateStreamAsync(target, prebuffer: false, ct);

        var port = GetAvailablePort();
        _serverCts = new CancellationTokenSource();
        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        _listener.Start();

        _ = Task.Run(() => ServeLoopAsync(_listener, _activeStream, _activeMime, _serverCts.Token));
        return new Uri($"http://127.0.0.1:{port}/stream");
    }

    private static async Task ServeLoopAsync(HttpListener listener, Stream source, string mime, CancellationToken ct)
    {
        var sync = new SemaphoreSlim(1, 1);
        while (!ct.IsCancellationRequested && listener.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = await listener.GetContextAsync(); }
            catch { break; }

            _ = Task.Run(async () =>
            {
                try
                {
                    var length = source.Length;
                    long start = 0;
                    long end = length - 1;
                    var rangeHeader = ctx.Request.Headers["Range"];
                    var isRange = false;

                    if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase))
                    {
                        isRange = true;
                        var parts = rangeHeader["bytes=".Length..].Split('-');
                        if (long.TryParse(parts[0], out var s)) start = s;
                        if (parts.Length > 1 && long.TryParse(parts[1], out var e)) end = Math.Min(e, length - 1);
                    }

                    var count = Math.Max(0, end - start + 1);
                    ctx.Response.ContentType = mime;
                    ctx.Response.AddHeader("Accept-Ranges", "bytes");
                    ctx.Response.ContentLength64 = count;
                    if (isRange)
                    {
                        ctx.Response.StatusCode = 206;
                        ctx.Response.AddHeader("Content-Range", $"bytes {start}-{end}/{length}");
                    }
                    else
                    {
                        ctx.Response.StatusCode = 200;
                    }

                    var buffer = new byte[64 * 1024];
                    var pos = start;
                    var remaining = count;
                    while (remaining > 0 && !ct.IsCancellationRequested)
                    {
                        var toRead = (int)Math.Min(buffer.Length, remaining);
                        int read;
                        await sync.WaitAsync(ct);
                        try
                        {
                            source.Position = pos;
                            read = await source.ReadAsync(buffer.AsMemory(0, toRead), ct);
                        }
                        finally
                        {
                            sync.Release();
                        }
                        if (read <= 0) break;
                        await ctx.Response.OutputStream.WriteAsync(buffer.AsMemory(0, read), ct);
                        pos += read;
                        remaining -= read;
                    }
                }
                catch { /* client aborted range request */ }
                finally
                {
                    try { ctx.Response.OutputStream.Close(); } catch { }
                }
            }, ct);
        }
    }

    private static int GetAvailablePort()
    {
        using var tcp = new TcpListener(IPAddress.Loopback, 0);
        tcp.Start();
        return ((IPEndPoint)tcp.LocalEndpoint).Port;
    }

    public async Task StopAsync()
    {
        _serverCts?.Cancel();
        try { _listener?.Stop(); _listener?.Close(); } catch { }
        _listener = null;

        if (_activeStream is not null)
        {
            await _activeStream.DisposeAsync();
            _activeStream = null;
        }

        if (_activeManager is not null)
        {
            await _activeManager.StopAsync();
            if (_engine is not null)
                await _engine.RemoveAsync(_activeManager);
            _activeManager = null;
        }
    }

    private async Task<TorrentManager> PrepareManagerAsync(string magnetUri, CancellationToken ct)
    {
        await StopAsync();
        var engine = GetOrCreateEngine();
        var cacheDir = _cache.GetCacheDirectory();

        var hashMatch = BtihRegex().Match(magnetUri);
        if (hashMatch.Success)
        {
            var hash = hashMatch.Groups[1].Value.ToUpperInvariant();
            try
            {
                StatusChanged?.Invoke(this, "Fetching .torrent metadata...");
                var torrentBytes = await TorrentDownloadClient.GetByteArrayAsync($"https://yts.lt/torrent/download/{hash}", ct);
                var torrent = await Torrent.LoadAsync(torrentBytes);
                var mgr = await engine.AddStreamingAsync(torrent, cacheDir);
                _activeManager = mgr;
                return mgr;
            }
            catch
            {
                // Fall back to magnet + DHT/trackers
            }
        }

        StatusChanged?.Invoke(this, "Resolving magnet metadata via peers...");
        var magnet = MagnetLink.Parse(magnetUri);
        var manager = await engine.AddStreamingAsync(magnet, cacheDir);
        _activeManager = manager;
        if (!manager.HasMetadata)
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(25));
            await manager.WaitForMetadataAsync(timeoutCts.Token);
        }
        return manager;
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
        _engine?.Dispose();
        _engine = null;
    }

    [GeneratedRegex("xt=urn:btih:([A-Fa-f0-9]{40})", RegexOptions.IgnoreCase)]
    private static partial Regex BtihRegex();
}
