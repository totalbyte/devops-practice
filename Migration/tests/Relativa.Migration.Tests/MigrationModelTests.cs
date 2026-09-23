using Microsoft.EntityFrameworkCore;

using Relativa.Migration.Data;

namespace Relativa.Migration.Tests;

/// <summary>
/// Offline checks of the EF Core model against the committed migrations.
/// No database is needed: the Npgsql provider is configured only to build the model.
/// </summary>
public sealed class MigrationModelTests
{
    private static MigrationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<MigrationDbContext>()
            .UseNpgsql(
                "Host=localhost;Database=model-only",
                b => b.MigrationsAssembly("Relativa.Migration"))
            .Options;

        return new MigrationDbContext(options);
    }

    [Fact]
    public void Model_HasNoChangesMissingAMigration()
    {
        using var context = CreateContext();

        // Fails when an entity/configuration in Persistence was changed without
        // running `dotnet ef migrations add` in the Migration project.
        Assert.False(
            context.Database.HasPendingModelChanges(),
            "The EF model differs from the latest migration snapshot. Add a migration in Migration/.");
    }

    [Fact]
    public void Migrations_AreDiscoveredInChronologicalOrder()
    {
        using var context = CreateContext();

        var migrations = context.Database.GetMigrations().ToList();

        Assert.NotEmpty(migrations);
        Assert.EndsWith("_InitialCreate", migrations[0]);
        Assert.Equal(migrations.Order(StringComparer.Ordinal), migrations);
        Assert.Equal(migrations.Count, migrations.Distinct().Count());
    }
}
