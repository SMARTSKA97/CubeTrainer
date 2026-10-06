using CubeTrainer.Infrastructure.Persistence;

namespace CubeTrainer.UnitTests;

public class ConnectionStringsTests
{
    [Fact]
    public void Neon_url_becomes_a_tls_connection_string()
    {
        var cs = ConnectionStrings.Normalise("postgresql://neon_user:p%40ss@ep-cool-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require");
        Assert.Contains("Host=ep-cool-123.ap-southeast-1.aws.neon.tech", cs);
        Assert.Contains("Port=5432", cs);
        Assert.Contains("Database=neondb", cs);
        Assert.Contains("Username=neon_user", cs);
        Assert.Contains("Password=p@ss", cs);
        Assert.Contains("SSL Mode=Require", cs);
    }

    [Fact]
    public void Passwords_with_separators_are_quoted()
    {
        var cs = ConnectionStrings.Normalise("postgres://u:a%3Bb@h:6543/d");
        Assert.Contains("Password=\"a;b\"", cs);
        Assert.Contains("Port=6543", cs);
    }

    [Fact]
    public void Sslmode_disable_is_honoured_for_local_setups() =>
        Assert.Contains("SSL Mode=Disable", ConnectionStrings.Normalise("postgres://u:p@localhost/d?sslmode=disable"));

    [Fact]
    public void Key_value_strings_pass_through_untouched()
    {
        const string kv = "Host=db;Database=x;Username=u;Password=p";
        Assert.Equal(kv, ConnectionStrings.Normalise(kv));
    }
}
