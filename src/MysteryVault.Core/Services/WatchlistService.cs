using System.Text.Json;
using MysteryVault.Core.Configuration;
using MysteryVault.Core.Models;

namespace MysteryVault.Core.Services;

public sealed class WatchlistService : IWatchlistService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _filePath;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public WatchlistService(string filePath)
    {
        _filePath = filePath;
    }

    public async Task<IReadOnlyList<WatchlistEntry>> GetAllAsync(CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            return await ReadInternalAsync(ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task AddOrUpdateAsync(WatchlistEntry entry, CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var items = (await ReadInternalAsync(ct)).ToList();
            items.RemoveAll(x => string.Equals(x.Id, entry.Id, StringComparison.OrdinalIgnoreCase));
            items.Insert(0, entry);
            if (items.Count > AppSettings.MaxWatchlistItems)
                items.RemoveRange(AppSettings.MaxWatchlistItems, items.Count - AppSettings.MaxWatchlistItems);

            await WriteAtomicAsync(items, ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task RemoveAsync(string id, CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var items = (await ReadInternalAsync(ct))
                .Where(x => !string.Equals(x.Id, id, StringComparison.OrdinalIgnoreCase))
                .ToList();
            await WriteAtomicAsync(items, ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task ClearAsync(CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            await WriteAtomicAsync(Array.Empty<WatchlistEntry>(), ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<IReadOnlyList<WatchlistEntry>> ReadInternalAsync(CancellationToken ct)
    {
        if (!File.Exists(_filePath))
            return Array.Empty<WatchlistEntry>();

        await using var stream = File.OpenRead(_filePath);
        var items = await JsonSerializer.DeserializeAsync<List<WatchlistEntry>>(stream, JsonOptions, ct);
        return items ?? new List<WatchlistEntry>();
    }

    private async Task WriteAtomicAsync(IReadOnlyList<WatchlistEntry> items, CancellationToken ct)
    {
        var dir = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        var tempPath = $"{_filePath}.tmp";
        await using (var stream = File.Create(tempPath))
        {
            await JsonSerializer.SerializeAsync(stream, items, JsonOptions, ct);
        }
        File.Move(tempPath, _filePath, overwrite: true);
    }
}
