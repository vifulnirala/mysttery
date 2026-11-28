using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;

namespace MysteryVault.Core.ViewModels;

public sealed partial class WatchlistViewModel : ObservableObject
{
    private readonly IWatchlistService _watchlist;

    [ObservableProperty]
    private bool _isLoading;

    public ObservableCollection<WatchlistEntry> Items { get; } = new();

    public WatchlistViewModel(IWatchlistService watchlist)
    {
        _watchlist = watchlist;
    }

    [RelayCommand]
    public async Task LoadAsync(CancellationToken ct = default)
    {
        IsLoading = true;
        try
        {
            var all = await _watchlist.GetAllAsync(ct);
            Items.Clear();
            foreach (var item in all)
                Items.Add(item);
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task RemoveItemAsync(string id, CancellationToken ct = default)
    {
        await _watchlist.RemoveAsync(id, ct);
        var match = Items.FirstOrDefault(x => string.Equals(x.Id, id, StringComparison.OrdinalIgnoreCase));
        if (match is not null)
            Items.Remove(match);
    }

    [RelayCommand]
    public async Task ClearAllAsync(CancellationToken ct = default)
    {
        await _watchlist.ClearAsync(ct);
        Items.Clear();
    }
}
