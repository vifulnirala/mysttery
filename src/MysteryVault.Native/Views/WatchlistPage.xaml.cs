using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Native.Models;

namespace MysteryVault.Native.Views;

public sealed partial class WatchlistPage : Page
{
    private List<WatchlistEntry> _entries = new();

    public WatchlistPage()
    {
        InitializeComponent();
        Loaded += WatchlistPage_Loaded;
    }

    private async void WatchlistPage_Loaded(object sender, RoutedEventArgs e)
    {
        _entries = await App.DataStore.LoadWatchlistAsync();
        WatchlistItems.ItemsSource = null;
        WatchlistItems.ItemsSource = _entries;
        WatchlistStatus.Text = _entries.Count == 0
            ? "Your Watchlist is empty. Select a search result and add it from Library."
            : $"{_entries.Count} saved title(s). Changes are stored locally.";
    }

    private async void RemoveButton_Click(object sender, RoutedEventArgs e)
    {
        if (WatchlistItems.SelectedItem is not WatchlistEntry selected) return;
        _entries.RemoveAll(x => x.Id == selected.Id);
        await App.DataStore.SaveWatchlistAsync(_entries);
        WatchlistItems.ItemsSource = null;
        WatchlistItems.ItemsSource = _entries.ToList();
        WatchlistStatus.Text = $"{_entries.Count} saved title(s).";
    }
}
