using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
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
}
