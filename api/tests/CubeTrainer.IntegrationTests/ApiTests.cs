using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace CubeTrainer.IntegrationTests;

/// <summary>
/// End-to-end through the real HTTP pipeline. Uses the in-memory store, or Postgres when DATABASE_URL is set
/// (CI sets it to a Flyway-migrated service container, so the same tests then cover the SQL mapping).
/// </summary>
public sealed class ApiTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly ApiHost _host;
    private HttpClient _http = null!;

    public ApiTests(WebApplicationFactory<Program> factory) => _host = new ApiHost(factory);

    public async Task InitializeAsync() => _http = await _host.SignedInAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private static object NewSolve(Guid id, int timeMs = 12345, string penalty = "none") =>
        new { id, at = 1_700_000_000_000L, timeMs, penalty, scramble = "R U R' U'", mode = "random" };

    [Fact]
    public async Task Liveness_and_security_headers()
    {
        var res = await _http.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
    }

    [Fact]
    public async Task Solve_and_stats_endpoints_require_sign_in()
    {
        var anon = _host.Anonymous();
        foreach (var path in new[] { "/api/v1/solves", "/api/v1/stats", "/api/v1/summary", "/api/v1/cases/status", "/api/v1/sync/changes" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/v1/solves", NewSolve(Guid.NewGuid()))).StatusCode);
    }

    [Fact]
    public async Task One_users_solves_are_invisible_and_untouchable_to_another()
    {
        var other = await _host.SignedInAsync();
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await _http.PostAsJsonAsync("/api/v1/solves", NewSolve(id))).StatusCode);

        var theirs = await other.GetFromJsonAsync<JsonElement>("/api/v1/solves");
        Assert.Equal(0, theirs.GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync($"/api/v1/solves/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PatchAsJsonAsync($"/api/v1/solves/{id}", new { penalty = "dnf" })).StatusCode);

        // Uploading the same id as someone else creates the caller's own row; it does not overwrite the original.
        Assert.Equal(HttpStatusCode.OK, (await other.PostAsJsonAsync("/api/v1/solves", NewSolve(id, timeMs: 99999))).StatusCode);
        var mine = await _http.GetFromJsonAsync<JsonElement>("/api/v1/solves");
        Assert.Equal(12345, mine.EnumerateArray().Single(e => e.GetProperty("id").GetGuid() == id).GetProperty("timeMs").GetInt32());
    }

    [Fact]
    public async Task Sync_delivers_edits_deletes_and_case_status_after_a_cursor()
    {
        var keep = Guid.NewGuid();
        var drop = Guid.NewGuid();
        await _http.PostAsJsonAsync("/api/v1/solves/bulk", new[] { NewSolve(keep), NewSolve(drop) });
        await _http.PutAsJsonAsync("/api/v1/cases/IT-9/status", new { status = "finished" });

        var first = await _http.GetFromJsonAsync<JsonElement>("/api/v1/sync/changes?since=0");
        Assert.Equal(2, first.GetProperty("solves").GetArrayLength());
        Assert.Equal("finished", first.GetProperty("caseStatuses")[0].GetProperty("status").GetString());
        var cursor = first.GetProperty("cursor").GetInt64();

        await _http.PatchAsJsonAsync($"/api/v1/solves/{keep}", new { penalty = "dnf" });
        await _http.DeleteAsync($"/api/v1/solves/{drop}");

        var next = await _http.GetFromJsonAsync<JsonElement>($"/api/v1/sync/changes?since={cursor}");
        var changed = next.GetProperty("solves").EnumerateArray().ToDictionary(e => e.GetProperty("id").GetGuid());
        Assert.Equal("dnf", changed[keep].GetProperty("penalty").GetString());
        Assert.False(changed[keep].GetProperty("deleted").GetBoolean());
        Assert.True(changed[drop].GetProperty("deleted").GetBoolean());
        Assert.Equal(0, next.GetProperty("caseStatuses").GetArrayLength());
        Assert.True(next.GetProperty("cursor").GetInt64() > cursor);

        // A stale device re-uploading the deleted solve must not resurrect it.
        await _http.PostAsJsonAsync("/api/v1/solves", NewSolve(drop));
        var live = await _http.GetFromJsonAsync<JsonElement>("/api/v1/solves");
        Assert.DoesNotContain(live.EnumerateArray(), e => e.GetProperty("id").GetGuid() == drop);
    }

    [Fact]
    public async Task Solve_round_trip_with_patch_and_delete()
    {
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await _http.PostAsJsonAsync("/api/v1/solves", NewSolve(id))).StatusCode);

        var patch = await _http.PatchAsJsonAsync($"/api/v1/solves/{id}", new { penalty = "plus2", tags = new[] { "pause" } });
        Assert.Equal(HttpStatusCode.NoContent, patch.StatusCode);

        var list = await _http.GetFromJsonAsync<JsonElement>("/api/v1/solves");
        var mine = list.EnumerateArray().Single(e => e.GetProperty("id").GetGuid() == id);
        Assert.Equal("plus2", mine.GetProperty("penalty").GetString());
        Assert.Equal(14345, mine.GetProperty("effective").GetInt32());
        Assert.Equal("pause", mine.GetProperty("tags")[0].GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await _http.DeleteAsync($"/api/v1/solves/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _http.DeleteAsync($"/api/v1/solves/{id}")).StatusCode);
    }

    [Fact]
    public async Task Invalid_solve_returns_problem_details_with_a_stable_code()
    {
        var res = await _http.PostAsJsonAsync("/api/v1/solves", NewSolve(Guid.NewGuid(), penalty: "bogus"));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType!.MediaType);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("invalid_solve", body.GetProperty("code").GetString());
        Assert.Equal(400, body.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task Bulk_upload_then_stats_and_summary()
    {
        var batch = Enumerable.Range(0, 5).Select(i => NewSolve(Guid.NewGuid(), 10000 + (i * 1000))).ToList();
        var res = await _http.PostAsJsonAsync("/api/v1/solves/bulk", batch);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(5, (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("saved").GetInt32());

        var stats = await _http.GetFromJsonAsync<JsonElement>("/api/v1/stats");
        Assert.True(stats.GetProperty("count").GetInt32() >= 5);
        var summary = await _http.GetFromJsonAsync<JsonElement>("/api/v1/summary?tz=330");
        Assert.Equal(7, summary.GetProperty("last7Days").GetArrayLength());
    }

    [Fact]
    public async Task Case_status_round_trip()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await _http.PutAsJsonAsync("/api/v1/cases/IT-1/status", new { status = "learning" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.PutAsJsonAsync("/api/v1/cases/IT-1/status", new { status = "nope" })).StatusCode);
        var all = await _http.GetFromJsonAsync<JsonElement>("/api/v1/cases/status");
        Assert.Equal("learning", all.GetProperty("IT-1").GetString());
    }
}
