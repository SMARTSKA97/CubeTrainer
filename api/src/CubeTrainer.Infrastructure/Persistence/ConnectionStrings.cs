using System.Text;
using Microsoft.Extensions.Configuration;

namespace CubeTrainer.Infrastructure.Persistence;

/// <summary>
/// Turns whatever the host provides into an Npgsql connection string. Neon, Render and Heroku-style
/// hosts hand out a URL (<c>postgresql://user:pass@host/db?sslmode=require</c>); local setups use the
/// key=value form. Both are accepted, from <c>DATABASE_URL</c> or <c>ConnectionStrings:Postgres</c>.
/// </summary>
public static class ConnectionStrings
{
    public static string? Resolve(IConfiguration config)
    {
        var raw = Environment.GetEnvironmentVariable("DATABASE_URL");
        if (string.IsNullOrWhiteSpace(raw)) raw = config.GetConnectionString("Postgres");
        return string.IsNullOrWhiteSpace(raw) ? null : Normalise(raw.Trim());
    }

    public static string Normalise(string raw)
    {
        if (!raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return raw; // already key=value
        }

        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':', 2);
        var user = Uri.UnescapeDataString(userInfo[0]);
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;
        var database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
        var port = uri.Port > 0 ? uri.Port : 5432;

        var sb = new StringBuilder();
        sb.Append($"Host={uri.Host};Port={port};Database={Quote(database)};Username={Quote(user)};Password={Quote(password)}");

        // Hosted Postgres (Neon) only accepts TLS; honour an explicit sslmode=disable for local setups.
        var ssl = "Require";
        foreach (var part in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = part.Split('=', 2);
            if (kv.Length == 2 && kv[0].Equals("sslmode", StringComparison.OrdinalIgnoreCase) &&
                kv[1].Equals("disable", StringComparison.OrdinalIgnoreCase))
            {
                ssl = "Disable";
            }
        }

        sb.Append($";SSL Mode={ssl};Timeout=30;Command Timeout=30;Maximum Pool Size=10");
        return sb.ToString();
    }

    private static string Quote(string v) =>
        v.IndexOfAny([';', '=', '"', '\'']) >= 0 ? "\"" + v.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"" : v;
}
