using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using MysteryVault.Core.Configuration;

namespace MysteryVault.App;

public partial class App : Application
{
    private Window? _window;

    public IServiceProvider Services { get; }

    public App()
    {
        InitializeComponent();
        Services = ConfigureServices();
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        services.AddSingleton(new AppSettings());
        return services.BuildServiceProvider();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}
