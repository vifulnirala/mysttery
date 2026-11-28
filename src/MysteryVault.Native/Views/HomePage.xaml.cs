using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
namespace MysteryVault.Native.Views;
public sealed partial class HomePage : Page
{
    public HomePage() => InitializeComponent();
    private void SearchButton_Click(object sender, RoutedEventArgs e)
    {
        StatusText.Text = string.IsNullOrWhiteSpace(SearchBox.Text)
            ? "Enter a title or torrent query."
            : "Search UI is ready; provider clients are not connected yet.";
    }
}
