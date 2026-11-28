using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Core.ViewModels;

namespace MysteryVault.App.Views;

public sealed partial class HomePage : Page
{
    public HomeViewModel ViewModel { get; }

    public HomePage()
    {
        ViewModel = App.Current.Services.GetRequiredService<HomeViewModel>();
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
}
