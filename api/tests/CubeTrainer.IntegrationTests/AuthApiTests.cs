using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using CubeTrainer.Application.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CubeTrainer.IntegrationTests;

/// <summary>Sign-up to sign-out through the real HTTP pipeline, with the mailbox captured instead of sent.</summary>
public sealed class AuthApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Password = "correct horse battery";
    private readonly Mailbox _mail = new();
    private readonly HttpClient _http;

    public AuthApiTests(WebApplicationFactory<Program> factory) =>
        _http = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Development");
            b.UseSetting("Auth:CheckBreachedPasswords", "false"); // no outbound calls in tests
            b.UseSetting("RateLimiting:AuthPermitPerMinute", "1000");
            b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IEmailQueue>(_mail)));
        }).CreateClient();

    private sealed class Mailbox : IEmailQueue
    {
        public List<EmailMessage> Sent { get; } = [];

        public ValueTask EnqueueAsync(EmailMessage message, CancellationToken ct = default)
        {
            lock (Sent) Sent.Add(message);
            return ValueTask.CompletedTask;
        }

        public string TokenFor(string to, string subject)
        {
            lock (Sent)
            {
                var mail = Sent.Last(m => m.ToAddress == to && m.Subject.Contains(subject, StringComparison.OrdinalIgnoreCase));
                return Regex.Match(mail.Text, @"token=([^\s]+)").Groups[1].Value;
            }
        }
    }

    private static object Registration(string email, string handle) => new
    {
        email, password = Password, displayName = "Cuber", handle, country = "IN", birthYear = 1995,
        cubeMethod = "cfop", cubeModel = "GAN", cubingYears = 2, acceptTerms = true,
    };

    private async Task<string> SignedUpAndVerifiedAsync(string email, string handle)
    {
        Assert.Equal(HttpStatusCode.Accepted, (await _http.PostAsJsonAsync("/api/v1/auth/register", Registration(email, handle))).StatusCode);
        var verify = await _http.PostAsJsonAsync("/api/v1/auth/verify-email", new { token = _mail.TokenFor(email, "Confirm your email") });
        Assert.Equal(HttpStatusCode.NoContent, verify.StatusCode);
        return email;
    }

    [Fact]
    public async Task Full_account_lifecycle_with_cookie_refresh()
    {
        const string email = "lifecycle@example.com";
        await SignedUpAndVerifiedAsync(email, "lifecycle_user");

        var login = await _http.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("ct_rt=", StringComparison.Ordinal));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api/v1/auth", cookie, StringComparison.OrdinalIgnoreCase);
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.TryGetProperty("refreshToken", out _)); // browsers never see the refresh token in JS
        var access = body.GetProperty("accessToken").GetString()!;

        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", access);
        var me = await _http.GetFromJsonAsync<JsonElement>("/api/v1/me");
        Assert.Equal("lifecycle_user", me.GetProperty("handle").GetString());
        Assert.Equal("IN", me.GetProperty("country").GetString());
        _http.DefaultRequestHeaders.Authorization = null;

        // refresh needs the CSRF header
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.PostAsync("/api/v1/auth/refresh", null)).StatusCode);
        using var refresh = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh");
        refresh.Headers.Add("X-Requested-With", "CubeTrainer");
        var refreshed = await _http.SendAsync(refresh);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        Assert.NotEmpty(refreshed.Headers.GetValues("Set-Cookie"));

        using var logout = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/logout");
        logout.Headers.Add("X-Requested-With", "CubeTrainer");
        Assert.Equal(HttpStatusCode.NoContent, (await _http.SendAsync(logout)).StatusCode);
    }

    [Fact]
    public async Task Native_clients_get_the_refresh_token_in_the_body()
    {
        const string email = "native@example.com";
        await SignedUpAndVerifiedAsync(email, "native_user");
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login") { Content = JsonContent.Create(new { email, password = Password }) };
        req.Headers.Add("X-Client-Type", "native");
        var res = await _http.SendAsync(req);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.TryGetProperty("refreshToken", out var token) && token.GetString()!.Length > 20);
        Assert.False(res.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Protected_routes_reject_missing_and_forged_tokens()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _http.GetAsync("/api/v1/me")).StatusCode);
        using var forged = new HttpRequestMessage(HttpMethod.Get, "/api/v1/me");
        forged.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.");
        Assert.Equal(HttpStatusCode.Unauthorized, (await _http.SendAsync(forged)).StatusCode);
    }

    [Fact]
    public async Task Sign_up_does_not_reveal_whether_an_email_exists_and_flags_a_taken_username()
    {
        var first = await _http.PostAsJsonAsync("/api/v1/auth/register", Registration("exists@example.com", "exists_user"));
        var again = await _http.PostAsJsonAsync("/api/v1/auth/register", Registration("exists@example.com", "another_name"));
        Assert.Equal(first.StatusCode, again.StatusCode);

        var taken = await _http.PostAsJsonAsync("/api/v1/auth/register", Registration("fresh@example.com", "exists_user"));
        Assert.Equal(HttpStatusCode.Conflict, taken.StatusCode);
        Assert.Equal("handle_taken", (await taken.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        var free = await _http.GetFromJsonAsync<JsonElement>("/api/v1/auth/handle-available?handle=brand_new_one");
        Assert.True(free.GetProperty("available").GetBoolean());
    }

    [Fact]
    public async Task Forgot_and_reset_password_round_trip()
    {
        const string email = "reset@example.com";
        await SignedUpAndVerifiedAsync(email, "reset_user");
        Assert.Equal(HttpStatusCode.Accepted, (await _http.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email })).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await _http.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "nobody@example.com" })).StatusCode);

        var reset = await _http.PostAsJsonAsync("/api/v1/auth/reset-password", new { token = _mail.TokenFor(email, "Reset your"), newPassword = "a brand new passphrase" });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _http.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _http.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "a brand new passphrase" })).StatusCode);
    }
}
