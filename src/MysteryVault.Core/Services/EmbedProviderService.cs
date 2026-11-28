using System.Text.Json;
using System.Text.RegularExpressions;
using MysteryVault.Core.Configuration;

namespace MysteryVault.Core.Services;

public sealed partial class EmbedProviderService : IEmbedProviderService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _storePath;
    private readonly AppSettings _settings;

    public EmbedProviderService(string storePath, AppSettings settings)
    {
        _storePath = storePath;
        _settings = settings;
    }

    public async Task<IReadOnlyList<EmbedServerDefinition>> GetAllAsync(CancellationToken ct = default)
    {
        var list = new List<EmbedServerDefinition>(_settings.DefaultEmbedServers);
        if (File.Exists(_storePath))
        {
            await using var stream = File.OpenRead(_storePath);
            var stored = await JsonSerializer.DeserializeAsync<List<EmbedServerDefinition>>(stream, JsonOptions, ct);
            if (stored is not null)
            {
                foreach (var item in stored)
                {
                    list.RemoveAll(x => string.Equals(x.Id, item.Id, StringComparison.OrdinalIgnoreCase));
                    list.Add(item);
                }
            }
        }
        return list;
    }

    public async Task<int> ImportFromTextAsync(string content, string formatExtension, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(content))
            throw new ArgumentException("Server configuration content is empty.");

        var imported = new List<EmbedServerDefinition>();
        using var reader = new StringReader(content);
        while (reader.ReadLine() is { } rawLine)
        {
            var line = rawLine.Trim();
            if (line.StartsWith('#') || string.IsNullOrWhiteSpace(line)) continue;

            // Support CSV: id,name,movieTemplate,tvTemplate
            if (line.Contains(','))
            {
                var parts = line.Split(',', 4, StringSplitOptions.TrimEntries);
                if (parts.Length >= 3 && SafeIdRegex().IsMatch(parts[0]))
                {
                    var tv = parts.Length == 4 ? parts[3] : parts[2];
                    imported.Add(new EmbedServerDefinition(parts[0], parts[1], parts[2], tv, IsUserImported: true));
                }
            }
            // Support key=value lines: ID=URL_TEMPLATE
            else if (line.Contains('='))
            {
                var eq = line.Split('=', 2, StringSplitOptions.TrimEntries);
                var id = eq[0].ToLowerInvariant();
                if (SafeIdRegex().IsMatch(id) && Uri.TryCreate(eq[1].Replace("{id}", "1"), UriKind.Absolute, out _))
                {
                    imported.Add(new EmbedServerDefinition(id, id.ToUpperInvariant(), eq[1], eq[1], IsUserImported: true));
                }
            }
        }

        if (imported.Count == 0)
            throw new FormatException("No valid embed server entries were found.");

        var existing = (await GetAllAsync(ct)).Where(x => x.IsUserImported).ToList();
        foreach (var item in imported)
        {
            existing.RemoveAll(x => string.Equals(x.Id, item.Id, StringComparison.OrdinalIgnoreCase));
            existing.Add(item);
        }

        await SaveStoredAsync(existing, ct);
        return imported.Count;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        if (!SafeIdRegex().IsMatch(id))
            throw new ArgumentException("Invalid server ID.");

        var existing = (await GetAllAsync(ct)).Where(x => x.IsUserImported).ToList();
        existing.RemoveAll(x => string.Equals(x.Id, id, StringComparison.OrdinalIgnoreCase));
        await SaveStoredAsync(existing, ct);
    }

    private async Task SaveStoredAsync(List<EmbedServerDefinition> items, CancellationToken ct)
    {
        var dir = Path.GetDirectoryName(_storePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        await using var stream = File.Create(_storePath);
        await JsonSerializer.SerializeAsync(stream, items, JsonOptions, ct);
    }

    [GeneratedRegex("^[a-z0-9_-]{1,32}$", RegexOptions.IgnoreCase)]
    private static partial Regex SafeIdRegex();
}
