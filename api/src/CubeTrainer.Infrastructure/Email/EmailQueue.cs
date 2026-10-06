using System.Threading.Channels;
using CubeTrainer.Application.Auth;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CubeTrainer.Infrastructure.Email;

/// <summary>In-process queue: requests enqueue and return; <see cref="EmailDispatcher"/> delivers with retries.</summary>
public sealed class ChannelEmailQueue : IEmailQueue
{
    private readonly Channel<EmailMessage> _channel = Channel.CreateBounded<EmailMessage>(new BoundedChannelOptions(500)
    {
        FullMode = BoundedChannelFullMode.Wait,
        SingleReader = true,
    });

    public ChannelReader<EmailMessage> Reader => _channel.Reader;

    public ValueTask EnqueueAsync(EmailMessage message, CancellationToken ct = default) => _channel.Writer.WriteAsync(message, ct);
}

public sealed partial class EmailDispatcher(ChannelEmailQueue queue, IEmailSender sender, ILogger<EmailDispatcher> log) : BackgroundService
{
    private static readonly TimeSpan[] Backoff = [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(30)];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var message in queue.Reader.ReadAllAsync(stoppingToken))
        {
            await DeliverAsync(message, stoppingToken);
        }
    }

    private async Task DeliverAsync(EmailMessage message, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                await sender.SendAsync(message, ct);
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (attempt >= Backoff.Length)
                {
                    FailedPermanently(log, ex, message.Subject);
                    return;
                }

                RetryLater(log, attempt + 1, ex.Message);
                await Task.Delay(Backoff[attempt], ct);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Email delivery failed (attempt {Attempt}): {Reason}")]
    private static partial void RetryLater(ILogger logger, int attempt, string reason);

    [LoggerMessage(Level = LogLevel.Error, Message = "Email '{Subject}' could not be delivered and was dropped")]
    private static partial void FailedPermanently(ILogger logger, Exception ex, string subject);
}
