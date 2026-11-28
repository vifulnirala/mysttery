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
    public HomeViewModel ViewModel { get; }

    public HomePage()
    {
        ViewModel = App.Current.Services.GetRequiredService<HomeViewModel>();
        _watchlist = App.Current.Services.GetRequiredService<IWatchlistService>();
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
    {
        NavigateSearch(args.QueryText);
    }

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

        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = item.ReleaseYear is int y ? $"{item.Title} ({y})" : item.Title,
            Content = new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(item.Overview)
                    ? $"Source: {item.Source}"
                    : item.Overview,
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = 420
            },
            PrimaryButtonText = "Find Streams",
            SecondaryButtonText = "Add to Watchlist",
            CloseButtonText = "Close",
            DefaultButton = ContentDialogButton.Primary
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
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
}
