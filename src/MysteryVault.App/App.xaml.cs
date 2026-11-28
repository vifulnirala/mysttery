using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using MysteryVault.Core.Configuration;
using MysteryVault.Core.Services;
using MysteryVault.Core.ViewModels;

namespace MysteryVault.App;

public partial class App : Application
{
    private Window? _window;

    public new static App Current => (App)Application.Current;
    public IServiceProvider Services { get; }

    public App()
    {
        InitializeComponent();
        Services = ConfigureServices();
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        var settings = LoadAppSettings();
        services.AddSingleton(settings);
        services.AddSingleton(new HttpClient());

        var appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MysteryVault");
        Directory.CreateDirectory(appDataDir);

        var catalogPath = Path.Combine(AppContext.BaseDirectory, "Assets", "scooby_doo_catalog.json");
        var watchlistPath = Path.Combine(appDataDir, "watchlist.json");

        services.AddSingleton<ITmdbClientService, TmdbClientService>();
        services.AddSingleton<ILocalCatalogService>(_ => new LocalCatalogService(catalogPath));
        services.AddSingleton<ITorrentSearchService, TorrentSearchService>();
        services.AddSingleton<IWatchlistService>(_ => new WatchlistService(watchlistPath));

        services.AddTransient<HomeViewModel>();
        services.AddTransient<SearchViewModel>();
        services.AddTransient<WatchlistViewModel>();

        return services.BuildServiceProvider();
    }

    private static AppSettings LoadAppSettings()
    {
        var prodPath = Path.Combine(AppContext.BaseDirectory, "appsettings.Production.json");
        var devPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        var path = File.Exists(prodPath) ? prodPath : (File.Exists(devPath) ? devPath : null);
        if (path is null) return new AppSettings();

        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
        }
        catch
        {
            return new AppSettings();
        }
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}
