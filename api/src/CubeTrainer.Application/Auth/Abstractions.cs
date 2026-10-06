using CubeTrainer.Domain.Users;

namespace CubeTrainer.Application.Auth;

public sealed record AccessToken(string Value, DateTimeOffset ExpiresAt);

public interface IAccessTokenIssuer
{
    AccessToken Issue(AppUser user, Guid sessionId);
}

public sealed record EmailMessage(string ToAddress, string ToName, string Subject, string Html, string Text);

/// <summary>Hands mail to a background sender so a request never waits on (or leaks the timing of) the mail provider.</summary>
public interface IEmailQueue
{
    ValueTask EnqueueAsync(EmailMessage message, CancellationToken ct = default);
}

/// <summary>The transport behind the queue (Brevo in production, a log line in development).</summary>
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public sealed record ClientInfo(string? Ip, string? UserAgent);
