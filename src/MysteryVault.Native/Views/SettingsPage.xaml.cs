using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace MysteryVault.Native.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsPage()
    {
        InitializeComponent();
        Loaded += SettingsPage_Loaded;
    }

    private void SettingsPage_Loaded(object sender, RoutedEventArgs e)
    {
        DnsEndpointBox.Text = App.Settings.DnsOverHttpsEndpoint;
        SandboxCheckBox.IsChecked = App.Settings.PlayerSandboxEnabled;
    }

    private async void SandboxCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        App.Settings.PlayerSandboxEnabled = SandboxCheckBox.IsChecked == true;
        await App.SaveSettingsAsync();
        SettingsStatus.Text = "Player sandbox preference saved.";
    }
}
