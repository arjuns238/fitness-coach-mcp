# fitness-coach MCP server

A meal and workout log that Claude reads and writes for you. Say "had a burrito bowl and a 3 mile run" in the Claude app and Claude logs both with its best macro estimate, tells you where the day stands, and asks a question or two when a detail would change the numbers (portion, oil, missing weights). Your answers update the same entries. Ask "how was my week?" and it pulls the numbers before coaching you.

It's a remote MCP server (Streamable HTTP) with a SQLite database, added to your Claude account as a custom connector.

## Tools

| Tool | What it does |
|---|---|
| `log_meal` | Saves a meal as items with estimated calories/protein/carbs/fat; returns the day's running totals vs goals |
| `log_workout` | Saves a workout: type, duration, effort, exercises with sets (`3x8 @ 135` → three sets) |
| `log_weight` | Saves a weigh-in |
| `update_meal` / `update_workout` / `update_weight` | Change only the fields given, e.g. after a follow-up answer; replacing a meal's items recomputes its totals |
| `get_day` | Everything logged on a day, totals, goals and profile |
| `get_summary` | Day-by-day totals, averages, goal adherence, training volume and weight trend (default last 7 days, max 92) |
| `update_profile` | Goals (calories, macros, workouts/week, target weight), units, timezone, free-text coaching notes |
| `delete_entry` | Removes an entry logged by mistake |

Dates are your local calendar days in the profile's timezone, so a server running in UTC still files an 11pm snack under the right day. Log tools accept `"today"`, `"yesterday"` or `YYYY-MM-DD`.

## Run locally

Requires Node 24+ (uses the built-in `node:sqlite` and native TypeScript support, no build step).

```bash
npm install
npm test          # end-to-end smoke test against a throwaway database
npm run dev       # http://127.0.0.1:3000/mcp, data in data/fitness.db
```

With no `MCP_API_KEY` set and bound to localhost, auth is off. The server refuses to listen on a public interface without a key.

### Try it in Claude Code

```bash
MCP_API_KEY=dev-key npm run dev
claude mcp add --transport http fitness-coach http://127.0.0.1:3000/mcp --header "Authorization: Bearer dev-key"
```

### Try it in Claude Desktop

Custom connectors connect from Anthropic's cloud and can't reach `localhost`, so for a local test use the stdio entry. Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fitness-coach": {
      "command": "/path/to/node",
      "args": ["--disable-warning=ExperimentalWarning", "/path/to/fitness-coach-mcp/src/stdio.ts"],
      "env": { "DB_PATH": "/path/to/fitness-coach-mcp/data/fitness.db" }
    }
  }
}
```

Use the full path from `which node`, since Claude Desktop doesn't load your shell's PATH. Restart Claude Desktop. This local database is separate from the one you'll deploy.

## Deploy

Any host that gives you HTTPS and a persistent disk works (Fly.io, Railway, Render, a VPS). The `Dockerfile` serves on port 8080 and stores the database at `/data/fitness.db`, so mount a volume at `/data`.

Environment:

| Variable | |
|---|---|
| `MCP_API_KEY` | Required. Generate with `openssl rand -hex 32` |
| `ALLOWED_HOSTS` | Your public hostname, e.g. `fitness-coach.fly.dev` (Host-header check) |
| `USER_TIMEZONE` | e.g. `America/Chicago`, until you set one with `update_profile` |

## Connect to Claude

1. In claude.ai on desktop: **Customize → Connectors → Add → Custom → Web**.
2. URL: `https://<your-host>/mcp`.
3. Don't set up OAuth. Add a request header `Authorization` with value `Bearer <MCP_API_KEY>` (or `X-API-Key: <MCP_API_KEY>`).
4. The connector then shows up in the Claude iPhone app. Start a chat, tap the mic and dictate.
5. Tell Claude your goals once ("I want 2200 calories and 160g protein a day, lifting 4x a week, I'm cutting until March") and it saves them with `update_profile`.

If Claude asks for approval on every log, look for an "Always allow" option on those tools in the connector settings.
