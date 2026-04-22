import { loadDB, saveDB, type DB } from './db.js';
import { checkBlog } from './blog.js';
import { parseTranscripts } from './transcripts.js';
import { config } from './config.js';

function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function hasClaudeHistory(db: DB): boolean {
  return Object.values(db.days).some(d => (d.tokens ?? 0) > 0);
}

export async function runPipeline(): Promise<DB> {
  const db = loadDB(config.dbPath);
  const today = localDateString();

  // Backfill all transcript history on first run
  if (!hasClaudeHistory(db)) {
    console.log('[pipeline] first run — backfilling all transcript history...');
    const all = parseTranscripts(config.claudeTranscriptsDir, undefined, config.ignoreProjects);
    for (const [date, { tokens, files, projects }] of all) {
      if (!db.days[date]) db.days[date] = {};
      db.days[date].tokens = tokens;
      db.days[date].sessions = files.size;
      db.days[date].projects = Object.fromEntries(projects);
    }
    console.log(`[pipeline] backfilled ${all.size} day(s) from transcripts`);
  }

  // Always recompute today's transcripts
  console.log(`[pipeline] computing today's transcripts (${today})`);
  const todayParsed = parseTranscripts(config.claudeTranscriptsDir, today, config.ignoreProjects);
  const todayData = todayParsed.get(today);
  if (todayData) {
    if (!db.days[today]) db.days[today] = {};
    db.days[today].tokens = todayData.tokens;
    db.days[today].sessions = todayData.files.size;
    db.days[today].projects = Object.fromEntries(todayData.projects);
    console.log(`[pipeline] today: ${todayData.tokens} tokens across ${todayData.files.size} session(s)`);
  } else {
    // Clear any stale today entry for tokens if nothing found
    if (db.days[today]) {
      db.days[today].tokens = 0;
      db.days[today].sessions = 0;
      db.days[today].projects = {};
    }
  }

  // Blog check
  await checkBlog(db, config.blogUrl, today);

  // Prune days with no data (blog false/absent AND tokens=0)
  for (const date of Object.keys(db.days)) {
    const day = db.days[date];
    const hasBlog = day.blog === true;
    const hasTokens = (day.tokens ?? 0) > 0;
    if (!hasBlog && !hasTokens) {
      delete db.days[date];
    }
  }

  saveDB(db, config.dbPath);
  return db;
}
