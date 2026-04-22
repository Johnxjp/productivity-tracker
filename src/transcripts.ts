import * as fs from 'fs';
import * as path from 'path';

export interface DateStat {
  tokens: number;
  sessions: number;
}

function toLocalDate(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(full);
    }
  }
  return results;
}

export function parseTranscripts(
  transcriptsDir: string,
  targetDate?: string,
  ignoreProjects: string[] = []
): Map<string, { tokens: number; files: Set<string>; projects: Map<string, number> }> {
  const files = walkDir(transcriptsDir);
  const byDate = new Map<string, { tokens: number; files: Set<string>; projects: Map<string, number> }>();

  for (const file of files) {
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`[transcripts] failed to read ${file}:`, err);
      continue;
    }

    const lines = raw.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        console.error(`[transcripts] malformed JSON line in ${path.basename(file)}`);
        continue;
      }

      if (record.type !== 'assistant') continue;

      const message = record.message as Record<string, unknown> | undefined;
      if (!message) continue;

      const usage = message.usage as Record<string, number> | undefined;
      if (!usage) continue;

      const timestamp = record.timestamp as string | undefined;
      if (!timestamp) continue;

      const date = toLocalDate(timestamp);
      if (targetDate && date !== targetDate) continue;

      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const tokens = inputTokens + outputTokens;
      if (tokens === 0) continue;

      const cwd = (record.cwd as string | undefined) ?? 'unknown';

      if (ignoreProjects.length > 0 && ignoreProjects.some(pat => cwd.includes(pat))) continue;

      if (!byDate.has(date)) {
        byDate.set(date, { tokens: 0, files: new Set(), projects: new Map() });
      }
      const entry = byDate.get(date)!;
      entry.tokens += tokens;
      entry.files.add(file);
      entry.projects.set(cwd, (entry.projects.get(cwd) ?? 0) + tokens);
    }
  }

  return byDate;
}

export function statsByDate(parsed: Map<string, { tokens: number; files: Set<string> }>): Map<string, DateStat> {
  const result = new Map<string, DateStat>();
  for (const [date, { tokens, files }] of parsed) {
    result.set(date, { tokens, sessions: files.size });
  }
  return result;
}
