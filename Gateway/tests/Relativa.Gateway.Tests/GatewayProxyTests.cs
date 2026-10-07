using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Relativa.Gateway.Tests;

public sealed class GatewayProxyTests(GatewayFactory factory) : IClassFixture<GatewayFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Health_IsAnonymous()
    {
        var response = await _client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("relativa-gateway", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Version_IsAnonymous_AndReportsInstance()
    {
        var response = await _client.GetAsync("/version");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, string>>();
        Assert.NotNull(body);
        Assert.Equal("relativa-gateway", body["service"]);
        Assert.False(string.IsNullOrEmpty(body["version"]));
        Assert.Equal(Environment.MachineName, body["instance"]);
    }

    [Fact]
    public async Task AggregatedOpenApi_ListsGatewayEndpointsAsAnonymous()
    {
        var spec = await _client.GetFromJsonAsync<System.Text.Json.Nodes.JsonObject>("/openapi/aggregated.json");

        var paths = spec!["paths"]!.AsObject();
        foreach (var path in new[] { "/health", "/version" })
        {
            var operation = paths[path]!["get"]!;
            Assert.Equal("Gateway", operation["tags"]![0]!.GetValue<string>());
            Assert.Empty(operation["security"]!.AsArray());
        }
    }

    [Fact]
    public async Task ProtectedRoute_WithoutToken_Returns401()
    {
        var response = await _client.GetAsync("/core/api/v1/workspaces");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedRoute_WithTokenSignedByAnotherKey_Returns401()
    {
        var token = GatewayFactory.CreateToken(signingKey: "some-other-signing-key-that-is-long-enough!");

        var response = await SendAsync(HttpMethod.Get, "/core/api/v1/workspaces", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedRoute_WithExpiredToken_Returns401()
    {
        var token = GatewayFactory.CreateToken(expires: DateTime.UtcNow.AddHours(-1));

        var response = await SendAsync(HttpMethod.Get, "/core/api/v1/workspaces", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("/auth/api/v1/auth/me", "/api/v1/auth/me")]
    [InlineData("/core/api/v1/workspaces", "/api/v1/workspaces")]
    [InlineData("/graph/api/v1/graph", "/api/v1/graph")]
    [InlineData("/ml/api/ml/score/batch", "/api/ml/score/batch")]
    [InlineData("/audit/audit-log", "/audit-log")]
    public async Task ProtectedRoute_WithValidToken_StripsServicePrefix(string gatewayPath, string downstreamPath)
    {
        var response = await SendAsync(HttpMethod.Get, gatewayPath, GatewayFactory.CreateToken());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var echo = await response.Content.ReadFromJsonAsync<EchoResponse>();
        Assert.Equal(downstreamPath, echo!.Path);
    }

    [Fact]
    public async Task ProtectedRoute_ReplacesSpoofedIdentityHeadersWithTokenClaims()
    {
        var token = GatewayFactory.CreateToken(sub: "42", email: "alice@relativa.com");

        var response = await SendAsync(
            HttpMethod.Get,
            "/core/api/v1/workspaces",
            token,
            ("X-User-Id", "999"),
            ("X-User-Email", "mallory@evil.example"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var echo = await response.Content.ReadFromJsonAsync<EchoResponse>();
        Assert.Equal("42", echo!.Headers["X-User-Id"]);
        Assert.Equal("alice@relativa.com", echo.Headers["X-User-Email"]);
    }

    [Fact]
    public async Task AnonymousRoute_DropsSpoofedIdentityHeaders()
    {
        var response = await SendAsync(
            HttpMethod.Post,
            "/auth/api/v1/auth/login",
            token: null,
            ("X-User-Id", "1"),
            ("X-User-Email", "admin@relativa.com"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var echo = await response.Content.ReadFromJsonAsync<EchoResponse>();
        Assert.Equal("/api/v1/auth/login", echo!.Path);
        Assert.False(echo.Headers.ContainsKey("X-User-Id"));
        Assert.False(echo.Headers.ContainsKey("X-User-Email"));
    }

    [Fact]
    public async Task Cors_AllowsConfiguredOrigin()
    {
        var response = await PreflightAsync(GatewayFactory.AllowedOrigin);

        Assert.True(response.Headers.TryGetValues("Access-Control-Allow-Origin", out var origins));
        Assert.Equal(GatewayFactory.AllowedOrigin, Assert.Single(origins));
    }

    [Fact]
    public async Task Cors_RejectsUnknownOrigin()
    {
        var response = await PreflightAsync("http://evil.example");

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    private Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string path,
        string? token,
        params (string Name, string Value)[] headers)
    {
        var request = new HttpRequestMessage(method, path);
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        foreach (var (name, value) in headers)
        {
            request.Headers.TryAddWithoutValidation(name, value);
        }

        return _client.SendAsync(request);
    }

    private Task<HttpResponseMessage> PreflightAsync(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/core/api/v1/workspaces");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");
        return _client.SendAsync(request);
    }
}
