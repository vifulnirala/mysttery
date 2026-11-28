using System.Text.Json;

namespace MysteryVault.Core.Services;

public sealed class CacheManagerService : ICacheManagerService
{
    private readonly string _configPath;
    private readonly string _defaultCacheDir;

    public CacheManagerService(string appDataDir)
    {
        _configPath = Path.Combine(appDataDir, "torrent-cache-location.json");
        _defaultCacheDir = Path.Combine(appDataDir, "torrent-cache");
    }

    public string GetCacheDirectory()
    {
        if (File.Exists(_configPath))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(_configPath));
                if (doc.RootElement.TryGetProperty("path", out var p) &&
                    p.GetString() is { Length: > 0 } customPath)
                {
                    return customPath;
                }
            }
            catch
            {
                // Fall back to default path if config is unreadable
            }
        }
        return _defaultCacheDir;
    }

    public async Task SetCacheDirectoryAsync(string path, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("Cache directory path cannot be empty.");

        Directory.CreateDirectory(path);
        var dir = Path.GetDirectoryName(_configPath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var payload = JsonSerializer.Serialize(new { path });
        await File.WriteAllTextAsync(_configPath, payload, ct);
    }

    public Task ClearCacheAsync(CancellationToken ct = default)
    {
        var dir = GetCacheDirectory();
        if (Directory.Exists(dir))
        {
            foreach (var file in Directory.EnumerateFiles(dir))
            {
                ct.ThrowIfCancellationRequested();
                try { File.Delete(file); } catch { /* ignore locked files */ }
            }
            foreach (var sub in Directory.EnumerateDirectories(dir))
            {
                ct.ThrowIfCancellationRequested();
                try { Directory.Delete(sub, recursive: true); } catch { /* ignore locked dirs */ }
            }
        }
        return Task.CompletedTask;
    }
}
