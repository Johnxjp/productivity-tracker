# Productivity Stat Tracker

A local productivity dashboard that visualises two daily metrics as calendar heatmaps:

- **Builder's Blog** — whether a new entry was published on [johnxjp.github.io/builders_logs.html](https://johnxjp.github.io/builders_logs.html) that day (binary: written / not written).
- **Claude Code usage** — total tokens consumed across Claude Code sessions that day, intensity-shaded by percentile across all recorded history.

Data is collected automatically — no manual entry. The server reads directly from Claude Code's local transcript files and scrapes the blog page.

## Running

```bash
npm install   # first time only
npm start
```

This will:
1. Parse all Claude Code transcript history (first run only — subsequent runs only recompute today).
2. Scrape the blog page for new entries.
3. Start a local server at `http://localhost:3000` and open it in your browser.

Refresh the browser to recompute today's data. Past days are frozen once written.

## Configuration

Copy `.env` and adjust if needed:

| Variable | Default | Description |
|---|---|---|
| `BLOG_URL` | `https://johnxjp.github.io/builders_logs.html` | Blog page to scrape for entry anchors |
| `CLAUDE_TRANSCRIPTS_DIR` | `~/.claude/projects` | Directory containing Claude Code `.jsonl` session files |
| `PORT` | `3000` | Local HTTP port |
| `DB_PATH` | `./data/tracker.json` | Path to the JSON database file |
| `CLAUDE_IGNORE_PROJECTS` | _(empty)_ | Comma-separated list of substrings — any message whose `cwd` contains one of these strings is excluded from token counts. Matched against the full path, so you can use a project name, a directory segment, or a full path. Example: `productivity_stat_tracker,/tmp` |

## How data is collected

**Blog** — the scraper fetches the blog HTML and looks for anchor elements with `id="entry-YYYY-MM-DD"`. Any date found in that format is marked as written. The scraper is incremental: it tracks the most recent entry date seen and skips the network fetch entirely if it already has today's entry.

**Claude Code tokens** — the tracker recursively walks `~/.claude/projects` for `.jsonl` transcript files. For each assistant message it sums `input_tokens + output_tokens` and attributes them to the local calendar day of the message timestamp. Sessions that cross midnight are split correctly across days.

## How the database is updated

The database lives at `data/tracker.json` (gitignored). Its update rules are:

- **First run** — all transcript history is backfilled in full, then the blog is scraped.
- **Every subsequent run** — only today's row is recomputed (transcripts re-parsed, blog re-scraped). All past days are immutable.
- **Errors** — a failed blog fetch or malformed transcript line is logged to the terminal and skipped. The database is never partially written; stale data is left in place until the next successful run.

## Project structure

```
src/
  config.ts       — loads .env
  db.ts           — JSON database read/write
  blog.ts         — blog scraper
  transcripts.ts  — Claude Code JSONL parser
  pipeline.ts     — orchestrates backfill + today recompute
  server.ts       — Express server + browser open
public/
  index.html
  app.js          — vanilla JS: calendar rendering, tooltips, aggregates
  styles.css
data/             — gitignored; holds tracker.json
```
