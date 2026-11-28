using System.Collections.ObjectModel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;

namespace MysteryVault.App.Views;

public sealed partial class LibraryPage : Page
{
    private readonly ILocalCatalogService _catalog;
    public ObservableCollection<MediaItem> Items { get; } = new();

    public LibraryPage()
    {
        _catalog = App.Current.Services.GetRequiredService<ILocalCatalogService>();
        InitializeComponent();
    }

    private async void Page_Loaded(object sender, RoutedEventArgs e)
    {
        var list = await _catalog.SearchCatalogAsync();
        Items.Clear();
        foreach (var item in list)
            Items.Add(item);
    }

    private void CatalogItem_Click(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is not MediaItem item) return;
        Frame?.Navigate(typeof(SearchResultsPage), item.Title);
    }
}
