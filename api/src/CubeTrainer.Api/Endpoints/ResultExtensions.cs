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
        _ => Results.Problem(title: "Validation failed", detail: e.Message, statusCode: StatusCodes.Status400BadRequest, extensions: Ext(e)),
    };

    // `code` is a stable machine-readable value; `error` mirrors `detail` for older clients.
    private static Dictionary<string, object?> Ext(Error e) => new() { ["code"] = e.Code, ["error"] = e.Message };
}
