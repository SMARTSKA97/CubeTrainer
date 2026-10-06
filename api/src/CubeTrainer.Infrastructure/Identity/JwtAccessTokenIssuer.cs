using System.Security.Claims;
using System.Text;
using CubeTrainer.Application.Auth;
using CubeTrainer.Domain.Users;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CubeTrainer.Infrastructure.Identity;

/// <summary>
/// Short-lived HS256 access tokens. Claims are kept minimal (no email or name): sub = user id,
/// sid = sign-in session (refresh family), jti = unique id.
/// </summary>
public sealed class JwtAccessTokenIssuer(IOptions<JwtOptions> jwt, IOptions<AuthOptions> auth, TimeProvider clock) : IAccessTokenIssuer
{
    private readonly JsonWebTokenHandler _handler = new();

    public AccessToken Issue(AppUser user, Guid sessionId)
    {
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(auth.Value.AccessTokenMinutes);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = jwt.Value.Issuer,
            Audience = jwt.Value.Audience,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim("sid", sessionId.ToString()),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            ]),
            NotBefore = now.UtcDateTime,
            IssuedAt = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            SigningCredentials = new SigningCredentials(JwtKeys.SigningKey(jwt.Value), SecurityAlgorithms.HmacSha256),
        };
        return new AccessToken(_handler.CreateToken(descriptor), expires);
    }
}

public static class JwtKeys
{
    public const int MinKeyLength = 32;

    public static SymmetricSecurityKey SigningKey(JwtOptions options) => new(Encoding.UTF8.GetBytes(options.SigningKey));

    /// <summary>Used by the bearer middleware: only our issuer/audience, only HS256, 30 s clock skew.</summary>
    public static TokenValidationParameters Validation(JwtOptions options) => new()
    {
        ValidateIssuer = true,
        ValidIssuer = options.Issuer,
        ValidateAudience = true,
        ValidAudience = options.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = SigningKey(options),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        RequireExpirationTime = true,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = JwtRegisteredClaimNames.Sub,
    };
}
