# Productivity Stat Tracker — Spec

## 1. Overview

A local-only productivity tracker that records two daily metrics and visualises them as side-by-side calendar heatmaps:

1. **Builder's blog** — whether a new entry was published on `johnxjp.github.io/builders_logs.html` today (binary).
2. **Claude Code usage** — total Anthropic tokens consumed across Claude Code sessions today (quantitative, rendered as intensity shading).

The tracker runs locally as a Node/TypeScript + Express app, refreshes data when the server starts and on every UI refresh, and persists state to a JSON file acting as the database.

v1 is local-only. Public embedding on `johnxjp.github.io` is explicitly out of scope.

## 2. Goals

- Give a clear visual proof-of-work across days (calendar heatmap per metric).
- Auto-detect both metrics — the detector is the source of truth. No manual override.
- Minimise redundant work: past days are cached permanently; only *today* is recomputed on refresh.
- Zero external infrastructure: single machine, local filesystem, local HTTP server.

## 3. Non-goals (v1)

- No streaks, grace days, or gamification.
- No multi-machine transcript aggregation.
- No public display on `johnxjp.github.io` (future phase).
- No manual-entry UI or override mechanism.
- No push notifications, reminders, or nudges.
- No cron / scheduled background job. The user runs `npm start` when they want to see data.
- No authentication. Server binds to localhost only.

## 4. Metric definitions

### 4.1 Blog written (binary)

A day `YYYY-MM-DD` counts as "blog written" iff the fetched HTML of the configured blog URL contains an element with `id="entry-YYYY-MM-DD"`.

### 4.2 Claude Code usage (quantitative)

For each day `YYYY-MM-DD`:
- **tokens** = sum of (input tokens + output tokens) across all messages in all JSONL transcript files under the configured transcripts directory whose **message timestamp** falls within that local calendar day.
- **sessions** = count of distinct session/transcript files that contain at least one message with a timestamp in that day.

Attribution is **per-message timestamp** (not file mtime, not session start). A session that crosses midnight is split across two days based on each message's timestamp.

### 4.3 Day boundary

Local midnight, based on the date portion of timestamps. All date math uses the machine's local timezone.

## 5. User-facing behavior

### 5.1 Launch

`npm start` does:
1. Load config.
2. Run the daily-check pipeline (blog + transcripts) for today.
3. Start the Express server.
4. Auto-open the default browser to the server URL.

### 5.2 Layout

Single page, light theme, Claude Code vermillion/orange as the primary accent.

```
+----------------------------------------------------------+
|  Productivity Tracker                    [Week|Month|Year]|
|                                                          |
|  < April 2026 >                                          |
|                                                          |
|  +-------------------+     +-------------------+         |
|  |  Builder's Blog   |     |  Claude Code      |         |
|  |  (binary)         |     |  (tokens)         |         |
|  |                   |     |                   |         |
|  |  [calendar grid]  |     |  [calendar grid]  |         |
|  |                   |     |                   |         |
|  +-------------------+     +-------------------+         |
|                                                          |
|  Aggregates (current view)                               |
|  • Blog days written: 12 / 22                            |
|  • Total Claude tokens: 4,312,908                        |
|  • Active Claude days: 18 / 22                           |
+----------------------------------------------------------+
```

- **Period toggle**: `Week` | `Month` | `Year`. Default = Month. Affects both panels simultaneously.
- **Period navigation**: prev/next arrows beside the period title page through past weeks/months/years.
- **Views are calendar-aligned**:
  - Week = Mon–Sun of the selected calendar week.
  - Month = 1st through last day of the selected calendar month.
  - Year = Jan 1 – Dec 31 of the selected calendar year.

### 5.3 Heatmap panels

Two independent panels, side by side. Both render the same set of dates (whatever the current view covers).

**Blog panel (binary):**
- Day is one of two states: written (solid accent) or not written (neutral grey).
- Future days (in the selected period, after today) render as empty/blank.

**Claude panel (intensity):**
- Intensity shading based on token count, percentile-ranked against **all days ever stored in the JSON DB** (stable reference pool that grows over time).
- Days with zero tokens render in the neutral grey state.
- Today is included in the percentile pool as-is, even if incomplete. (Accepted trade-off.)

### 5.4 Hover tooltip

On hover of any square, show:
- Date (e.g. `Wed 22 Apr 2026`)
- Blog: `written` / `not written`
- Tokens: formatted integer (e.g. `123,456`)

No click interaction in v1. No session count in the tooltip.

### 5.5 Aggregates panel

For the currently-viewed period, show exactly:
- **Blog days written**: `X / N` where `N` = days elapsed in the period up to and including today (not total days in the period when the period is current / future).
- **Total Claude tokens**: sum of tokens across the period.
- **Active Claude days**: `Y / N` where a day counts as active if tokens > 0.

### 5.6 Refresh semantics

Every UI refresh re-runs today's checks (and today's checks only):
- Re-scrape the blog URL (subject to the fetch policy in §6.1).
- Re-parse transcripts for messages with today's date.
- Write today's row back to the JSON DB.

Past days are **frozen** once written. They are never re-checked or re-computed during normal operation.

## 6. Data collection

### 6.1 Blog scraping

