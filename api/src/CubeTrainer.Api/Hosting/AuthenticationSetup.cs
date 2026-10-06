using System.Security.Claims;
using CubeTrainer.Application.Auth;
using CubeTrainer.Infrastructure.Identity;
using Microsoft.Extensions.Options;
#if OFFLINE
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.IdentityModel.JsonWebTokens;
#else
using Microsoft.AspNetCore.Authentication.JwtBearer;
#endif

namespace CubeTrainer.Api.Hosting;

internal static class AuthenticationSetup
{
    public static IServiceCollection AddBearerAuthentication(this IServiceCollection services)
    {
#if OFFLINE
        // Sandbox-only stand-in for the JwtBearer package (not available without NuGet). Same validation parameters.
        services.AddAuthentication("Bearer").AddScheme<AuthenticationSchemeOptions, OfflineBearerHandler>("Bearer", null);
#else
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<IOptions<JwtOptions>>((o, jwt) =>
        {
            o.MapInboundClaims = false; // keep "sub" and "sid" as they are
            o.TokenValidationParameters = JwtKeys.Validation(jwt.Value);
        });
#endif
        services.AddAuthorization();
        return services;
    }

    public static Guid? UserId(this ClaimsPrincipal user) => Guid.TryParse(user.FindFirstValue("sub"), out var id) ? id : null;

    public static Guid? SessionId(this ClaimsPrincipal user) => Guid.TryParse(user.FindFirstValue("sid"), out var id) ? id : null;

#if OFFLINE
    private sealed class OfflineBearerHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IOptions<JwtOptions> jwt)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var header = Request.Headers.Authorization.ToString();
            if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return AuthenticateResult.NoResult();
            var result = await new JsonWebTokenHandler().ValidateTokenAsync(header["Bearer ".Length..].Trim(), JwtKeys.Validation(jwt.Value));
            return result.IsValid
                ? AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(result.ClaimsIdentity), Scheme.Name))
                : AuthenticateResult.Fail("Invalid token");
        }
    }
#endif
}
