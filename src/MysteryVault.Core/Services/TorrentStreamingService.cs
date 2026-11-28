using MonoTorrent;
using MonoTorrent.Client;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public interface ITorrentStreamingService : IAsyncDisposable
{
    Task<IReadOnlyList<TorrentFileEntry>> GetFilesAsync(string magnetUri, CancellationToken ct = default);
    Task<Stream> StartStreamAsync(string magnetUri, int fileIndex = 0, CancellationToken ct = default);
    Task StopAsync();
}

public sealed class TorrentStreamingService : ITorrentStreamingService
{
    private readonly ICacheManagerService _cache;
    private ClientEngine? _engine;
    private TorrentManager? _activeManager;

    public TorrentStreamingService(ICacheManagerService cache)
    {
        _cache = cache;
    }

    private ClientEngine GetOrCreateEngine()
    {
        if (_engine is not null) return _engine;
        var cacheDir = _cache.GetCacheDirectory();
        Directory.CreateDirectory(cacheDir);
        var settings = new EngineSettingsBuilder { CacheDirectory = cacheDir }.ToSettings();
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

    public async Task<Stream> StartStreamAsync(string magnetUri, int fileIndex = 0, CancellationToken ct = default)
    {
        var manager = await PrepareManagerAsync(magnetUri, ct);
        var files = manager.Files;
        if (files.Count == 0)
            throw new InvalidOperationException("Torrent contains no files.");

        var target = files[Math.Clamp(fileIndex, 0, files.Count - 1)];
        await manager.StartAsync();
        return await manager.StreamProvider!.CreateStreamAsync(target, prebuffer: true, ct);
    }

    public async Task StopAsync()
    {
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
        var magnet = MagnetLink.Parse(magnetUri);
        var manager = await engine.AddStreamingAsync(magnet, _cache.GetCacheDirectory());
        _activeManager = manager;
        if (!manager.HasMetadata)
            await manager.WaitForMetadataAsync(ct);
        return manager;
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
        _engine?.Dispose();
        _engine = null;
    }
}
