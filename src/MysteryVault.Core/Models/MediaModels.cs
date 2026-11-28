namespace MysteryVault.Core.Models;

public enum MediaType
{
    Movie,
    Tv
}

public sealed class MediaItem
{
    public MediaItem() { }

    public MediaItem(
        string id,
        string title,
        string? overview,
        string? posterUrl,
        string? backdropUrl,
        int? releaseYear,
        double? rating,
        MediaType type,
        string source)
    {
        Id = id;
        Title = title;
        Overview = overview;
        PosterUrl = posterUrl;
        BackdropUrl = backdropUrl;
        ReleaseYear = releaseYear;
        Rating = rating;
        Type = type;
        Source = source;
    }

    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Overview { get; set; }
    public string? PosterUrl { get; set; }
    public string? BackdropUrl { get; set; }
    public int? ReleaseYear { get; set; }
    public double? Rating { get; set; }
    public MediaType Type { get; set; }
    public string Source { get; set; } = string.Empty;
}

public sealed record TorrentResult(
    string Title,
    string InfoHash,
    string MagnetUri,
    string Quality,
    string SizeDisplay,
    int Seeds,
    int Peers,
    string Source);

public sealed record TorrentFileEntry(
    int Index,
    string Path,
    long SizeBytes);

public sealed record TvSeason(
    int SeasonNumber,
    string Name,
    int EpisodeCount);

public sealed record TvEpisode(
    int EpisodeNumber,
    string Name,
    string? Overview,
    string? StillUrl);

public sealed record WatchlistEntry(
    string Id,
    string Title,
    MediaType Type,
    string? PosterUrl,
    int? ReleaseYear,
    DateTimeOffset AddedAtUtc);

public sealed record EmbedPlaybackRequest(
    string Title,
    string PlaybackId,
    MediaType Type,
    int Season = 1,
    int Episode = 1,
    string? PreferredProviderId = null);
