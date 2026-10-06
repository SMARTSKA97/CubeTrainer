using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace CubeTrainer.IntegrationTests;

/// <summary>The social-login redirect flow through the real pipeline, with a fake identity provider.</summary>
public sealed class ExternalApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly ApiHost _host;

    public ExternalApiTests(WebApplicationFactory<Program> factory) => _host = new ApiHost(factory);

    [Fact]
    public async Task Providers_are_listed_and_unknown_ones_are_not_found()
    {
        var http = _host.Browser();
        var list = await http.GetFromJsonAsync<JsonElement>("/api/v1/auth/providers");
        Assert.Equal("google", list[0].GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/v1/auth/external/github/start")).StatusCode);
    }

    [Fact]
    public async Task Sign_up_with_a_provider_then_sign_in_again_through_the_redirect_flow()
    {
        var http = _host.Browser();

        var start = await http.GetAsync("/api/v1/auth/external/google/start?returnUrl=/timer");
        Assert.Equal(HttpStatusCode.Redirect, start.StatusCode);
        Assert.StartsWith("https://idp.test/authorize", start.Headers.Location!.ToString(), StringComparison.Ordinal);
        Assert.Contains(start.Headers.GetValues("Set-Cookie"), c => c.StartsWith("ct_oauth=", StringComparison.Ordinal) && c.Contains("httponly", StringComparison.OrdinalIgnoreCase));

        var callback = await http.GetAsync("/api/v1/auth/external/google/callback?code=good&state=state-123");
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        var next = callback.Headers.Location!;
        Assert.Contains("/auth/external/complete", next.ToString(), StringComparison.Ordinal);
        var ticket = System.Web.HttpUtility.ParseQueryString(next.Query)["ticket"]!;

        var info = await http.GetFromJsonAsync<JsonElement>($"/api/v1/auth/external/ticket?ticket={Uri.EscapeDataString(ticket)}");
        Assert.Equal("social@example.com", info.GetProperty("email").GetString());

        var complete = await http.PostAsJsonAsync("/api/v1/auth/external/complete", new
        {
            ticket, displayName = "Social Person", handle = "social_it", country = "IN", birthYear = 1999, acceptTerms = true,
        });
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        var body = await complete.Content.ReadFromJsonAsync<JsonElement>();
        var token = body.GetProperty("accessToken").GetString()!;
        Assert.Contains(complete.Headers.GetValues("Set-Cookie"), c => c.StartsWith("ct_rt=", StringComparison.Ordinal));

        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var ids = await http.GetFromJsonAsync<JsonElement>("/api/v1/me/identities");
        Assert.False(ids.GetProperty("hasPassword").GetBoolean());
        Assert.Equal("google", ids.GetProperty("linked")[0].GetProperty("provider").GetString());

        // A second trip signs straight in: the API sets the sign-in cookie and sends the browser to the "done" page.
        var again = _host.Browser();
        await again.GetAsync("/api/v1/auth/external/google/start");
        var second = await again.GetAsync("/api/v1/auth/external/google/callback?code=good&state=state-123");
        Assert.Contains("/auth/external/done", second.Headers.Location!.ToString(), StringComparison.Ordinal);
        Assert.Contains(second.Headers.GetValues("Set-Cookie"), c => c.StartsWith("ct_rt=", StringComparison.Ordinal));
    }

    [Fact]
    public async Task The_android_app_signs_in_through_the_browser_and_collects_the_session_with_its_secret()
    {
        var verifier = "app-verifier-" + Guid.NewGuid().ToString("N");
        var challenge = Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(verifier))).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        // A malformed challenge is refused up front.
        Assert.Equal(HttpStatusCode.BadRequest, (await _host.Browser().GetAsync("/api/v1/auth/external/google/start?challenge=short")).StatusCode);

        async Task<Uri> Trip()
        {
            var browser = _host.Browser(); // the phone's browser: its own cookie jar, no native header
            await browser.GetAsync($"/api/v1/auth/external/google/start?challenge={challenge}");
            var cb = await browser.GetAsync("/api/v1/auth/external/google/callback?code=good&state=state-123");
            Assert.Equal(HttpStatusCode.Redirect, cb.StatusCode);
            Assert.False(cb.Headers.Contains("Set-Cookie") && cb.Headers.GetValues("Set-Cookie").Any(c => c.StartsWith("ct_rt=", StringComparison.Ordinal)), "the app flow must not set the browser cookie");
            return cb.Headers.Location!;
        }

        var first = await Trip();
        Assert.Equal("cubetrainer", first.Scheme);
        if (first.AbsolutePath.EndsWith("/complete", StringComparison.Ordinal))
        {
            var ticket = System.Web.HttpUtility.ParseQueryString(first.Query)["ticket"]!;
            using var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/external/complete") { Content = JsonContent.Create(new { ticket, displayName = "App Social", handle = "app_social_it", country = "IN", birthYear = 1999, acceptTerms = true }) };
            req.Headers.Add("X-Client-Type", "native");
            var complete = await _host.Browser().SendAsync(req);
            Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
            Assert.NotNull((await complete.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("refreshToken").GetString());
        }

        var done = await Trip();
        Assert.Equal("auth", done.Host);
        Assert.EndsWith("/done", done.AbsolutePath, StringComparison.Ordinal);
        var code = System.Web.HttpUtility.ParseQueryString(done.Query)["code"]!;

        async Task<HttpResponseMessage> Exchange(string c, string v, bool native)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/external/app-exchange") { Content = JsonContent.Create(new { code = c, verifier = v }) };
            if (native) req.Headers.Add("X-Client-Type", "native");
            return await _host.Browser().SendAsync(req);
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await Exchange(code, "not-the-verifier", true)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Exchange(code, verifier, false)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Exchange("garbage", verifier, true)).StatusCode);

        var ok = await Exchange(code, verifier, true);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.False(ok.Headers.Contains("Set-Cookie"));
        var body = await ok.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrEmpty(body.GetProperty("accessToken").GetString()));
        Assert.False(string.IsNullOrEmpty(body.GetProperty("refreshToken").GetString()));
        Assert.Equal("social@example.com", body.GetProperty("user").GetProperty("email").GetString());
    }

    [Fact]
    public async Task A_callback_with_the_wrong_state_or_no_cookie_is_refused()
    {
        var http = _host.Browser();
        var noCookie = await http.GetAsync("/api/v1/auth/external/google/callback?code=good&state=state-123");
        Assert.Contains("error=state_mismatch", noCookie.Headers.Location!.ToString(), StringComparison.Ordinal);

        await http.GetAsync("/api/v1/auth/external/google/start");
        var wrong = await http.GetAsync("/api/v1/auth/external/google/callback?code=good&state=forged");
        Assert.Contains("error=state_mismatch", wrong.Headers.Location!.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Managing_connected_accounts_needs_sign_in_and_a_password_user_can_start_linking()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _host.Anonymous().GetAsync("/api/v1/me/identities")).StatusCode);
        var user = await _host.SignedInAsync();
        var ids = await user.GetFromJsonAsync<JsonElement>("/api/v1/me/identities");
        Assert.True(ids.GetProperty("hasPassword").GetBoolean());

        var link = await user.PostAsync("/api/v1/me/identities/google/link-start", null);
        Assert.Equal(HttpStatusCode.OK, link.StatusCode);
        Assert.Contains("/auth/external/google/start?link=", (await link.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString(), StringComparison.Ordinal);
    }
}
