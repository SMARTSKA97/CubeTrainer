using CubeTrainer.Application.Auth;
using CubeTrainer.Api.Hosting;

namespace CubeTrainer.Api.Endpoints;

/// <summary>The signed-in user's own account: profile, sessions, deletion.</summary>
internal static class MeEndpoints
{
    public static void MapMeEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/me").WithTags("Account").RequireAuthorization().RequireRateLimiting(ServiceCollectionExtensions.AuthLimiter);

        g.MapGet("/", async (HttpContext ctx, AuthService auth, CancellationToken ct) =>
            (await auth.GetProfileAsync(ctx.User.UserId()!.Value, ct)).ToHttp());

        g.MapPatch("/", async (ProfileUpdate body, HttpContext ctx, AuthService auth, CancellationToken ct) =>
            (await auth.UpdateProfileAsync(ctx.User.UserId()!.Value, body, ct)).ToHttp());

        g.MapDelete("/", async ([Microsoft.AspNetCore.Mvc.FromBody] AuthEndpoints.PasswordBody body, HttpContext ctx, AuthService auth, CancellationToken ct) =>
        {
            var result = await auth.DeleteAccountAsync(ctx.User.UserId()!.Value, body.Password, body.ConfirmHandle, ct);
            if (result.IsSuccess) ctx.ClearRefreshCookie();
            return result.ToHttp(_ => Results.NoContent());
        });

        g.MapGet("/sessions", async (HttpContext ctx, AuthService auth, CancellationToken ct) =>
            (await auth.ListSessionsAsync(ctx.User.UserId()!.Value, ctx.User.SessionId() ?? Guid.Empty, ct)).ToHttp());

        g.MapDelete("/sessions/{sessionId:guid}", async (Guid sessionId, HttpContext ctx, AuthService auth, CancellationToken ct) =>
            (await auth.RevokeSessionAsync(ctx.User.UserId()!.Value, sessionId, ct)).ToHttp(_ => Results.NoContent()));
    }
}
