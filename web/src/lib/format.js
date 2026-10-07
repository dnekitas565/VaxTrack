/** 'YYYY-MM-DD' -> '07 Oct 2026' (parsed as a local date, so no time-zone shift) */
export function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Rewrites ISO dates inside free text ("was due 2026-09-29") to the app style ("29 Sep 2026") */
export const prettifyDates = (text) => String(text ?? '').replace(/(\d{4}-\d{2}-\d{2})/g, (m) => fmtDate(m));

export function fmtDateTime(s) {
  if (!s) return '—';
  return `${fmtDate(s)} ${String(s).slice(11, 16)}`;
}

/** Today as 'YYYY-MM-DD' in the browser's local time */
export function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d + days).toLocaleDateString('en-CA');
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Downloads rows as a CSV file. columns: [{ key, label }] */
export function downloadCsv(filename, rows, columns) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc(r[c.key])).join(','));
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const ROLE_LABEL = { ADMIN: 'Administrator', NURSE: 'Nurse', PARENT: 'Parent' };

export const ALERT_TYPES = {
  OVERDUE: { label: 'Overdue' },
  DUE_SOON: { label: 'Due soon' },
  LATE_DOSE: { label: 'Late dose' },
  LOW_STOCK: { label: 'Low stock' },
  EXPIRY: { label: 'Expiry' },
};
