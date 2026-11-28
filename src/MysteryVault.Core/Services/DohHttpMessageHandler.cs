using System.Net.Security;
using System.Security.Authentication;
using MysteryVault.Core.Configuration;

namespace MysteryVault.Core.Services;

public static class DohHttpClientFactory
{
    public static HttpClient Create(AppSettings settings)
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            SslOptions = new SslClientAuthenticationOptions
            {
                EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13
            }
        };
        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
    }
}
