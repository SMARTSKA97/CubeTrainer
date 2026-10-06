using CubeTrainer.Application.Common;

namespace CubeTrainer.Api.Endpoints;

internal static class ResultExtensions
{
    /// <summary>Maps a use-case result to 200 + body, or an RFC 9457 problem response.</summary>
    public static IResult ToHttp<T>(this Result<T> result, Func<T, IResult>? onOk = null) =>
        result.IsSuccess ? (onOk is null ? Results.Ok(result.Value) : onOk(result.Value!)) : Problem(result.Error!);

    public static IResult Problem(Error e) => e.Kind switch
    {
        ErrorKind.NotFound => Results.Problem(title: "Not found", detail: e.Message, statusCode: StatusCodes.Status404NotFound, extensions: Ext(e)),
        ErrorKind.Unauthorized => Results.Problem(title: "Unauthorized", detail: e.Message, statusCode: StatusCodes.Status401Unauthorized, extensions: Ext(e)),
        ErrorKind.Forbidden => Results.Problem(title: "Forbidden", detail: e.Message, statusCode: StatusCodes.Status403Forbidden, extensions: Ext(e)),
        ErrorKind.Conflict => Results.Problem(title: "Conflict", detail: e.Message, statusCode: StatusCodes.Status409Conflict, extensions: Ext(e)),
        ErrorKind.TooManyRequests => Results.Problem(title: "Too many requests", detail: e.Message, statusCode: StatusCodes.Status429TooManyRequests, extensions: Ext(e)),
        _ => Results.Problem(title: "Validation failed", detail: e.Message, statusCode: StatusCodes.Status400BadRequest, extensions: Ext(e)),
    };

    // `code` is a stable machine-readable value; `error` mirrors `detail` for older clients.
    private static Dictionary<string, object?> Ext(Error e)
    {
        var ext = new Dictionary<string, object?> { ["code"] = e.Code, ["error"] = e.Message };
        if (e.Details is { Count: > 0 }) ext["errors"] = e.Details;
        return ext;
    }
}
