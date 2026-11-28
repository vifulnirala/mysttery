using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Native.Views;
namespace MysteryVault.Native;
public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        AppNavigation.SelectedItem = AppNavigation.MenuItems[0];
        ContentFrame.Navigate(typeof(HomePage));
    }
    private void AppNavigation_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItemContainer?.Tag is not string target) return;
        switch (target)
        {
            case "Home": ContentFrame.Navigate(typeof(HomePage)); break;
            case "Watchlist": ContentFrame.Navigate(typeof(WatchlistPage)); break;
            case "Settings": ContentFrame.Navigate(typeof(SettingsPage)); break;
            case "Theme":
                RequestedTheme = RequestedTheme == ElementTheme.Dark ? ElementTheme.Light : ElementTheme.Dark;
                break;
        }
    }
}
