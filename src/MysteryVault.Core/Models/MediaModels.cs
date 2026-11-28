namespace MysteryVault.Core.Models;

public enum MediaType
{
    Movie,
    Tv
}

public sealed record MediaItem(
    string Id,
    string Title,
    string? Overview,
    string? PosterUrl,
    string? BackdropUrl,
    int? ReleaseYear,
    double? Rating,
    MediaType Type,
    string Source);

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
