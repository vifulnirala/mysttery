namespace MysteryVault.Native.Models;

public sealed record MediaSearchResult
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public string? Overview { get; init; }
    public string? PosterUrl { get; init; }
    public string? BackdropUrl { get; init; }
    public string Provider { get; init; } = "";
    public string MediaType { get; init; } = "movie";
    public string? ReleaseDate { get; init; }
    public int? Year => DateTime.TryParse(ReleaseDate, out var date) ? date.Year : null;
    public double? Rating { get; init; }
    public string? Source { get; init; }
    public int? TmdbId { get; init; }
    public int? SeasonNumber { get; init; }
    public int? EpisodeNumber { get; init; }
    public int? Seeders { get; init; }
    public long? SizeBytes { get; init; }
    public string? Quality { get; init; }
    public bool IsTorrent => !string.IsNullOrWhiteSpace(Source);
}
