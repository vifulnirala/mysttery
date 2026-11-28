namespace MysteryVault.Native.Models;

public sealed class WatchlistEntry
{
    public required string Id { get; set; }
    public required string Title { get; set; }
    public string MediaType { get; set; } = "movie";
    public string Provider { get; set; } = "TMDB";
    public int? TmdbId { get; set; }
    public string? PosterUrl { get; set; }
    public string? ReleaseDate { get; set; }
    public DateTime AddedAtUtc { get; set; } = DateTime.UtcNow;
}
