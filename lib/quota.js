'use strict';

// Quota and limit tracking for Claude Code and Google Antigravity.

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
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

let lastSuccessfulClaude = null;
const CLAUDE_OAUTH_TOKEN_URLS = [
  'https://platform.claude.com/v1/oauth/token',
  'https://console.anthropic.com/v1/oauth/token'
];
const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

async function refreshClaudeOAuthToken(creds, credPath) {
  if (!creds || !creds.claudeAiOauth || !creds.claudeAiOauth.refreshToken) {
    return null;
  }
  const refreshToken = creds.claudeAiOauth.refreshToken;
  const scopes = Array.isArray(creds.claudeAiOauth.scopes) && creds.claudeAiOauth.scopes.length > 0
    ? creds.claudeAiOauth.scopes.join(' ')
    : undefined;

  const payload = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLAUDE_OAUTH_CLIENT_ID,
    ...(scopes ? { scope: scopes } : {})
  };

  for (const tokenUrl of CLAUDE_OAUTH_TOKEN_URLS) {
    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'claude-code/0.2.29'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(7000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.access_token) {
          creds.claudeAiOauth.accessToken = data.access_token;
          if (data.refresh_token) {
            creds.claudeAiOauth.refreshToken = data.refresh_token;
          }
          if (typeof data.expires_in === 'number') {
            creds.claudeAiOauth.expiresAt = Date.now() + (data.expires_in * 1000);
          }
          if (typeof data.refresh_token_expires_in === 'number') {
            creds.claudeAiOauth.refreshTokenExpiresAt = Date.now() + (data.refresh_token_expires_in * 1000);
          }
          if (credPath) {
            try {
              fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), 'utf8');
            } catch {}
          }
          return data.access_token;
        }
      }
    } catch {}
  }
  return null;
}

async function performClaudeUsageRequest(bearerToken) {
  let body = '';
  let reqStatus = 0;
  try {
    const resp = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/0.2.29',
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });
    reqStatus = resp.status;
    if (resp.ok) {
      body = await resp.text();
    }
  } catch {}

  if (!body || reqStatus !== 200) {
    try {
      const curlOut = execFileSync('curl.exe', [
        '-s',
        'https://api.anthropic.com/api/oauth/usage',
        '-H', `Authorization: Bearer ${bearerToken}`,
        '-H', 'anthropic-beta: oauth-2025-04-20',
        '-H', 'User-Agent: claude-code/0.2.29',
        '-H', 'Content-Type: application/json'
      ], { encoding: 'utf8', timeout: 5000 });
      if (curlOut) {
        body = curlOut;
      }
    } catch {}
  }
  return { body, status: reqStatus };
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
      } else {
        const refreshed = await refreshClaudeOAuthToken(creds, credPath);
        if (refreshed) {
          token = refreshed;
        }
      }
    } catch {}
  }

  let reqRes = await performClaudeUsageRequest(token);
  let rawBody = reqRes.body;
  let status = reqRes.status;

  // If unauthorized or token expired, attempt refresh and retry request
  let isAuthError = status === 401;
  if (!isAuthError && rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed.error && (parsed.error.type === 'authentication_error' || (typeof parsed.error.message === 'string' && parsed.error.message.toLowerCase().includes('expired')))) {
        isAuthError = true;
      }
    } catch {}
  }

  if (isAuthError) {
    const refreshed = await refreshClaudeOAuthToken(creds, credPath);
    if (refreshed) {
      token = refreshed;
      reqRes = await performClaudeUsageRequest(token);
      rawBody = reqRes.body;
      status = reqRes.status;
    }
  }

  if (!rawBody) {
    if (lastSuccessfulClaude) return lastSuccessfulClaude;
    return { available: false, error: 'API nicht erreichbar' };
  }

  try {
    const data = JSON.parse(rawBody);
    if (data.error) {
      if (lastSuccessfulClaude) return lastSuccessfulClaude;
      return { available: false, error: data.error.message || 'API Fehler' };
    }

    const fiveHour = data.five_hour || {};
    const sevenDay = data.seven_day || {};

    const fiveHourPct = typeof fiveHour.utilization === 'number' ? Math.round(fiveHour.utilization) : null;
    const sevenDayPct = typeof sevenDay.utilization === 'number' ? Math.round(sevenDay.utilization) : null;

    const fiveHourReset = fiveHour.resets_at ? new Date(fiveHour.resets_at).getTime() : 0;
    const sevenDayReset = sevenDay.resets_at ? new Date(sevenDay.resets_at).getTime() : 0;

    const result = {
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
    lastSuccessfulClaude = result;
    return result;
  } catch (err) {
    if (lastSuccessfulClaude) return lastSuccessfulClaude;
    return { available: false, error: err.message };
  }
}

let cachedHub = null;
let lastHubCheckTime = 0;
const HUB_CACHE_TTL_MS = 60 * 1000;

function detectAgyHub() {
  const now = Date.now();
  if (cachedHub && (now - lastHubCheckTime) < HUB_CACHE_TTL_MS) {
    return cachedHub;
  }
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name = 'agy.exe'\" | Select-Object -ExpandProperty CommandLine"
    ], { encoding: 'utf8', timeout: 3500 });
    const portMatch = out.match(/--hub-port=(\d+)/);
    const csrfMatch = out.match(/--csrf_token=([a-zA-Z0-9-]+)/);
    if (portMatch && csrfMatch) {
      cachedHub = {
        port: Number(portMatch[1]),
        csrfToken: csrfMatch[1]
      };
      lastHubCheckTime = now;
      return cachedHub;
    }
  } catch {}
  return cachedHub;
}

