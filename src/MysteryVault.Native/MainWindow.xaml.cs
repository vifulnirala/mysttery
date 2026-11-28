using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Native.Views;

namespace MysteryVault.Native;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        var theme = App.Settings.Theme.Equals("Light", StringComparison.OrdinalIgnoreCase)
            ? ElementTheme.Light
            : ElementTheme.Dark;
        AppNavigation.RequestedTheme = theme;
        ContentFrame.RequestedTheme = theme;
        AppNavigation.SelectedItem = AppNavigation.MenuItems[0];
        ContentFrame.Navigate(typeof(HomePage));
    }

    private async void AppNavigation_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItemContainer?.Tag is not string target) return;
        switch (target)
        {
            case "Home": ContentFrame.Navigate(typeof(HomePage)); break;
            case "Watchlist": ContentFrame.Navigate(typeof(WatchlistPage)); break;
            case "Settings": ContentFrame.Navigate(typeof(SettingsPage)); break;
            case "Theme":
                var nextTheme = AppNavigation.RequestedTheme == ElementTheme.Dark ? ElementTheme.Light : ElementTheme.Dark;
                AppNavigation.RequestedTheme = nextTheme;
                ContentFrame.RequestedTheme = nextTheme;
                App.Settings.Theme = nextTheme == ElementTheme.Light ? "Light" : "Dark";
                await App.SaveSettingsAsync();
                break;
        }
    }
}
