'use strict';

// Display texts shared by the tree view and the board.

const STATES = {
  waiting: { label: 'Wartet auf dich', icon: 'bell-dot', color: 'charts.orange' },
  busy: { label: 'Arbeitet', icon: 'loading~spin', color: 'charts.blue' },
  idle: { label: 'Fertig', icon: 'pass', color: 'charts.green' },
  closed: { label: 'Geschlossen, nicht erledigt', icon: 'circle-large-outline', color: 'descriptionForeground' },
  done: { label: 'Erledigt', icon: 'check-all', color: 'disabledForeground' }
};

const STATE_ORDER = ['waiting', 'busy', 'idle', 'closed', 'done'];

// Known values of the registry field "waitingFor"; unknown ones are shown verbatim.
const WAITING_REASONS = {
  'input needed': 'Eingabe nötig',
  'dialog open': 'Dialog offen',
  'sandbox request': 'Sandbox-Anfrage',
  'permission': 'Freigabe nötig'
};

function waitingReason(raw) {
  if (!raw) return '';
  return WAITING_REASONS[raw] || raw;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function relativeTime(ms, now = Date.now()) {
  if (!ms) return '';
  const minutes = Math.floor((now - ms) / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `seit ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `seit ${hours} Std.`;
  return `seit ${formatDateTime(ms)}`;
}

function lastActive(ms, now = Date.now()) {
  if (!ms) return '';
  const minutes = Math.floor((now - ms) / 60000);
  if (minutes < 60) return `zuletzt aktiv vor ${Math.max(minutes, 1)} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `zuletzt aktiv vor ${hours} Std.`;
  return `zuletzt aktiv am ${formatDateTime(ms)}`;
}

// One-line summary under the title: reason (if waiting) and age of the current state.
function describe(session, now = Date.now()) {
  if (session.state === 'closed') return lastActive(session.statusUpdatedAt, now);
  const parts = [];
  if (session.state === 'waiting') parts.push(waitingReason(session.waitingFor));
  if (session.rawStatus && !STATES[session.rawStatus]) {
    parts.push(`Status: ${session.rawStatus}`);
  }
  parts.push(relativeTime(session.statusUpdatedAt, now));
  return parts.filter(Boolean).join(' · ');
}

module.exports = { STATES, STATE_ORDER, waitingReason, formatDateTime, relativeTime, describe };
