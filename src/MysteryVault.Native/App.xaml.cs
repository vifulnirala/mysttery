using Microsoft.UI.Xaml;
using MysteryVault.Native.Models;
using MysteryVault.Native.Services.Configuration;

namespace MysteryVault.Native;

public partial class App : Application
{
    private Window? _window;
    public static LocalDataStore DataStore { get; } = new();
    public static AppSettings Settings { get; private set; } = new();

    public App() => InitializeComponent();

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        Settings = await DataStore.LoadSettingsAsync();
        _window = new MainWindow();
        _window.Activate();
    }

    public static async Task SaveSettingsAsync(CancellationToken cancellationToken = default)
    {
        await DataStore.SaveSettingsAsync(Settings, cancellationToken);
    }
}
