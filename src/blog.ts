import type { DB } from './db.js';

export async function checkBlog(db: DB, blogUrl: string, today: string): Promise<void> {
  if (db.last_known_entry_date === today) {
    console.log('[blog] already up to date for today, skipping fetch');
    return;
  }

  let html: string;
  try {
    const res = await fetch(blogUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error('[blog] fetch failed:', err);
    return;
  }

  const anchorRe = /id="entry-(\d{4}-\d{2}-\d{2})"/g;
  const extractedDates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    extractedDates.push(m[1]);
  }

  if (extractedDates.length === 0) {
    console.log('[blog] no entry anchors found in HTML');
    return;
  }

  const lastKnown = db.last_known_entry_date;
  let maxDate = lastKnown;

  for (const date of extractedDates) {
    // Only process dates strictly after lastKnown and up to today
    if (lastKnown && date <= lastKnown) continue;
    if (date > today) continue;

    if (!db.days[date]) db.days[date] = {};
    db.days[date].blog = true;
    console.log(`[blog] recorded entry for ${date}`);

    if (!maxDate || date > maxDate) maxDate = date;
  }

  if (maxDate && maxDate !== lastKnown) {
    db.last_known_entry_date = maxDate;
    console.log(`[blog] last_known_entry_date updated to ${maxDate}`);
  }
}
