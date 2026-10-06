using CubeTrainer.Application.Auth;
using Microsoft.Extensions.Logging;

namespace CubeTrainer.Infrastructure.Email;

/// <summary>Development transport: prints the mail (including its action link) instead of sending it.</summary>
public sealed partial class LoggingEmailSender(ILogger<LoggingEmailSender> log) : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        Log(log, message.ToAddress, message.Subject, message.Text);
        return Task.CompletedTask;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "EMAIL to {To} | {Subject}\n{Text}")]
    private static partial void Log(ILogger logger, string to, string subject, string text);
}
