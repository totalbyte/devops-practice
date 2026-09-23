using System.Text;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Relativa.Gateway.Tests;

/// <summary>
/// Hosts the real Gateway in memory and points every YARP cluster at an
/// <see cref="EchoBackend"/>, so tests see exactly what a downstream service would receive.
/// </summary>
public sealed class GatewayFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string JwtSecret = "gateway-tests-signing-key-with-more-than-32-chars";
    public const string JwtIssuer = "relativa-auth";
    public const string JwtAudience = "relativa";
    public const string AllowedOrigin = "http://localhost:3000";

    private static readonly string[] Clusters = ["auth", "core", "graph", "ml", "audit"];

    private EchoBackend? _backend;

    public async Task InitializeAsync()
    {
        _backend = await EchoBackend.StartAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        if (_backend is not null)
        {
            await _backend.DisposeAsync();
        }
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:SecretKey", JwtSecret);
        builder.UseSetting("Jwt:Issuer", JwtIssuer);
        builder.UseSetting("Jwt:Audience", JwtAudience);
        builder.UseSetting("Cors:Origins:0", AllowedOrigin);
        builder.UseSetting("Cors:AllowAnyOriginForDev", "false");

        foreach (var cluster in Clusters)
        {
            builder.UseSetting($"ReverseProxy:Clusters:{cluster}:Destinations:d1:Address", _backend!.Url);
        }
    }

    public static string CreateToken(
        string sub = "42",
        string email = "alice@relativa.com",
        string signingKey = JwtSecret,
        DateTime? expires = null)
    {
        var expiresAt = expires ?? DateTime.UtcNow.AddMinutes(5);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = JwtIssuer,
            Audience = JwtAudience,
            Claims = new Dictionary<string, object> { ["sub"] = sub, ["email"] = email },
            NotBefore = expiresAt.AddMinutes(-30),
            IssuedAt = expiresAt.AddMinutes(-30),
            Expires = expiresAt,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
                SecurityAlgorithms.HmacSha256),
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
