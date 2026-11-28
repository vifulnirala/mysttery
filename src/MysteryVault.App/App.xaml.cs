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
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            LogCrash("AppDomain.UnhandledException", e.ExceptionObject as Exception);
        UnhandledException += (_, e) =>
            LogCrash("Application.UnhandledException", e.Exception);

        InitializeComponent();
        Services = ConfigureServices();
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        var settings = LoadAppSettings();
        services.AddSingleton(settings);
        services.AddSingleton(_ => DohHttpClientFactory.Create(settings));

        var appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MysteryVault");
        Directory.CreateDirectory(appDataDir);

        var catalogPath = Path.Combine(AppContext.BaseDirectory, "Assets", "scooby_doo_catalog.json");
        var thumbCachePath = Path.Combine(appDataDir, "catalog-thumbnails.json");
        var homeCachePath = Path.Combine(appDataDir, "home-cache.json");
        var watchlistPath = Path.Combine(appDataDir, "watchlist.json");
        var embedStorePath = Path.Combine(appDataDir, "embed-servers.json");

        services.AddSingleton<ICacheManagerService>(_ => new CacheManagerService(appDataDir));
        services.AddSingleton<ITmdbClientService, TmdbClientService>();
        services.AddSingleton<ILocalCatalogService>(sp =>
            new LocalCatalogService(catalogPath, thumbCachePath, sp.GetRequiredService<ITmdbClientService>()));
        services.AddSingleton<ITorrentSearchService, TorrentSearchService>();
        services.AddSingleton<IWatchlistService>(_ => new WatchlistService(watchlistPath));
        services.AddSingleton<IEmbedProviderService>(_ => new EmbedProviderService(embedStorePath, settings));
        services.AddSingleton<ITorrentStreamingService, TorrentStreamingService>();

        services.AddTransient(sp => new HomeViewModel(
            sp.GetRequiredService<ITmdbClientService>(),
            sp.GetRequiredService<ILocalCatalogService>(),
            homeCachePath));
        services.AddTransient<SearchViewModel>();
        services.AddTransient<WatchlistViewModel>();
        services.AddTransient<SettingsViewModel>();

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
        try
        {
            _window = new MainWindow();
            _window.Activate();
        }
        catch (Exception ex)
        {
            LogCrash("OnLaunched", ex);
            throw;
        }
    }

    internal static void LogCrash(string source, Exception? ex)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MysteryVault");
            Directory.CreateDirectory(dir);
            var logPath = Path.Combine(dir, "crash.log");
            File.AppendAllText(logPath, $"[{DateTimeOffset.Now:O}] {source}: {ex}\n\n");
        }
        catch
        {
            // Ignore logging errors
        }
    }
}
