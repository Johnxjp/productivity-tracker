'use strict';

// ─── State ───────────────────────────────────────────────────────────────────

let db = null;
let viewType = 'month'; // 'week' | 'month' | 'year'
let refDate = new Date(); // anchor date for current period

const today = (() => {
  const d = new Date();
  return fmt(d);
})();

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fmt(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function parseDate(s) {
  // Parse YYYY-MM-DD as local date (avoid UTC offset issues)
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(d) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function isFuture(dateStr) {
  return dateStr > today;
}

// ─── Period computation ───────────────────────────────────────────────────────

function getPeriod() {
  if (viewType === 'week') {
    const mon = getMonday(refDate);
    const sun = addDays(mon, 6);
    return { start: mon, end: sun };
  }
  if (viewType === 'month') {
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
    return { start, end };
  }
  // year
  const start = new Date(refDate.getFullYear(), 0, 1);
  const end = new Date(refDate.getFullYear(), 11, 31);
  return { start, end };
}

function periodDates() {
  const { start, end } = getPeriod();
  const dates = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(fmt(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function periodLabel() {
  const d = refDate;
  if (viewType === 'week') {
    const mon = getMonday(d);
    const sun = addDays(mon, 6);
    const opts = { day: 'numeric', month: 'short' };
    if (mon.getFullYear() === sun.getFullYear()) {
      return `${mon.toLocaleDateString('en-GB', opts)} – ${sun.toLocaleDateString('en-GB', opts)} ${sun.getFullYear()}`;
    }
    return `${mon.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })} – ${sun.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`;
  }
  if (viewType === 'month') {
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  return String(d.getFullYear());
}

function navigate(dir) {
  // dir = +1 (next) or -1 (prev)
  if (viewType === 'week') {
    refDate = addDays(refDate, dir * 7);
  } else if (viewType === 'month') {
    refDate = new Date(refDate.getFullYear(), refDate.getMonth() + dir, 1);
  } else {
    refDate = new Date(refDate.getFullYear() + dir, 0, 1);
  }
}

// ─── Percentile ranking ───────────────────────────────────────────────────────

function buildPercentileMap() {
  if (!db) return new Map();
  // All stored days with tokens > 0 form the reference pool
  const allTokens = Object.values(db.days)
    .map(d => d.tokens ?? 0)
    .filter(t => t > 0)
    .sort((a, b) => a - b);

  if (allTokens.length === 0) return new Map();

  const pctMap = new Map();
  for (const [dateStr, day] of Object.entries(db.days)) {
    const t = day.tokens ?? 0;
    if (t === 0) {
      pctMap.set(dateStr, 0);
      continue;
    }
    // Percentile: fraction of allTokens values <= t
    let rank = 0;
    for (const v of allTokens) {
      if (v <= t) rank++;
      else break;
    }
    const pct = rank / allTokens.length; // 0..1
    pctMap.set(dateStr, pct);
  }
  return pctMap;
}

function intensityClass(pct) {
  if (pct === 0) return 'claude-0';
  if (pct <= 0.2) return 'claude-1';
  if (pct <= 0.4) return 'claude-2';
  if (pct <= 0.6) return 'claude-3';
  if (pct <= 0.8) return 'claude-4';
  return 'claude-5';
}

// ─── Cell creation ────────────────────────────────────────────────────────────

function makeCell(dateStr, panelType, pctMap) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.date = dateStr;
  cell.dataset.panel = panelType;

  if (!dateStr) {
    cell.classList.add('empty');
    return cell;
  }

  if (isFuture(dateStr)) {
    cell.classList.add('future');
  } else {
    const day = db?.days[dateStr];
    if (panelType === 'blog') {
      cell.classList.add(day?.blog ? 'blog-written' : 'blog-not-written');
    } else {
      const pct = pctMap.get(dateStr) ?? 0;
      cell.classList.add(intensityClass(pct));
    }
  }

  cell.addEventListener('mouseenter', showTooltip);
  cell.addEventListener('mousemove', moveTooltip);
  cell.addEventListener('mouseleave', hideTooltip);
  return cell;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const tooltip = document.getElementById('tooltip');
const tooltipDate = document.getElementById('tooltip-date');
const tooltipBlog = document.getElementById('tooltip-blog');
const tooltipTokens = document.getElementById('tooltip-tokens');

function formatDateLabel(dateStr) {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function showTooltip(e) {
  const cell = e.currentTarget;
  const dateStr = cell.dataset.date;
  if (!dateStr || isFuture(dateStr)) return;

  const panelType = cell.dataset.panel;
  const day = db?.days[dateStr] ?? {};
  tooltipDate.textContent = formatDateLabel(dateStr);
  tooltipBlog.textContent = `Blog: ${day.blog ? 'written' : 'not written'}`;
  tooltipTokens.textContent = `Tokens: ${(day.tokens ?? 0).toLocaleString()}`;

  const projectsEl = document.getElementById('tooltip-projects');
  if (panelType === 'claude' && day.projects && Object.keys(day.projects).length > 0) {
    const sorted = Object.entries(day.projects).sort((a, b) => b[1] - a[1]);
    projectsEl.innerHTML = sorted
      .map(([cwd, t]) => {
        const name = cwd.split('/').filter(Boolean).pop() ?? cwd;
        return `<div class="tooltip-project"><span class="tp-name">${name}</span><span class="tp-tokens">${t.toLocaleString()}</span></div>`;
      })
      .join('');
    projectsEl.style.display = 'block';
  } else {
    projectsEl.style.display = 'none';
  }

  tooltip.style.display = 'block';
  positionTooltip(e);
}

function moveTooltip(e) {
  positionTooltip(e);
}

function positionTooltip(e) {
  const margin = 12;
  let left = e.clientX + margin;
  let top = e.clientY + margin;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  if (left + tw > window.innerWidth - 8) left = e.clientX - tw - margin;
  if (top + th > window.innerHeight - 8) top = e.clientY - th - margin;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

// ─── Calendar renderers ───────────────────────────────────────────────────────

const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function renderWeek(container, panelType, pctMap) {
  const dates = periodDates(); // exactly 7
  const wrap = document.createElement('div');
  wrap.className = 'week-grid';
  for (const d of dates) {
    wrap.appendChild(makeCell(d, panelType, pctMap));
  }

  // Day labels
  const labels = document.createElement('div');
  labels.className = 'day-labels';
  for (const name of DAY_NAMES) {
    const lbl = document.createElement('div');
    lbl.className = 'day-label';
    lbl.textContent = name;
    labels.appendChild(lbl);
  }

  container.innerHTML = '';
  container.appendChild(labels);
  container.appendChild(wrap);
}

function renderMonth(container, panelType, pctMap) {
  const { start, end } = getPeriod();
  // Day of week for 1st: 0=Sun → map to Mon-first index
  const firstDow = start.getDay(); // 0=Sun,1=Mon,...
  const offset = firstDow === 0 ? 6 : firstDow - 1; // blank cells before 1st

  const labels = document.createElement('div');
  labels.className = 'day-labels';
  for (const name of DAY_NAMES) {
    const lbl = document.createElement('div');
    lbl.className = 'day-label';
    lbl.textContent = name.charAt(0);
    labels.appendChild(lbl);
  }

  const grid = document.createElement('div');
  grid.className = 'month-grid';

  // Blank offset cells
  for (let i = 0; i < offset; i++) {
    grid.appendChild(makeCell('', panelType, pctMap));
  }

  // Date cells
  const d = new Date(start);
  while (d <= end) {
    grid.appendChild(makeCell(fmt(d), panelType, pctMap));
    d.setDate(d.getDate() + 1);
  }

  container.innerHTML = '';
  container.appendChild(labels);
  container.appendChild(grid);
}

function renderYear(container, panelType, pctMap) {
  const year = refDate.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  // Start grid from the Monday on or before Jan 1
  const gridStart = getMonday(jan1);

  // Build week columns until we've covered Dec 31
  const weeks = [];
  let cursor = new Date(gridStart);
  while (cursor <= dec31) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(d.getDate() + i);
      const dateStr = fmt(d);
      // Cells before Jan 1 or after Dec 31 are empty spacers
      if (d.getFullYear() !== year) {
        week.push('');
      } else {
        week.push(dateStr);
      }
    }
    weeks.push(week);
    cursor.setDate(cursor.getDate() + 7);
  }

  // Month labels: place at week index where month first appears
  const monthLabels = new Array(weeks.length).fill('');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let lastLabelMonth = -1;
  for (let wi = 0; wi < weeks.length; wi++) {
    for (const dateStr of weeks[wi]) {
      if (!dateStr) continue;
      const mo = parseInt(dateStr.slice(5, 7), 10) - 1;
      if (mo !== lastLabelMonth) {
        monthLabels[wi] = MONTHS[mo];
        lastLabelMonth = mo;
        break;
      }
    }
  }

  const cellSize = 13;
  const gap = 3;

  // Month label row
  const monthRow = document.createElement('div');
  monthRow.className = 'year-month-labels';
  for (let wi = 0; wi < weeks.length; wi++) {
    const span = document.createElement('span');
    span.className = 'year-month-label';
    span.textContent = monthLabels[wi] || '';
    span.style.width = `${cellSize + gap}px`;
    monthRow.appendChild(span);
  }

  const grid = document.createElement('div');
  grid.className = 'year-grid';

  for (const week of weeks) {
    const col = document.createElement('div');
    col.className = 'year-week-col';
    for (const dateStr of week) {
      col.appendChild(makeCell(dateStr, panelType, pctMap));
    }
    grid.appendChild(col);
  }

  const wrap = document.createElement('div');
  wrap.className = 'year-grid-wrap';
  wrap.appendChild(monthRow);
  wrap.appendChild(grid);

  container.innerHTML = '';
  container.appendChild(wrap);
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

function renderAggregates() {
  if (!db) return;
  const { start, end } = getPeriod();
  const todayDate = parseDate(today);

  // N = days elapsed in period up to today (or total days if past period)
  const effectiveEnd = end > todayDate ? todayDate : end;
  const N = Math.max(0, Math.round((effectiveEnd - start) / 86400000) + 1);

  let blogWritten = 0;
  let totalTokens = 0;
  let activeDays = 0;

  const dates = periodDates();
  for (const dateStr of dates) {
    if (dateStr > today) continue; // skip future
    const day = db.days[dateStr];
    if (!day) continue;
    if (day.blog) blogWritten++;
    totalTokens += day.tokens ?? 0;
    if ((day.tokens ?? 0) > 0) activeDays++;
  }

  document.getElementById('agg-blog').innerHTML =
    `${blogWritten}<span class="fraction"> / ${N}</span>`;
  document.getElementById('agg-tokens').textContent =
    totalTokens.toLocaleString();
  document.getElementById('agg-active').innerHTML =
    `${activeDays}<span class="fraction"> / ${N}</span>`;
}

// ─── Main render ──────────────────────────────────────────────────────────────

function render() {
  document.getElementById('period-label').textContent = periodLabel();

  const pctMap = buildPercentileMap();

  const blogEl = document.getElementById('blog-calendar');
  const claudeEl = document.getElementById('claude-calendar');

  if (viewType === 'week') {
    renderWeek(blogEl, 'blog', pctMap);
    renderWeek(claudeEl, 'claude', pctMap);
  } else if (viewType === 'month') {
    renderMonth(blogEl, 'blog', pctMap);
    renderMonth(claudeEl, 'claude', pctMap);
  } else {
    renderYear(blogEl, 'blog', pctMap);
    renderYear(claudeEl, 'claude', pctMap);
  }

  renderAggregates();
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchData() {
  try {
    const res = await fetch('/api/data');
    db = await res.json();
    render();
  } catch (err) {
    console.error('Failed to fetch data:', err);
  }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.getElementById('btn-week').addEventListener('click', () => {
  viewType = 'week';
  updateToggleButtons();
  render();
});

document.getElementById('btn-month').addEventListener('click', () => {
  viewType = 'month';
  updateToggleButtons();
  render();
});

document.getElementById('btn-year').addEventListener('click', () => {
  viewType = 'year';
  updateToggleButtons();
  render();
});

document.getElementById('btn-prev').addEventListener('click', () => {
  navigate(-1);
  render();
});

document.getElementById('btn-next').addEventListener('click', () => {
  navigate(+1);
  render();
});

function updateToggleButtons() {
  document.getElementById('btn-week').classList.toggle('active', viewType === 'week');
  document.getElementById('btn-month').classList.toggle('active', viewType === 'month');
  document.getElementById('btn-year').classList.toggle('active', viewType === 'year');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

fetchData();
