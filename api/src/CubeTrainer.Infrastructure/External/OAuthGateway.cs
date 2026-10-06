using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CubeTrainer.Application.Auth.External;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CubeTrainer.Infrastructure.External;

/// <summary>
/// OAuth 2.0 authorization-code flow with PKCE against Google, Microsoft, GitHub and Facebook.
/// We call the provider's user-info endpoint over TLS with the access token we just obtained ourselves, so there is no
/// id_token signature handling to get wrong. Only the stable subject id, email (+ whether the provider verified it) and name are read.
/// </summary>
public sealed class OAuthGateway(IHttpClientFactory httpFactory, IOptions<ExternalAuthOptions> options, ILogger<OAuthGateway> logger) : IOAuthGateway
{
    private enum Kind { Oidc, GitHub, Facebook }

    private sealed record Definition(string Id, string Name, Kind Kind, string Authorize, string Token, string UserInfo, string Scope, string? Emails = null);

    private static readonly Definition[] Catalog =
    [
        new("google", "Google", Kind.Oidc, "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo", "openid email profile"),
        new("microsoft", "Microsoft", Kind.Oidc, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", "https://login.microsoftonline.com/common/oauth2/v2.0/token", "https://graph.microsoft.com/oidc/userinfo", "openid email profile"),
        new("github", "GitHub", Kind.GitHub, "https://github.com/login/oauth/authorize", "https://github.com/login/oauth/access_token", "https://api.github.com/user", "read:user user:email", "https://api.github.com/user/emails"),
        new("facebook", "Facebook", Kind.Facebook, "https://www.facebook.com/v21.0/dialog/oauth", "https://graph.facebook.com/v21.0/oauth/access_token", "https://graph.facebook.com/me?fields=id,name,email", "email public_profile"),
    ];

    private readonly ExternalAuthOptions _options = options.Value;

    public IReadOnlyList<ProviderInfo> EnabledProviders =>
        Catalog.Where(d => Settings(d.Id) is not null).Select(d => new ProviderInfo(d.Id, d.Name)).ToList();

    public bool IsEnabled(string provider) => Settings(provider) is not null;

    public OAuthStart BuildStart(string provider, string redirectUri)
    {
        var (def, cfg) = Resolve(provider);
        var state = Random(24);
        var verifier = Random(48);
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var query = new Dictionary<string, string>
        {
            ["client_id"] = cfg.ClientId,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["scope"] = def.Scope,
            ["state"] = state,
            ["code_challenge"] = challenge,
            ["code_challenge_method"] = "S256",
        };
        if (def.Kind == Kind.Oidc && def.Id == "google") query["prompt"] = "select_account";
        var url = (cfg.AuthorizeUrl ?? def.Authorize) + "?" + string.Join('&', query.Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));
        return new OAuthStart(url, state, verifier);
    }

    public async Task<ExternalProfile?> ExchangeAsync(string provider, string code, string redirectUri, string codeVerifier, CancellationToken ct)
    {
        var (def, cfg) = Resolve(provider);
        var http = httpFactory.CreateClient("oauth");
        try
        {
            using var tokenRequest = new HttpRequestMessage(HttpMethod.Post, cfg.TokenUrl ?? def.Token)
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "authorization_code",
                    ["code"] = code,
                    ["redirect_uri"] = redirectUri,
                    ["client_id"] = cfg.ClientId,
                    ["client_secret"] = cfg.ClientSecret,
                    ["code_verifier"] = codeVerifier,
                }),
            };
            tokenRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            using var tokenResponse = await http.SendAsync(tokenRequest, ct);
            if (!tokenResponse.IsSuccessStatusCode)
            {
                logger.LogWarning("OAuth token exchange with {Provider} failed: {Status}", provider, (int)tokenResponse.StatusCode);
                return null;
            }

            var token = (await tokenResponse.Content.ReadFromJsonAsync<JsonElement>(ct)).TryGetProperty("access_token", out var at) ? at.GetString() : null;
            if (string.IsNullOrEmpty(token)) return null;

            var info = await GetJsonAsync(http, cfg.UserInfoUrl ?? def.UserInfo, token, ct);
            if (info is null) return null;
            return def.Kind switch
            {
                Kind.GitHub => await GitHubProfileAsync(http, def, cfg, info.Value, token, ct),
                Kind.Facebook => Profile(def.Id, Str(info.Value, "id"), Str(info.Value, "email"), false, Str(info.Value, "name")),
                _ => Profile(def.Id, Str(info.Value, "sub"), Str(info.Value, "email"), Flag(info.Value, "email_verified"), Str(info.Value, "name")),
            };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "OAuth exchange with {Provider} failed", provider);
            return null;
        }
    }

    private static async Task<ExternalProfile?> GitHubProfileAsync(HttpClient http, Definition def, ProviderSettings cfg, JsonElement user, string token, CancellationToken ct)
    {
        string? email = null;
        var verified = false;
        var emails = await GetJsonAsync(http, cfg.EmailsUrl ?? def.Emails!, token, ct);
        if (emails is { ValueKind: JsonValueKind.Array } list)
        {
            foreach (var e in list.EnumerateArray())
            {
                if (Flag(e, "primary") && Flag(e, "verified"))
                {
                    email = Str(e, "email");
                    verified = true;
                    break;
                }
            }
        }

        var id = user.TryGetProperty("id", out var idEl) ? idEl.ToString() : null;
        return Profile(def.Id, id, email, verified, Str(user, "name") ?? Str(user, "login"));
    }

    private static ExternalProfile? Profile(string provider, string? subject, string? email, bool verified, string? name) =>
        string.IsNullOrWhiteSpace(subject) ? null : new ExternalProfile(provider, subject, string.IsNullOrWhiteSpace(email) ? null : email.Trim(), verified && !string.IsNullOrWhiteSpace(email), name);

    private static async Task<JsonElement?> GetJsonAsync(HttpClient http, string url, string token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("CubeTrainer", "1.0")); // GitHub rejects requests without one
        using var response = await http.SendAsync(request, ct);
        return response.IsSuccessStatusCode ? await response.Content.ReadFromJsonAsync<JsonElement>(ct) : null;
    }

    private static string? Str(JsonElement e, string name) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static bool Flag(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && (v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.String && v.GetString() == "true"));

    private ProviderSettings? Settings(string provider) =>
        _options.Providers.TryGetValue(provider, out var s) && !string.IsNullOrWhiteSpace(s.ClientId) && !string.IsNullOrWhiteSpace(s.ClientSecret) && Catalog.Any(d => d.Id == provider) ? s : null;

    private (Definition Def, ProviderSettings Cfg) Resolve(string provider) =>
        (Catalog.First(d => d.Id == provider), Settings(provider) ?? throw new InvalidOperationException($"Provider '{provider}' is not configured."));

    private static string Random(int bytes) => Base64Url(RandomNumberGenerator.GetBytes(bytes));

    private static string Base64Url(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
