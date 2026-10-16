'use strict';

// Export of manually approved Copilot terminal commands (for the admin whitelist review).

const SCOPE_LABELS = { today: 'Heute', '7d': 'Letzte 7 Tage', '30d': 'Letzte 30 Tage' };
const FORMATS = {
  csv: { label: 'CSV (Excel)', ext: 'csv' },
  md: { label: 'Markdown', ext: 'md' },
  json: { label: 'JSON', ext: 'json' }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Validates the rows coming from the webview.
function normalizeRows(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.cmd !== 'string' || !r.cmd) continue;
    const sub = typeof r.sub === 'string' ? r.sub : '';
    const cmd = r.cmd.slice(0, 100);
    const text = sub ? cmd + ' ' + sub.slice(0, 100) : cmd;
    out.push({
      command: text,
      program: cmd,
      subcommand: sub.slice(0, 100),
      count: Math.max(0, Math.floor(Number(r.count) || 0)),
      readOnly: !!r.safe,
      // Same pattern shape as the "Regel kopieren" button.
      pattern: sub
        ? '/^' + escapeRegex(cmd) + '\\s+' + escapeRegex(sub) + '\\b/i'
        : '/^' + escapeRegex(cmd) + '\\b/i'
    });
  }
  return out;
}

function csvCell(value) {
  let s = String(value);
  // Prevent formula injection when opened in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  const lines = [['Befehl', 'Programm', 'Unterbefehl', 'Anzahl', 'Lesend (Vorschlag)', 'Regex-Pattern (autoApprove)'].join(';')];
  for (const r of rows) {
    lines.push([r.command, r.program, r.subcommand, r.count, r.readOnly ? 'Ja' : 'Nein', r.pattern].map(csvCell).join(';'));
  }
  // BOM so Excel detects UTF-8.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function mdCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function toMarkdown(rows, meta) {
  const lines = [
    '# Manuell freigegebene Terminal-Befehle (GitHub Copilot)',
    '',
    '- Zeitraum: ' + meta.scopeLabel,
    '- Erstellt: ' + meta.createdAt,
    '- Einträge: ' + rows.length,
    '',
    '| Befehl | Anzahl | Lesend (Vorschlag) | Regex-Pattern (autoApprove) |',
    '| --- | ---: | :---: | --- |'
  ];
  for (const r of rows) {
    lines.push('| `' + mdCell(r.command) + '` | ' + r.count + ' | ' + (r.readOnly ? 'Ja' : 'Nein') + ' | `' + mdCell(r.pattern) + '` |');
  }
  return lines.join('\n') + '\n';
}

function toJson(rows, meta) {
  return JSON.stringify({
    source: 'ai-sessions / GitHub Copilot',
    scope: meta.scopeLabel,
    createdAt: meta.createdAtIso,
    commands: rows
  }, null, 2) + '\n';
}

function buildApprovalExport(format, rawRows, scope) {
  const rows = normalizeRows(rawRows);
  const now = new Date();
  const meta = {
    scopeLabel: SCOPE_LABELS[scope] || String(scope || ''),
    createdAtIso: now.toISOString(),
    createdAt: now.toLocaleString('de-DE')
  };
  if (format === 'csv') return toCsv(rows);
  if (format === 'md') return toMarkdown(rows, meta);
  return toJson(rows, meta);
}

module.exports = { FORMATS, buildApprovalExport, normalizeRows };
