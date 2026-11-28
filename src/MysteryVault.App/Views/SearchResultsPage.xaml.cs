using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using MysteryVault.Core.ViewModels;

namespace MysteryVault.App.Views;

public sealed partial class SearchResultsPage : Page
{
    public SearchViewModel ViewModel { get; }

    public SearchResultsPage()
    {
        ViewModel = App.Current.Services.GetRequiredService<SearchViewModel>();
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is string q && !string.IsNullOrWhiteSpace(q))
        {
            ViewModel.Query = q;
            await ViewModel.SearchCommand.ExecuteAsync(null);
        }
    }

    private async void SearchBox_QuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        ViewModel.Query = args.QueryText;
        await ViewModel.SearchCommand.ExecuteAsync(null);
    }

    private async void SearchButton_Click(object sender, RoutedEventArgs e)
    {
        await ViewModel.SearchCommand.ExecuteAsync(null);
    }
}
