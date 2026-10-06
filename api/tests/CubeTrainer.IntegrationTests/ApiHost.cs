using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using CubeTrainer.Application.Auth;
using CubeTrainer.Application.Auth.External;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CubeTrainer.IntegrationTests;

/// <summary>Boots the real API with a captured mailbox and hands out signed-in clients (one fresh account each).</summary>
public sealed class ApiHost
{
    private const string Password = "correct horse battery";
    private readonly Mailbox _mail = new();
    private readonly WebApplicationFactory<Program> _factory;
    private int _n;

    public ApiHost(WebApplicationFactory<Program> factory) =>
        _factory = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Development");
            b.UseSetting("Auth:CheckBreachedPasswords", "false");
            b.UseSetting("RateLimiting:AuthPermitPerMinute", "1000");
            b.ConfigureServices(s =>
            {
                s.Replace(ServiceDescriptor.Singleton<IEmailQueue>(_mail));
                s.Replace(ServiceDescriptor.Singleton<IOAuthGateway>(new FakeGateway()));
            });
        });

    public HttpClient Anonymous() => _factory.CreateClient();

    /// <summary>For redirect flows: hands back the 302 itself and keeps cookies between requests.</summary>
    public HttpClient Browser() => _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });

    public async Task<HttpClient> SignedInAsync()
    {
        var id = Interlocked.Increment(ref _n);
        var email = $"user{id}_{Guid.NewGuid():N}@example.com";
        var handle = $"u{id}_{Guid.NewGuid():N}"[..16];
        var http = _factory.CreateClient();
        var reg = await http.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email, password = Password, displayName = "Cuber", handle, country = "IN", birthYear = 1995, acceptTerms = true,
        });
        Assert.Equal(HttpStatusCode.Accepted, reg.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await http.PostAsJsonAsync("/api/v1/auth/verify-email", new { token = _mail.TokenFor(email) })).StatusCode);
        var login = await http.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http;
    }

    /// <summary>A provider that always says the person is social@example.com, so the HTTP flow can be tested without the internet.</summary>
    private sealed class FakeGateway : IOAuthGateway
    {
        public IReadOnlyList<ProviderInfo> EnabledProviders { get; } = [new("google", "Google")];

        public bool IsEnabled(string provider) => provider == "google";

        public OAuthStart BuildStart(string provider, string redirectUri) => new($"https://idp.test/authorize?redirect_uri={Uri.EscapeDataString(redirectUri)}", "state-123", "verifier-456");

        public Task<ExternalProfile?> ExchangeAsync(string provider, string code, string redirectUri, string codeVerifier, CancellationToken ct) =>
            Task.FromResult<ExternalProfile?>(code == "good" && codeVerifier == "verifier-456" ? new ExternalProfile("google", "sub-it-1", "social@example.com", true, "Social Person") : null);
    }

    private sealed class Mailbox : IEmailQueue
    {
        private readonly List<EmailMessage> _sent = [];

        public ValueTask EnqueueAsync(EmailMessage message, CancellationToken ct = default)
        {
            lock (_sent) _sent.Add(message);
            return ValueTask.CompletedTask;
        }

        public string TokenFor(string to)
        {
            lock (_sent)
            {
                var mail = _sent.Last(m => m.ToAddress == to && m.Subject.Contains("Confirm your email", StringComparison.OrdinalIgnoreCase));
                return Regex.Match(mail.Text, @"token=([^\s]+)").Groups[1].Value;
            }
        }
    }
}
