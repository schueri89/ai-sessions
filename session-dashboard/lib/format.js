'use strict';

// Display texts shared by the tree view and the board.

const STATES = {
  waiting: { label: 'Wartet auf dich', icon: 'bell-dot', color: 'charts.orange' },
  busy: { label: 'Arbeitet', icon: 'loading~spin', color: 'charts.blue' },
  bookmarked: { label: 'Gemerkt', icon: 'pinned', color: 'charts.yellow' },
  idle: { label: 'Fertig', icon: 'pass', color: 'charts.green' },
  done: { label: 'Erledigt', icon: 'check-all', color: 'disabledForeground' }
};

const STATE_ORDER = ['waiting', 'busy', 'bookmarked', 'idle', 'done'];

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

function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} Uhr`;
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
  if (session.rateLimit) {
    const isPastReset = session.rateLimit.resetsAt && now >= session.rateLimit.resetsAt;
    if (isPastReset) {
      return '⚠️ Limit vorbei · Bereit zum Fortsetzen';
    }
    if (session.rateLimit.resetsAt) {
      return `⏳ Limit bis ${formatTime(session.rateLimit.resetsAt)}`;
    }
    return '⏳ Session-Limit erreicht';
  }
  if (session.state === 'closed') return lastActive(session.statusUpdatedAt, now);
  const parts = [];
  if (session.state === 'waiting') parts.push(waitingReason(session.waitingFor));
  if (session.rawStatus && !STATES[session.rawStatus] && !session.rawStatus.startsWith('CASCADE_RUN_STATUS')) {
    parts.push(`Status: ${session.rawStatus}`);
  }
  parts.push(relativeTime(session.statusUpdatedAt, now));
  return parts.filter(Boolean).join(' · ');
}

function formatTokens(n) {
  if (!n || typeof n !== 'number') return '0';
  if (n >= 1000000) {
    const m = n / 1000000;
    return (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)) + 'M';
  }
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 100 ? Math.round(k) : (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1))) + 'k';
  }
  return String(n);
}

function resolveMaxContext(model) {
  if (!model) return 200000;
  const m = String(model).toLowerCase();
  if (m.includes('2m')) return 2000000;
  if (m.includes('gemini') || m.includes('antigravity')) return 1000000;
  if (
    m.includes('opus-5') ||
    m.includes('opus-4-8') || m.includes('opus-4.8') ||
    m.includes('opus-4-7') || m.includes('opus-4.7') ||
    m.includes('opus-4-6') || m.includes('opus-4.6') ||
    m.includes('sonnet-5') ||
    m.includes('sonnet-4-6') || m.includes('sonnet-4.6') ||
    m.includes('fable') ||
    m.includes('mythos') ||
    m.includes('1m')
  ) {
    return 1000000;
  }
  return 200000;
}

function friendlyModel(m) {
  if (!m) return '';
  const lower = m.toLowerCase();
  if (lower.includes('opus-5-5') || lower.includes('opus-5.5')) return 'Opus 5.5';
  if (lower.includes('opus-5') || lower.includes('opus-5.')) return 'Opus 5';
  if (lower.includes('opus-4-8') || lower.includes('opus-4.8')) return 'Opus 4.8';
  if (lower.includes('opus-4-7') || lower.includes('opus-4.7')) return 'Opus 4.7';
  if (lower.includes('opus-4-6') || lower.includes('opus-4.6')) return 'Opus 4.6';
  if (lower.includes('opus-4-5') || lower.includes('opus-4.5')) return 'Opus 4.5';
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet-5-5') || lower.includes('sonnet-5.5')) return 'Sonnet 5.5';
  if (lower.includes('sonnet-5') || lower.includes('sonnet-5.')) return 'Sonnet 5';
  if (lower.includes('sonnet-4-6') || lower.includes('sonnet-4.6')) return 'Sonnet 4.6';
  if (lower.includes('sonnet-4-5') || lower.includes('sonnet-4.5')) return 'Sonnet 4.5';
  if (lower.includes('sonnet-3-7') || lower.includes('3.7-sonnet')) return 'Sonnet 3.7';
  if (lower.includes('sonnet-3-5') || lower.includes('3.5-sonnet') || lower.includes('sonnet-20241022')) return 'Sonnet 3.5';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku-4-5') || lower.includes('haiku-4.5')) return 'Haiku 4.5';
  if (lower.includes('haiku-3-5') || lower.includes('haiku-3.5')) return 'Haiku 3.5';
  if (lower.includes('haiku')) return 'Haiku';
  if (lower.includes('fable-5-1') || lower.includes('fable-5.1')) return 'Fable 5.1';
  if (lower.includes('fable')) return 'Fable';
  if (lower.includes('mythos')) return 'Mythos';
  if (lower.includes('gemini-2.0-pro') || lower.includes('gemini-2-pro')) return 'Gemini 2.0 Pro';
  if (lower.includes('gemini-2.0-flash') || lower.includes('gemini-2-flash')) return 'Gemini 2.0 Flash';
  if (lower.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
  if (lower.includes('gemini')) return 'Gemini';
  return m.replace(/^claude-/, '');
}

module.exports = { STATES, STATE_ORDER, waitingReason, formatDateTime, formatTime, relativeTime, describe, formatTokens, friendlyModel, resolveMaxContext };
