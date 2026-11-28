using Microsoft.UI.Xaml;
using MysteryVault.Native.Views;

namespace MysteryVault.Native;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        ApplyTheme();
        ContentFrame.Navigate(typeof(HomePage));
    }

    private void ApplyTheme()
    {
        var theme = App.Settings.Theme.Equals("Light", StringComparison.OrdinalIgnoreCase)
            ? ElementTheme.Light
            : ElementTheme.Dark;
        RootLayout.RequestedTheme = theme;
        ContentFrame.RequestedTheme = theme;
    }

    private void LibraryButton_Click(object sender, RoutedEventArgs e) =>
        ContentFrame.Navigate(typeof(HomePage));

    private void WatchlistButton_Click(object sender, RoutedEventArgs e) =>
        ContentFrame.Navigate(typeof(WatchlistPage));

    private void SettingsButton_Click(object sender, RoutedEventArgs e) =>
        ContentFrame.Navigate(typeof(SettingsPage));

    private async void ThemeButton_Click(object sender, RoutedEventArgs e)
    {
        App.Settings.Theme = App.Settings.Theme.Equals("Light", StringComparison.OrdinalIgnoreCase)
            ? "Dark"
            : "Light";
        ApplyTheme();
        await App.SaveSettingsAsync();
    }
}
