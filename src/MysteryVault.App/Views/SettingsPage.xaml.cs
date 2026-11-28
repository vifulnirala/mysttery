using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Core.ViewModels;

namespace MysteryVault.App.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    public SettingsPage()
    {
        ViewModel = App.Current.Services.GetRequiredService<SettingsViewModel>();
        InitializeComponent();
    }

    private async void Page_Loaded(object sender, RoutedEventArgs e)
    {
        await ViewModel.LoadCommand.ExecuteAsync(null);
    }

    private void SaveDoh_Click(object sender, RoutedEventArgs e)
    {
        ViewModel.SaveDohEndpointCommand.Execute(null);
        ShowStatus();
    }

    private void UseAdGuard_Click(object sender, RoutedEventArgs e)
    {
        ViewModel.UseAdGuardDnsCommand.Execute(null);
        ShowStatus();
    }

    private async void ClearCache_Click(object sender, RoutedEventArgs e)
    {
        await ViewModel.ClearCacheCommand.ExecuteAsync(null);
        ShowStatus();
    }

    private async void ImportServers_Click(object sender, RoutedEventArgs e)
    {
        await ViewModel.ImportServersCommand.ExecuteAsync(null);
        ShowStatus();
    }

    private void ShowStatus()
    {
        if (!string.IsNullOrEmpty(ViewModel.StatusMessage))
        {
            StatusInfoBar.Message = ViewModel.StatusMessage;
            StatusInfoBar.IsOpen = true;
        }
    }
}
