using CubeTrainer.Api.Endpoints;
using CubeTrainer.Api.Hosting;
using CubeTrainer.Application;
using CubeTrainer.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

// Render (and most PaaS hosts) tell the app which port to listen on.
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port)) builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

if (!builder.Environment.IsDevelopment())
{
    // One JSON object per line: easy to search in Render's log viewer.
    builder.Logging.ClearProviders();
    builder.Logging.AddJsonConsole();
}

builder.Services.AddApplication(builder.Configuration);
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddConfiguredCors(builder.Configuration);
builder.Services.AddApiRateLimiting(builder.Configuration);
builder.Services.AddProxyHeaders(builder.Configuration);
builder.Services.AddBearerAuthentication();
builder.Services.Configure<CookieSettings>(builder.Configuration.GetSection(CookieSettings.Section));
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
    ctx.ProblemDetails.Extensions["traceId"] = System.Diagnostics.Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never);
builder.Services.AddHealthChecks();
#if OPENAPI
builder.Services.AddOpenApi();
#endif

var app = builder.Build();

if (builder.Configuration.GetValue("Proxy:TrustForwardedHeaders", false)) app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

#if OPENAPI
if (app.Environment.IsDevelopment()) app.MapOpenApi(); // /openapi/v1.json
#endif

// Liveness: the process is up. Readiness: the database answers and migrations have run.
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = r => r.Tags.Contains("ready") });

// Versioned API. v1 is the current contract; breaking changes go to /api/v2 side by side.
var v1 = app.MapGroup("/api/v1");
v1.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow })).WithTags("Health");
v1.MapAuthEndpoints();
v1.MapExternalAuthEndpoints();
v1.MapMeEndpoints();
v1.MapSolveEndpoints();
v1.MapInsightEndpoints();

app.Run();

public partial class Program;
