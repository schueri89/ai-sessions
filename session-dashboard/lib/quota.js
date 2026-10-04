'use strict';

// Quota and limit tracking for Claude Code and Google Antigravity.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const CACHE_TTL_MS = 45 * 1000; // 45 seconds cache to avoid API rate limits & heavy I/O
let cachedSummary = null;
let lastFetchTime = 0;

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function antigravityDir() {
  return process.env.ANTIGRAVITY_APP_DATA_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
}

function formatResetTime(target) {
  if (!target) return '';
  const d = new Date(target);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return `${days[d.getDay()]} ${time}`;
}

async function fetchClaudeQuota() {
  const credPath = path.join(claudeDir(), '.credentials.json');
  if (!fs.existsSync(credPath)) {
    return { available: false, error: 'Keine Credentials gefunden' };
  }

  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  } catch {
    return { available: false, error: 'Credentials unlesbar' };
  }

  if (!creds || !creds.claudeAiOauth || !creds.claudeAiOauth.accessToken) {
    return { available: false, error: 'Kein OAuth-Token hinterlegt' };
  }

  let token = creds.claudeAiOauth.accessToken;
  const expiresAt = Number(creds.claudeAiOauth.expiresAt) || 0;

  // Check if token expired or about to expire in < 60s
  if (Date.now() >= expiresAt - 60000) {
    try {
      const freshCreds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      if (freshCreds.claudeAiOauth && Date.now() < Number(freshCreds.claudeAiOauth.expiresAt) - 60000) {
        creds = freshCreds;
        token = creds.claudeAiOauth.accessToken;
      } else if (creds.claudeAiOauth.refreshToken) {
        // Attempt refresh
        const refreshResp = await fetch('https://console.anthropic.com/v1/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: creds.claudeAiOauth.refreshToken,
            grant_type: 'refresh_token'
          }),
          signal: AbortSignal.timeout(5000)
        });
        if (refreshResp.ok) {
          const refData = await refreshResp.json();
          token = refData.access_token;
          creds.claudeAiOauth.accessToken = token;
          creds.claudeAiOauth.expiresAt = Date.now() + (refData.expires_in * 1000);
          try {
            fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), 'utf8');
          } catch {}
        }
      }
    } catch {}
  }

  let rawBody = '';
  let status = 0;

  // 1. Try native fetch with 5s timeout
  try {
    const resp = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });
    status = resp.status;
    if (resp.ok) {
      rawBody = await resp.text();
    }
  } catch {}

  // 2. Fallback to curl.exe if fetch fails or is rejected
  if (!rawBody || status !== 200) {
    try {
      rawBody = execFileSync('curl.exe', [
        '-s',
        'https://api.anthropic.com/api/oauth/usage',
        '-H', `Authorization: Bearer ${token}`,
        '-H', 'anthropic-beta: oauth-2025-04-20',
        '-H', 'Content-Type: application/json'
      ], { encoding: 'utf8', timeout: 5000 });
    } catch {}
  }

  if (!rawBody) {
    return { available: false, error: 'API nicht erreichbar' };
  }

  try {
    const data = JSON.parse(rawBody);
    const fiveHour = data.five_hour || {};
    const sevenDay = data.seven_day || {};

    const fiveHourPct = typeof fiveHour.utilization === 'number' ? Math.round(fiveHour.utilization) : null;
    const sevenDayPct = typeof sevenDay.utilization === 'number' ? Math.round(sevenDay.utilization) : null;

    const fiveHourReset = fiveHour.resets_at ? new Date(fiveHour.resets_at).getTime() : 0;
    const sevenDayReset = sevenDay.resets_at ? new Date(sevenDay.resets_at).getTime() : 0;

    return {
      available: true,
      subscriptionType: creds.claudeAiOauth.subscriptionType || 'Pro',
      fiveHour: {
        percent: fiveHourPct,
        resetsAt: fiveHourReset,
        resetLabel: formatResetTime(fiveHourReset)
      },
      sevenDay: {
        percent: sevenDayPct,
        resetsAt: sevenDayReset,
        resetLabel: formatResetTime(sevenDayReset)
      }
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

async function fetchAntigravityQuota() {
  const dbFile = path.join(antigravityDir(), 'conversation_summaries.db');
  if (!fs.existsSync(dbFile)) {
    return { available: false, error: 'Keine Antigravity-Datenbank gefunden' };
  }

  let db = null;
  try {
    db = new DatabaseSync(dbFile, { readOnly: true });
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const rows = db.prepare('SELECT conversation_id, last_modified_time FROM conversation_summaries WHERE last_modified_time >= ?').all(sevenDaysAgoIso);

    const now = Date.now();
    const fiveHoursAgoMs = now - 5 * 3600 * 1000;
    const sevenDaysAgoMs = now - 7 * 24 * 3600 * 1000;

    let tokens5h = 0;
    let tokens7d = 0;
    let rateLimited = false;

    for (const r of rows) {
      const transFile = path.join(antigravityDir(), 'brain', r.conversation_id, '.system_generated', 'logs', 'transcript.jsonl');
      if (!fs.existsSync(transFile)) continue;
      try {
        const content = fs.readFileSync(transFile, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (!line || (!line.includes('PLANNER_RESPONSE') && !line.includes('RESOURCE_EXHAUSTED'))) continue;
          try {
            const step = JSON.parse(line);
            if (step.type === 'PLANNER_RESPONSE' && step.created_at) {
              const ts = new Date(step.created_at).getTime();
              if (ts >= sevenDaysAgoMs) {
                const tok = (Number(step.input_tokens) || 0) + (Number(step.cache_read_tokens) || 0) + (Number(step.output_tokens) || 0);
                tokens7d += tok;
                if (ts >= fiveHoursAgoMs) {
                  tokens5h += tok;
                }
              }
            } else if (step.type === 'ERROR_MESSAGE' && step.error && step.error.includes('RESOURCE_EXHAUSTED')) {
              const ts = step.created_at ? new Date(step.created_at).getTime() : 0;
              if (now - ts < 15 * 60 * 1000) {
                rateLimited = true;
              }
            }
          } catch {}
        }
      } catch {}
    }

    return {
      available: true,
      tokens5h,
      tokens7d,
      isRateLimited: rateLimited,
      rateLimitMessage: rateLimited ? 'Google Cloud Code: Quota erschöpft (429)' : ''
    };
  } catch (err) {
    return { available: false, error: err.message };
  } finally {
    if (db) {
      try { db.close(); } catch {}
    }
  }
}

async function getQuotaSummary(force = false) {
  const now = Date.now();
  if (!force && cachedSummary && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedSummary;
  }

  const [claudeResult, antigravityResult] = await Promise.allSettled([
    fetchClaudeQuota(),
    fetchAntigravityQuota()
  ]);

  cachedSummary = {
    claude: claudeResult.status === 'fulfilled' ? claudeResult.value : { available: false, error: 'Fehler beim Abruf' },
    antigravity: antigravityResult.status === 'fulfilled' ? antigravityResult.value : { available: false, error: 'Fehler beim Abruf' },
    updatedAt: now
  };
  lastFetchTime = now;
  return cachedSummary;
}

module.exports = {
  getQuotaSummary,
  fetchClaudeQuota,
  fetchAntigravityQuota,
  formatResetTime
};

