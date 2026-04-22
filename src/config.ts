import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';

dotenv.config();

function expandHome(p: string): string {
  return p.replace(/^~/, os.homedir());
}

function parseIgnoreList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export const config = {
  blogUrl: process.env.BLOG_URL ?? 'https://johnxjp.github.io/builders_logs.html',
  claudeTranscriptsDir: expandHome(process.env.CLAUDE_TRANSCRIPTS_DIR ?? '~/.claude/projects'),
  port: parseInt(process.env.PORT ?? '3000', 10),
  dbPath: path.resolve(expandHome(process.env.DB_PATH ?? './data/tracker.json')),
  ignoreProjects: parseIgnoreList(process.env.CLAUDE_IGNORE_PROJECTS),
};
