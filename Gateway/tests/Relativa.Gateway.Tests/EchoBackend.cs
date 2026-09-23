using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Relativa.Gateway.Tests;

/// <summary>What the downstream service received from the Gateway.</summary>
public sealed record EchoResponse(string Method, string Path, Dictionary<string, string> Headers);

/// <summary>
/// Minimal Kestrel server on a random port that replies with the request it received.
/// Stands in for Auth/Core/Graph/ML/Audit behind the Gateway.
/// </summary>
public sealed class EchoBackend : IAsyncDisposable
{
    private readonly WebApplication _app;

    private EchoBackend(WebApplication app, string url)
    {
        _app = app;
        Url = url;
    }

    public string Url { get; }

    public static async Task<EchoBackend> StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();

        var app = builder.Build();
        app.Run(async context =>
        {
            var headers = context.Request.Headers.ToDictionary(
                h => h.Key,
                h => h.Value.ToString(),
                StringComparer.OrdinalIgnoreCase);

            await context.Response.WriteAsJsonAsync(
                new EchoResponse(context.Request.Method, context.Request.Path, headers));
        });

        await app.StartAsync();
        return new EchoBackend(app, app.Urls.First().TrimEnd('/') + "/");
    }

    public async ValueTask DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
