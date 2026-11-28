using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;
using MysteryVault.Core.ViewModels;

namespace MysteryVault.App.Views;

public sealed partial class HomePage : Page
{
    private readonly IWatchlistService _watchlist;
    private readonly ITmdbClientService _tmdb;
    private readonly IEmbedProviderService _embeds;
    public HomeViewModel ViewModel { get; }

    public HomePage()
    {
        ViewModel = App.Current.Services.GetRequiredService<HomeViewModel>();
        _watchlist = App.Current.Services.GetRequiredService<IWatchlistService>();
        _tmdb = App.Current.Services.GetRequiredService<ITmdbClientService>();
        _embeds = App.Current.Services.GetRequiredService<IEmbedProviderService>();
        InitializeComponent();
    }

    private async void Page_Loaded(object sender, RoutedEventArgs e)
    {
        await ViewModel.LoadCommand.ExecuteAsync(null);
        if (!string.IsNullOrEmpty(ViewModel.StatusMessage))
        {
            StatusInfoBar.Message = ViewModel.StatusMessage;
            StatusInfoBar.IsOpen = true;
        }
    }

    private void HeroSearchBox_QuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
        => NavigateSearch(args.QueryText);

    private void QuickChip_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Content is string chip)
            NavigateSearch(chip);
    }

    private void NavigateSearch(string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return;
        Frame?.Navigate(typeof(SearchResultsPage), query);
    }

    private async void MediaItem_Click(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is not MediaItem item) return;

        var isTmdb = string.Equals(item.Source, "TMDB", StringComparison.OrdinalIgnoreCase);
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = item.ReleaseYear is int y ? $"{item.Title} ({y})" : item.Title,
            Content = new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(item.Overview) ? $"Source: {item.Source}" : item.Overview,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 440
            },
            PrimaryButtonText = isTmdb ? "Watch Now" : "Find Streams",
            SecondaryButtonText = "Add to Watchlist",
            CloseButtonText = "Close",
            DefaultButton = ContentDialogButton.Primary
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            if (isTmdb)
                await LaunchEmbedForItemAsync(item);
            else
                NavigateSearch(item.Title);
        }
        else if (result == ContentDialogResult.Secondary)
        {
            await _watchlist.AddOrUpdateAsync(new WatchlistEntry(
                item.Id, item.Title, item.Type, item.PosterUrl, item.ReleaseYear, DateTimeOffset.UtcNow));
            StatusInfoBar.Message = $"Saved '{item.Title}' to Watchlist.";
            StatusInfoBar.Severity = InfoBarSeverity.Success;
            StatusInfoBar.IsOpen = true;
        }
    }

    private async Task LaunchEmbedForItemAsync(MediaItem item)
    {
        int season = 1, episode = 1;
        if (item.Type == MediaType.Tv)
        {
            var picked = await PickEpisodeAsync(item);
            if (picked is null) return;
            (season, episode) = picked.Value;
        }

        var providers = await _embeds.GetAllAsync();
        var provider = providers.FirstOrDefault();
        if (provider is null)
        {
            NavigateSearch(item.Title);
            return;
        }

        var playbackId = await _tmdb.GetExternalImdbIdAsync(item.Id, item.Type);
        var template = item.Type == MediaType.Tv ? provider.TvUrlTemplate : provider.MovieUrlTemplate;
        var url = template
            .Replace("{id}", Uri.EscapeDataString(playbackId))
            .Replace("{season}", season.ToString())
            .Replace("{episode}", episode.ToString());

        Frame?.Navigate(typeof(PlayerPage), url);
    }

    private async Task<(int Season, int Episode)?> PickEpisodeAsync(MediaItem item)
    {
        var seasons = await _tmdb.GetTvSeasonsAsync(item.Id);
        var validSeasons = seasons.Where(s => s.SeasonNumber > 0).ToList();
        if (validSeasons.Count == 0) return (1, 1);

        var seasonBox = new ComboBox
        {
            Header = "Season",
            ItemsSource = validSeasons,
            DisplayMemberPath = "Name",
            SelectedIndex = 0,
            Width = 360
        };
        var episodeBox = new ComboBox
        {
            Header = "Episode",
            DisplayMemberPath = "Name",
            Width = 360
        };

        async Task LoadEpisodesAsync(int seasonNum)
        {
            var eps = await _tmdb.GetTvEpisodesAsync(item.Id, seasonNum);
            episodeBox.ItemsSource = eps;
            if (eps.Count > 0) episodeBox.SelectedIndex = 0;
        }

        seasonBox.SelectionChanged += async (_, _) =>
        {
            if (seasonBox.SelectedItem is TvSeason s)
                await LoadEpisodesAsync(s.SeasonNumber);
        };
        await LoadEpisodesAsync(validSeasons[0].SeasonNumber);

        var picker = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"{item.Title} — Pick Episode",
            Content = new StackPanel { Spacing = 12, Children = { seasonBox, episodeBox } },
            PrimaryButtonText = "Watch Episode",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary
        };

        if (await picker.ShowAsync() != ContentDialogResult.Primary)
            return null;

        var sNum = (seasonBox.SelectedItem as TvSeason)?.SeasonNumber ?? 1;
        var eNum = (episodeBox.SelectedItem as TvEpisode)?.EpisodeNumber ?? 1;
        return (sNum, eNum);
    }
}
