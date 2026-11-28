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
        ExtendsContentIntoTitleBar = false;
        DispatcherQueue.TryEnqueue(() =>
        {
            NavView.SelectedItem = NavView.MenuItems[0];
        });
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        try
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
        catch (Exception ex)
        {
            App.LogCrash("NavView_SelectionChanged", ex);
        }
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
