using System.Text.Json;
using System.Text.Json.Serialization;
using MysteryVault.Native.Models;

namespace MysteryVault.Native.Services.Configuration;

public sealed class LocalDataStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public string RootPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MysteryVault");

    private string SettingsPath => Path.Combine(RootPath, "settings.json");
    private string WatchlistPath => Path.Combine(RootPath, "watchlist.json");

    public async Task<AppSettings> LoadSettingsAsync(CancellationToken cancellationToken = default) =>
        await ReadAsync(SettingsPath, () => new AppSettings(), cancellationToken);

    public Task SaveSettingsAsync(AppSettings settings, CancellationToken cancellationToken = default) =>
        WriteAsync(SettingsPath, settings, cancellationToken);

    public async Task<List<WatchlistEntry>> LoadWatchlistAsync(CancellationToken cancellationToken = default) =>
        await ReadAsync(WatchlistPath, () => new List<WatchlistEntry>(), cancellationToken);

    public Task SaveWatchlistAsync(IReadOnlyCollection<WatchlistEntry> entries, CancellationToken cancellationToken = default) =>
        WriteAsync(WatchlistPath, entries, cancellationToken);

    private async Task<T> ReadAsync<T>(string path, Func<T> fallback, CancellationToken cancellationToken)
    {
        try
        {
            if (!File.Exists(path)) return fallback();
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, cancellationToken) ?? fallback();
        }
        catch (JsonException) { return fallback(); }
        catch (IOException) { return fallback(); }
        catch (UnauthorizedAccessException) { return fallback(); }
    }

    private async Task WriteAsync<T>(string path, T value, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(RootPath);
        var temporary = path + ".tmp";
        await using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true))
        {
            await JsonSerializer.SerializeAsync(stream, value, JsonOptions, cancellationToken);
            await stream.FlushAsync(cancellationToken);
        }
        File.Move(temporary, path, true);
    }
}
