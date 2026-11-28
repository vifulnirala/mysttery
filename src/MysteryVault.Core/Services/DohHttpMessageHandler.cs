using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using MysteryVault.Core.Configuration;

namespace MysteryVault.Core.Services;

public static class DohHttpClientFactory
{
    public static HttpClient Create(AppSettings settings)
    {
        var handler = new SocketsHttpHandler
        {
            ConnectCallback = async (context, ct) =>
            {
                var host = context.DnsEndPoint.Host;
                var port = context.DnsEndPoint.Port;

                if (IPAddress.TryParse(host, out var directIp))
                    return await ConnectIpAsync(directIp, port, ct);

                var resolved = await ResolveViaDohAsync(settings.DohEndpoint, host, ct);
                if (resolved is not null)
                    return await ConnectIpAsync(resolved, port, ct);

                var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                await socket.ConnectAsync(context.DnsEndPoint, ct);
                return new NetworkStream(socket, ownsSocket: true);
            }
        };
        return new HttpClient(handler);
    }

    private static async Task<NetworkStream> ConnectIpAsync(IPAddress ip, int port, CancellationToken ct)
    {
        var socket = new Socket(ip.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        await socket.ConnectAsync(new IPEndPoint(ip, port), ct);
        return new NetworkStream(socket, ownsSocket: true);
    }

    private static async Task<IPAddress?> ResolveViaDohAsync(string endpoint, string host, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(endpoint)) return null;
        try
        {
            using var dohClient = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{endpoint}?name={Uri.EscapeDataString(host)}&type=A");
            req.Headers.Accept.ParseAdd("application/dns-json");

            using var resp = await dohClient.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (!doc.RootElement.TryGetProperty("Answer", out var answers)) return null;

            foreach (var ans in answers.EnumerateArray())
            {
                if (ans.TryGetProperty("data", out var data) &&
                    IPAddress.TryParse(data.GetString(), out var ip))
                {
                    return ip;
                }
            }
        }
        catch
        {
            // Fall back to system DNS if DoH endpoint is unreachable
        }
        return null;
    }
}
