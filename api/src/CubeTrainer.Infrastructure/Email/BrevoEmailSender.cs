using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using CubeTrainer.Application.Auth;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Infrastructure.Email;

/// <summary>Brevo transactional email API (POST /v3/smtp/email).</summary>
public sealed class BrevoEmailSender(HttpClient http, IOptions<EmailOptions> options) : IEmailSender
{
    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        var o = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v3/smtp/email")
        {
            Content = JsonContent.Create(new BrevoPayload(
                new BrevoAddress(o.FromAddress, o.FromName),
                [new BrevoAddress(message.ToAddress, message.ToName)],
                message.Subject,
                message.Html,
                message.Text)),
        };
        request.Headers.Add("api-key", o.BrevoApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new HttpRequestException($"Brevo rejected the email ({(int)response.StatusCode}): {body}");
        }
    }

    private sealed record BrevoAddress(string Email, string Name);

    private sealed record BrevoPayload(
        BrevoAddress Sender,
        BrevoAddress[] To,
        string Subject,
        [property: JsonPropertyName("htmlContent")] string HtmlContent,
        [property: JsonPropertyName("textContent")] string TextContent);
}
