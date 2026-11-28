using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using MysteryVault.App.Views;

namespace MysteryVault.App;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(HomePage));
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.IsSettingsSelected)
        {
            ContentFrame.Navigate(typeof(SettingsPage));
            return;
        }
        if (args.SelectedItemContainer is not NavigationViewItem item) return;
        var tag = item.Tag?.ToString();
        if (tag == "library")
            ContentFrame.Navigate(typeof(HomePage));
        else if (tag == "search")
            ContentFrame.Navigate(typeof(SearchResultsPage));
        else if (tag == "watchlist")
            ContentFrame.Navigate(typeof(WatchlistPage));
    }

    private void ThemeToggleItem_Tapped(object sender, TappedRoutedEventArgs e)
    {
        if (Content is FrameworkElement root)
        {
            root.RequestedTheme = root.RequestedTheme == ElementTheme.Dark
                ? ElementTheme.Light
                : ElementTheme.Dark;
        }
    }
}
