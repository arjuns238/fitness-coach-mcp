# fitness-coach MCP server

A meal and workout log that Claude reads and writes for you. Say "had a burrito bowl and a 3 mile run" in the Claude app and Claude logs both with its best macro estimate, tells you where the day stands, and asks a question or two when a detail would change the numbers (portion, oil, missing weights). Your answers update the same entries. Ask "how was my week?" and it pulls the numbers before coaching you.

It's a remote MCP server (Streamable HTTP) with a SQLite database, added to your Claude account as a custom connector. The same server hosts a small web dashboard for reviewing and fixing entries by hand, so edits made in the app and edits made by Claude always match.

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

## Dashboard

A mobile-first web app served from the same server (`/`), installable on iPhone via Safari → Share → **Add to Home Screen**.

- **Today**: calories and macros against your goals, the day's meals, workouts and weigh-ins. Tap any entry to edit or delete it, or add one by hand (including "repeat a recent meal"). Arrows and the calendar button move between days.
- **History**: a month calendar showing which days you logged and which days met your goals (calories within 10% and protein reached), plus workout days.
- **Goals**: daily targets, weight unit, target weight, timezone, and the coaching notes Claude reads.

Sign in once with the same `MCP_API_KEY`; the browser keeps a signed, HttpOnly session cookie for 90 days. Rotating the key signs every device out.

## Run locally

Requires Node 24+ (uses the built-in `node:sqlite` and native TypeScript support, no build step).

```bash
npm install
npm test          # end-to-end smoke test against a throwaway database
npm run build     # build the dashboard into web/dist
npm run dev       # MCP at http://127.0.0.1:3000/mcp, dashboard at http://127.0.0.1:3000/, data in data/fitness.db
npm run web       # optional: dashboard with hot reload at http://localhost:5173 (API proxied to :3000)
npm run typecheck
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

### Azure Container Apps (what `deploy/azure.sh` does)

Scales to zero when idle, so it costs cents a month. The first request after a quiet spell waits a few seconds for the container to start.

- **Storage:** the database is a SQLite file on the container's own disk, which is wiped whenever the app scales to zero. [Litestream](https://litestream.io) restores it from Blob Storage when a container starts and streams every change back within about a second (`deploy/litestream.yml`).
- **Backups:** a nightly job saves a plain copy to `snapshots/day-DD.db` in the same Blob container, a rolling month that any SQLite tool can open (`scripts/snapshot.ts`).
- **Identity:** a managed identity that can pull the image and read and write that one Blob container. There's no storage key anywhere.
- **API key:** generated on the first run and kept in `~/.config/fitness-coach/api-key`, outside the repo.

```sh
cp deploy/azure.env.example deploy/azure.env   # names of your resource group, environment, registry, storage account
./deploy/azure.sh                              # re-run to ship a new version
```

A redeploy briefly runs the old and new containers side by side, and anything logged in those few seconds can be lost. Don't redeploy mid-conversation.

### Anywhere else

The `Dockerfile` builds the dashboard, serves everything on port 8080, and stores the database at `/data/fitness.db`. Without the Litestream variables it runs the server on its own, so mount persistent storage at `/data`.

Environment:

| Variable | |
|---|---|
| `MCP_API_KEY` | Required. Generate with `openssl rand -hex 32` |
| `ALLOWED_HOSTS` | Your public hostname, e.g. `fitness-coach.example.com` (Host-header check) |
| `USER_TIMEZONE` | e.g. `America/Chicago`, until you set one with `update_profile` |
| `LITESTREAM_ACCOUNT`, `LITESTREAM_CONTAINER` | Optional. Azure storage account and Blob container to replicate to |

## Connect to Claude

1. In claude.ai: **Customize → Connectors → Add → Add custom connector**. Enter a name and `https://<your-host>/mcp`, then **Continue**. It checks the server before you've entered the key, so expect "Couldn't check the server" and choose **Continue anyway**.
2. Under **Authentication**, choose **No sign-in**.
3. Under **Request headers**, add `Authorization` with the value `Bearer <MCP_API_KEY>`. Claude sends the value exactly as typed, so include `Bearer `. `X-API-Key: <MCP_API_KEY>` works too.
4. The connector then shows up in the Claude iPhone app. Start a chat, tap the mic and dictate.
5. Tell Claude your goals once ("I want 2200 calories and 160g protein a day, lifting 4x a week, I'm cutting until March") and it saves them with `update_profile`.

If Claude asks for approval on every log, look for an "Always allow" option on those tools in the connector settings.
