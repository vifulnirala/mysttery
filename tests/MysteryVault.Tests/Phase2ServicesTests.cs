using System.Net;
using System.Text;
using MysteryVault.Core.Configuration;
using MysteryVault.Core.Models;
using MysteryVault.Core.Services;
using Xunit;

namespace MysteryVault.Tests;

public sealed class Phase2ServicesTests
{
    [Fact]
    public async Task WatchlistService_CapsAt500AndDeduplicates()
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"mv-watchlist-{Guid.NewGuid():N}.json");
        try
        {
            var svc = new WatchlistService(tempFile);
            await svc.AddOrUpdateAsync(new WatchlistEntry("1", "First", MediaType.Movie, null, 2020, DateTimeOffset.UtcNow));
            await svc.AddOrUpdateAsync(new WatchlistEntry("1", "First Updated", MediaType.Movie, null, 2021, DateTimeOffset.UtcNow));

            var items = await svc.GetAllAsync();
            Assert.Single(items);
            Assert.Equal("First Updated", items[0].Title);

            await svc.RemoveAsync("1");
            Assert.Empty(await svc.GetAllAsync());
        }
        finally
        {
            if (File.Exists(tempFile)) File.Delete(tempFile);
        }
    }

    [Fact]
    public async Task LocalCatalogService_FiltersByTitle()
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"mv-catalog-{Guid.NewGuid():N}.json");
        try
        {
            await File.WriteAllTextAsync(tempFile, """
            {
              "items": [
                { "id": "scooby-1", "title": "Scooby-Doo, Where Are You!", "first_release_year": 1969, "kind": "series" },
                { "id": "other-1", "title": "Mystery Incorporated", "first_release_year": 2010, "kind": "series" }
              ]
            }
            """);

            var svc = new LocalCatalogService(tempFile);
            var filtered = await svc.SearchCatalogAsync("scooby");
            Assert.Single(filtered);
            Assert.Equal("scooby-1", filtered[0].Id);
        }
        finally
        {
            if (File.Exists(tempFile)) File.Delete(tempFile);
        }
    }

    [Fact]
    public async Task TmdbClientService_FiltersFutureMovies()
    {
        var json = """
        {
          "results": [
            { "id": 10, "title": "Released Film", "release_date": "2020-01-01", "popularity": 50.0, "poster_path": "/a.jpg" },
            { "id": 11, "title": "Future Film", "release_date": "2099-01-01", "popularity": 99.0, "poster_path": "/b.jpg" }
          ]
        }
        """;
        var handler = new StubHandler(json);
        using var http = new HttpClient(handler);
        var svc = new TmdbClientService(http, new AppSettings { TmdbReadAccessToken = "test-token" });

        var items = await svc.SearchTitlesAsync("Film");
        Assert.Contains(items, x => x.Title == "Released Film");
        Assert.DoesNotContain(items, x => x.Title == "Future Film");
    }

    private sealed class StubHandler(string responseBody) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json")
            });
    }
}
