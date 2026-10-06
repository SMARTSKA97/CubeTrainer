using System.Text.RegularExpressions;
using CubeTrainer.Application;
using CubeTrainer.Application.Abstractions;
using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Auth.External;
using CubeTrainer.Domain.Users;
using CubeTrainer.Infrastructure.Persistence.InMemory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CubeTrainer.UnitTests;

internal sealed class TestClock : TimeProvider
{
    private DateTimeOffset _now = new(2026, 10, 6, 12, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}

internal sealed class CapturingEmailQueue : IEmailQueue
{
    public List<EmailMessage> Sent { get; } = [];

    public ValueTask EnqueueAsync(EmailMessage message, CancellationToken ct = default)
    {
        Sent.Add(message);
        return ValueTask.CompletedTask;
    }

    /// <summary>The one-time token inside the newest email whose subject contains <paramref name="subject"/>.</summary>
    public string TokenFrom(string subject)
    {
        var mail = Sent.Last(m => m.Subject.Contains(subject, StringComparison.OrdinalIgnoreCase));
        return Regex.Match(mail.Text, @"token=([^\s]+)").Groups[1].Value;
    }
}

internal sealed class FakeAccessTokenIssuer : IAccessTokenIssuer
{
    public AccessToken Issue(AppUser user, Guid sessionId) => new($"access-{user.Id}-{sessionId}", DateTimeOffset.UtcNow.AddMinutes(15));
}

/// <summary>Stands in for Data Protection: a reversible, expiring token (not secret; tests only).</summary>
internal sealed class FakeTicketProtector(TimeProvider clock) : IExternalTicketProtector
{
    private readonly Dictionary<string, (ExternalProfile Profile, DateTimeOffset Expires)> _issued = [];

    public string Protect(ExternalProfile profile, TimeSpan lifetime)
    {
        var ticket = Guid.NewGuid().ToString("N");
        _issued[ticket] = (profile, clock.GetUtcNow().Add(lifetime));
        return ticket;
    }

    public ExternalProfile? Unprotect(string ticket) =>
        _issued.TryGetValue(ticket, out var e) && e.Expires > clock.GetUtcNow() ? e.Profile : null;
}

/// <summary>The real AuthService wired to in-memory repositories, a fake clock and a capturing mailbox.</summary>
internal sealed class AuthFixture
{
    public const string Password = "correct horse battery";

    public AuthFixture(Dictionary<string, string?>? settings = null)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings ?? []).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplication(config);
        services.AddSingleton<TimeProvider>(Clock);
        services.AddSingleton<IUserRepository, InMemoryUserRepository>();
        services.AddSingleton<IRefreshTokenRepository, InMemoryRefreshTokenRepository>();
        services.AddSingleton<IUserTokenRepository, InMemoryUserTokenRepository>();
        services.AddSingleton<IExternalLoginRepository, InMemoryExternalLoginRepository>();
        services.AddSingleton<IExternalTicketProtector, FakeTicketProtector>();
        services.AddSingleton<IAccessTokenIssuer, FakeAccessTokenIssuer>();
        services.AddSingleton<IEmailQueue>(Mail);
        Provider = services.BuildServiceProvider();
        Auth = Provider.GetRequiredService<AuthService>();
        External = Provider.GetRequiredService<ExternalAuthService>();
    }

    public TestClock Clock { get; } = new();

    public CapturingEmailQueue Mail { get; } = new();

    public ServiceProvider Provider { get; }

    public AuthService Auth { get; }

    public ExternalAuthService External { get; }

    public static ClientInfo Client(string agent = "test-agent") => new("203.0.113.9", agent);

    public static RegisterRequest NewUser(string email = "sub@example.com", string handle = "cuber_sub", string password = Password) =>
        new(email, password, "Sub", handle, "IN", 1995, "cfop", "GAN 13", 3, true);

    public async Task<AuthSession> RegisteredAndSignedInAsync(string email = "sub@example.com", string handle = "cuber_sub", string agent = "test-agent")
    {
        var registered = await Auth.RegisterAsync(NewUser(email, handle), default);
        Assert.True(registered.IsSuccess);
        var verified = await Auth.VerifyEmailAsync(Mail.TokenFrom("Confirm your email"), default);
        Assert.True(verified.IsSuccess);
        var session = await Auth.LoginAsync(email, Password, Client(agent), default);
        Assert.True(session.IsSuccess);
        return session.Value!;
    }
}