Config: `blog_url` (e.g. `https://johnxjp.github.io/builders_logs.html`).

**Fetch policy (incremental, no conditional headers):**
- Maintain `last_known_entry_date` in the DB.
- On a check: if `last_known_entry_date == today`, skip the fetch entirely.
- Otherwise fetch the full HTML via a plain GET, parse, and extract every anchor `id="entry-YYYY-MM-DD"` present.
- For every extracted anchor date between `last_known_entry_date` (exclusive) and today (inclusive) that isn't already in the DB, set `blog = true` for that day.
- Update `last_known_entry_date` to the maximum extracted date.
- On first run, `last_known_entry_date` is absent, so the initial fetch effectively backfills all historical blog entries found on the page.

Parsing uses anchor id matching only. No fallbacks to data attributes or heading heuristics.

### 6.2 Transcript parsing

Config: `claude_transcripts_dir` (default `~/.claude/projects`).

Recursively walk the directory for `.jsonl` files. For each file:
- Parse each line as JSON.
- Each message record is expected to expose a timestamp and token usage. Extract message timestamp and (input + output) token totals.
- Group by local date; sum tokens per date; count distinct files that contribute to a given date as that date's session count.

**Backfill**: on first run (DB empty or missing Claude history), parse all existing transcripts and populate the full history found. After that, past days are frozen; only today is recomputed on subsequent runs.

**Format resilience**: parsing lives behind a dedicated module with a stable internal representation. If Anthropic changes the JSONL structure, only that parser changes. Malformed or unparseable lines are logged and skipped — they do not abort the run.

## 7. Architecture

```
+-------------------+
|  Express server   |
|  (Node + TS)      |
+---------+---------+
          |
          |  on startup + on UI refresh
          v
+-------------------+
|  Check pipeline   |---> blog scraper (HTTP fetch + HTML parse)
|  (for today only) |---> transcript parser (JSONL walk)
+---------+---------+
          |
          v
+-------------------+
|  JSON DB          |
|  (gitignored)     |
+---------+---------+
          ^
          |  reads for heatmap + aggregates
          v
+-------------------+
|  Static UI        |
|  (HTML + JS)      |
+-------------------+
```

- A single Express process serves both the JSON API and the static UI.
- The UI fetches the JSON DB through an API endpoint and renders heatmaps client-side.
- The check pipeline is invoked synchronously during server startup and on each API request that represents a UI refresh.

## 8. Data model (locked)

The JSON DB file has this exact top-level shape:

```json
{
  "schema_version": 1,
  "last_known_entry_date": "YYYY-MM-DD" | null,
  "days": {
    "YYYY-MM-DD": {
      "blog": true,
      "tokens": 123456,
      "sessions": 3
    }
  }
}
```

Rules:
- `days` is keyed by local-date `YYYY-MM-DD` strings.
- A day entry is only created once there's data for it (blog true OR tokens > 0). Absent days render as empty on the heatmap.
- `blog` is always boolean. `false` is a valid stored value only if the day has non-zero Claude activity; otherwise the key is omitted and the day is absent from `days`.
- `tokens` and `sessions` default to 0 when omitted.
- `last_known_entry_date` tracks the most recent blog-entry anchor observed; used by the incremental fetch policy.
- `schema_version` enables future migrations.

## 9. Configuration

Single configuration source at repo root. Either `.env` or `config.json` — implementation chooses one and documents it.

Required keys:
- `BLOG_URL` — full URL to the blog page (default: `https://johnxjp.github.io/builders_logs.html`).
- `CLAUDE_TRANSCRIPTS_DIR` — absolute path (default: `~/.claude/projects`).
- `PORT` — HTTP port for the local server (default: implementer's choice, e.g. 3000).
- `DB_PATH` — path to the JSON DB file (default: `./data/tracker.json`, gitignored).

## 10. Error handling

- All errors are logged to **stdout / terminal only**. The UI does not display error banners.
- On a failed blog scrape: log the error, leave `last_known_entry_date` unchanged, do **not** overwrite any previously-successful day. Retry happens naturally on the next run.
- On a failed transcript parse for a specific file/line: log and skip that unit; continue processing the rest. Never abort the pipeline over a single malformed record.
- Stale data is its own signal — if the UI looks behind, the user checks the terminal.

## 11. Testing

Minimal / manual for v1. No automated test suite required. Spot-check manually. Introduce tests only if a specific area breaks repeatedly.

## 12. Visual design

- **Theme**: light.
- **Primary accent**: Claude Code vermillion / orange. Used for:
  - Blog heatmap "written" squares (solid accent).
  - Claude heatmap intensity ramp (pale accent → saturated accent, percentile-ranked).
- **Empty/neutral**: light grey.
- **Future dates**: blank (no fill).
- Typography and spacing: implementer's choice; keep it minimal and data-forward.

## 13. Out of scope / future phases

- Publishing the heatmap to `johnxjp.github.io` as an embedded widget or static artifact.
- Syncing Claude transcripts across multiple machines.
- Notifications / reminders / daily nudges.
- Manual override of auto-detected values.
- Additional metrics beyond blog + Claude tokens.
- Streak logic and gamified views.
- UI themes beyond the light + vermillion default.

## 14. Open questions

None at spec-lock time. All known ambiguities resolved during interview.
