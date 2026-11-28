using Microsoft.UI.Xaml;

namespace MysteryVault.App;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
    }
}
