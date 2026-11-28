using Microsoft.UI.Xaml;
using MysteryVault.Native.Models;
using MysteryVault.Native.Services.Configuration;

namespace MysteryVault.Native;

public partial class App : Application
{
    private Window? _window;
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MysteryVault",
        "startup.log");

    public static LocalDataStore DataStore { get; } = new();
    public static AppSettings Settings { get; private set; } = new();

    public App()
    {
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            WriteDiagnostic("AppDomain unhandled exception", e.ExceptionObject as Exception);

        TaskScheduler.UnobservedTaskException += (_, e) =>
            WriteDiagnostic("Unobserved task exception", e.Exception);

        try
        {
            WriteDiagnostic("Application constructor entered");
            InitializeComponent();
            UnhandledException += App_UnhandledException;
            WriteDiagnostic("Application XAML initialized");
        }
        catch (Exception ex)
        {
            WriteDiagnostic("Application constructor failed", ex);
            throw;
        }
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            WriteDiagnostic("OnLaunched entered");
            Settings = await DataStore.LoadSettingsAsync();
            WriteDiagnostic("Settings loaded");
            _window = new MainWindow();
            WriteDiagnostic("MainWindow constructed");
            _window.Activate();
            WriteDiagnostic("MainWindow activated");
        }
        catch (Exception ex)
        {
            WriteDiagnostic("OnLaunched failed", ex);
            throw;
        }
    }

    private void App_UnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        WriteDiagnostic("WinUI unhandled exception", e.Exception);
        // Leave the exception unhandled so the runtime retains its normal failure behavior.
    }

    private static void WriteDiagnostic(string stage, Exception? exception = null)
    {
        try
        {
            var directory = Path.GetDirectoryName(LogPath)!;
            Directory.CreateDirectory(directory);
            var details = exception?.ToString() ?? "(no managed exception details)";
            File.AppendAllText(
                LogPath,
                $"[{DateTimeOffset.Now:O}] {stage}{Environment.NewLine}{details}{Environment.NewLine}{Environment.NewLine}");
        }
        catch
        {
            // Diagnostics must never prevent application startup or shutdown.
        }
    }

    public static async Task SaveSettingsAsync(CancellationToken cancellationToken = default)
    {
        await DataStore.SaveSettingsAsync(Settings, cancellationToken);
    }
}
