using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Core.Models;
using MysteryVault.Core.ViewModels;

namespace MysteryVault.App.Views;

public sealed partial class WatchlistPage : Page
{
    public WatchlistViewModel ViewModel { get; }

    public WatchlistPage()
    {
        ViewModel = App.Current.Services.GetRequiredService<WatchlistViewModel>();
        InitializeComponent();
    }

    private async void Page_Loaded(object sender, RoutedEventArgs e)
    {
        await ViewModel.LoadCommand.ExecuteAsync(null);
    }

    private async void ClearAll_Click(object sender, RoutedEventArgs e)
    {
        await ViewModel.ClearAllCommand.ExecuteAsync(null);
    }

    private async void WatchlistItem_Click(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is not WatchlistEntry entry) return;

        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = entry.Title,
            Content = "Search for streams or remove this title from your watchlist?",
            PrimaryButtonText = "Find Streams",
            SecondaryButtonText = "Remove",
            CloseButtonText = "Close",
            DefaultButton = ContentDialogButton.Primary
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            Frame?.Navigate(typeof(SearchResultsPage), entry.Title);
        }
        else if (result == ContentDialogResult.Secondary)
        {
            await ViewModel.RemoveItemCommand.ExecuteAsync(entry.Id);
        }
    }
}
