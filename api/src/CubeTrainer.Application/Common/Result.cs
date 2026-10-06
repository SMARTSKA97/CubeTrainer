namespace CubeTrainer.Application.Common;

public enum ErrorKind
{
    Validation,
    NotFound,
    Unauthorized,
    Forbidden,
    Conflict,
    TooManyRequests,
}

/// <summary>A failed use case. The API layer turns it into an RFC 9457 problem response.</summary>
public sealed record Error(ErrorKind Kind, string Code, string Message, IReadOnlyList<string>? Details = null);

public sealed class Result<T>
{
    private Result(T? value, Error? error)
    {
        Value = value;
        Error = error;
    }

    public T? Value { get; }

    public Error? Error { get; }

    public bool IsSuccess => Error is null;

    public static Result<T> Ok(T value) => new(value, null);

    public static Result<T> Fail(ErrorKind kind, string code, string message) => new(default, new Error(kind, code, message));

    public static Result<T> Fail(ErrorKind kind, string code, string message, IReadOnlyList<string> details) => new(default, new Error(kind, code, message, details));

    public static Result<T> Fail(Error error) => new(default, error);
}

public readonly record struct Unit
{
    public static readonly Unit Value = default;
}