async function fetchLiveAntigravityQuota(hub) {
  if (!hub || !hub.port || !hub.csrfToken) return null;
  return new Promise((resolve) => {
    const body = JSON.stringify({});
    const req = http.request({
      hostname: '127.0.0.1',
      port: hub.port,
      path: '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': hub.csrfToken,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 3000
    }, (res) => {
      if (res.statusCode !== 200) {
        cachedHub = null;
        return resolve(null);
      }
      let buf = '';
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          resolve(json?.response || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => {
      cachedHub = null;
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

async function fetchAntigravityQuota() {
  const dbFile = path.join(antigravityDir(), 'conversation_summaries.db');
  if (!fs.existsSync(dbFile)) {
    return { available: false, error: 'Keine Antigravity-Datenbank gefunden' };
  }

  // Trigger live hub fetch in parallel with database reading
  const hub = detectAgyHub();
  const livePromise = fetchLiveAntigravityQuota(hub);

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

    let liveResponse = null;
    try {
      liveResponse = await livePromise;
    } catch {}

    let gemini5h = null;
    let geminiWeekly = null;
    let thirdParty5h = null;
    let thirdPartyWeekly = null;

    if (liveResponse && Array.isArray(liveResponse.groups)) {
      for (const g of liveResponse.groups) {
        const name = (g.displayName || '').toLowerCase();
        const buckets = Array.isArray(g.buckets) ? g.buckets : [];
        const isGemini = name.includes('gemini');
        const is3p = name.includes('claude') || name.includes('gpt') || name.includes('3p');

        for (const b of buckets) {
          const remFrac = typeof b.remainingFraction === 'number' ? b.remainingFraction : null;
          const usedPct = remFrac !== null ? Math.min(100, Math.max(0, Math.round((1 - remFrac) * 100))) : null;
          const resetsAt = b.resetTime ? new Date(b.resetTime).getTime() : 0;
          const resetLabel = formatResetTime(resetsAt);
          const bucketData = {
            percent: usedPct,
            remainingFraction: remFrac,
            resetsAt,
            resetLabel,
            description: b.description || ''
          };

          const is5h = b.window === '5h' || (b.bucketId && b.bucketId.includes('5h'));
          const isWeekly = b.window === 'weekly' || (b.bucketId && b.bucketId.includes('weekly'));

          if (is5h) {
            if (isGemini) gemini5h = bucketData;
            else if (is3p) thirdParty5h = bucketData;
          } else if (isWeekly) {
            if (isGemini) geminiWeekly = bucketData;
            else if (is3p) thirdPartyWeekly = bucketData;
          }
        }
      }
    }

    return {
      available: true,
      hasLiveQuota: Boolean(gemini5h || geminiWeekly),
      gemini: {
        fiveHour: gemini5h,
        weekly: geminiWeekly
      },
      thirdParty: {
        fiveHour: thirdParty5h,
        weekly: thirdPartyWeekly
      },
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

async function getQuotaSummary(force = false, enabledProviders = {}) {
  const claudeEnabled = enabledProviders.claude !== false;
  const agEnabled = enabledProviders.antigravity !== false;

  const now = Date.now();
  const ttl = (cachedSummary && cachedSummary.claude && cachedSummary.claude.available) ? CACHE_TTL_MS : 10000;
  if (!force && cachedSummary && (now - lastFetchTime) < ttl) {
    return cachedSummary;
  }

  const [claudeResult, antigravityResult] = await Promise.allSettled([
    claudeEnabled ? fetchClaudeQuota() : Promise.resolve({ available: false }),
    agEnabled ? fetchAntigravityQuota() : Promise.resolve({ available: false })
  ]);

  cachedSummary = {
    claude: claudeResult.status === 'fulfilled' ? claudeResult.value : (lastSuccessfulClaude || { available: false, error: 'Fehler beim Abruf' }),
    antigravity: antigravityResult.status === 'fulfilled' ? antigravityResult.value : { available: false, error: 'Fehler beim Abruf' },
    updatedAt: now
  };
  lastFetchTime = now;
  return cachedSummary;
}

const AG_WINDOW_MS = { fiveHour: 5 * 3600 * 1000, weekly: 7 * 24 * 3600 * 1000 };
const agResetCache = new Map(); // sessionId -> last resolved resetsAt

// Resolves when the Antigravity limit that aborted a session at `blockedAt` lifts. The 429 carries
// no reset time, so it comes from the exhausted live-quota bucket whose window covers `blockedAt`.
// None covers it: the limit is already over, `blockedAt` (a past time) is returned. No live quota
// (Antigravity not running): the last resolved value, else 0 for "unknown".
function resolveAntigravityReset(sessionId, blockedAt, agQuota) {
  const groups = agQuota && agQuota.available ? [agQuota.gemini, agQuota.thirdParty].filter(Boolean) : [];
  const buckets = [];
  for (const group of groups) {
    for (const key of Object.keys(AG_WINDOW_MS)) {
      if (group[key]) buckets.push({ ...group[key], windowMs: AG_WINDOW_MS[key] });
    }
  }
  if (buckets.length === 0) return agResetCache.get(sessionId) || 0;

  let resetsAt = 0;
  for (const b of buckets) {
    const exhausted = typeof b.remainingFraction === 'number' && b.remainingFraction <= 0;
    if (exhausted && b.resetsAt && blockedAt >= b.resetsAt - b.windowMs) {
      resetsAt = Math.max(resetsAt, b.resetsAt);
    }
  }
  if (!resetsAt) resetsAt = blockedAt || 1;
  agResetCache.set(sessionId, resetsAt);
  return resetsAt;
}

module.exports = {
  getQuotaSummary,
  fetchClaudeQuota,
  fetchAntigravityQuota,
  formatResetTime,
  resolveAntigravityReset
};

