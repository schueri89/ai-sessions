'use strict';

// Aggregation and metrics for daily token usage, costs and hourly timelines
// for Claude Code and Google Antigravity.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const { resolveProject } = require('./project');

const CACHE_TTL_MS = 25 * 1000;
let cachedData = null;
let lastCacheTime = 0;

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function antigravityDir() {
  return process.env.ANTIGRAVITY_APP_DATA_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
}

// Rates per 1,000,000 tokens in USD
const MODEL_PRICING = {
  'claude-opus-5-5': { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4': { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-3-opus': { input: 15.0, output: 75.0, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-3-7-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-3-5-haiku': { input: 0.80, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  'gemini-2.5-flash': { input: 0.075, output: 0.30, cacheRead: 0.01875, cacheWrite: 0.075 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40, cacheRead: 0.025, cacheWrite: 0.10 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30, cacheRead: 0.01875, cacheWrite: 0.075 },
  'gemini-2.5-pro': { input: 1.25, output: 5.0, cacheRead: 0.3125, cacheWrite: 1.25 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0, cacheRead: 0.3125, cacheWrite: 1.25 },
  'gemini-ultra': { input: 5.0, output: 20.0, cacheRead: 1.25, cacheWrite: 5.0 }
};

function getModelPricing(modelName, provider = 'claude') {
  if (!modelName) {
    return provider === 'antigravity' ? MODEL_PRICING['gemini-2.5-flash'] : MODEL_PRICING['claude-3-7-sonnet'];
  }
  const m = String(modelName).toLowerCase();
  for (const [key, p] of Object.entries(MODEL_PRICING)) {
    if (m.includes(key)) return p;
  }
  if (m.includes('haiku')) return MODEL_PRICING['claude-3-5-haiku'];
  if (m.includes('opus')) return MODEL_PRICING['claude-opus-5-5'];
  if (m.includes('sonnet')) return MODEL_PRICING['claude-3-7-sonnet'];
  if (m.includes('flash')) return MODEL_PRICING['gemini-2.5-flash'];
  if (m.includes('pro')) return MODEL_PRICING['gemini-2.5-pro'];
  if (m.includes('ultra')) return MODEL_PRICING['gemini-ultra'];
  return provider === 'antigravity' ? MODEL_PRICING['gemini-2.5-flash'] : MODEL_PRICING['claude-3-7-sonnet'];
}

function calculateTurnCost(tokens, modelName, provider) {
  const p = getModelPricing(modelName, provider);
  const inputCost = ((tokens.input || 0) / 1000000) * p.input;
  const outputCost = ((tokens.output || 0) / 1000000) * p.output;
  const cacheReadCost = ((tokens.cacheRead || 0) / 1000000) * p.cacheRead;
  const cacheWriteCost = ((tokens.cacheWrite || 0) / 1000000) * p.cacheWrite;
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

function getTodayStartMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function loadAntigravityWorkspaceMap() {
  const map = new Map();
  const dbFile = path.join(antigravityDir(), 'conversation_summaries.db');
  if (!fs.existsSync(dbFile)) return map;
  try {
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
      const rows = db.prepare('SELECT conversation_id, workspace_uris, title FROM conversation_summaries').all();
      for (const r of rows) {
        if (r.conversation_id) {
          map.set(r.conversation_id, {
            workspaces: r.workspace_uris ? [r.workspace_uris] : [],
            title: r.title || ''
          });
        }
      }
    } finally {
      try { db.close(); } catch {}
    }
  } catch {}
  return map;
}

function collectRawTurns(todayStartMs) {
  const turns = [];

  // 1. Collect Claude Code turns
  const claudeRoot = path.join(claudeDir(), 'projects');
  if (fs.existsSync(claudeRoot)) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(claudeRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {}

    for (const d of dirs) {
      const dirPath = path.join(claudeRoot, d.name);
      let files = [];
      try { files = fs.readdirSync(dirPath); } catch {}
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const filePath = path.join(dirPath, f);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < todayStartMs) continue;

          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          let detectedProject = '';

          for (const line of lines) {
            if (!line) continue;
            if (!detectedProject) {
              const m = line.match(/[\\\/]webapps[\\\/]ROOT[\\\/]([a-zA-Z0-9_\-\.]+)/i);
              if (m && !['WEB-INF', 'META-INF', 'lucee.code-workspace'].includes(m[1])) {
                detectedProject = m[1];
              }
            }

            if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue;
            let rec;
            try { rec = JSON.parse(line); } catch { continue; }

            const ts = Date.parse(rec.timestamp);
            if (isNaN(ts) || ts < todayStartMs) continue;

            const u = rec.message && rec.message.usage;
            if (!u) continue;

            const input = Number(u.input_tokens) || 0;
            const output = Number(u.output_tokens) || 0;
            const cacheWrite = Number(u.cache_creation_input_tokens) || 0;
            const cacheRead = Number(u.cache_read_input_tokens) || 0;
            const model = (rec.message && rec.message.model) || 'claude-3-7-sonnet';
            const sessionId = rec.sessionId || path.basename(f, '.jsonl');

            const project = resolveProject({
              cwd: rec.cwd || '',
              hintProject: detectedProject
            });

            turns.push({
              provider: 'claude',
              timestamp: ts,
              hour: new Date(ts).getHours(),
              sessionId,
              project,
              model,
              input,
              output,
              cacheWrite,
              cacheRead,
              cost: calculateTurnCost({ input, output, cacheRead, cacheWrite }, model, 'claude')
            });
          }
        } catch {}
      }
    }
  }

  // 2. Collect Antigravity turns
  const agyRoot = path.join(antigravityDir(), 'brain');
  if (fs.existsSync(agyRoot)) {
    const agyMetaMap = loadAntigravityWorkspaceMap();
    let dirs = [];
    try {
      dirs = fs.readdirSync(agyRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {}

    for (const d of dirs) {
      const sessionId = d.name;
      const transcriptFile = path.join(agyRoot, sessionId, '.system_generated', 'logs', 'transcript.jsonl');
      if (!fs.existsSync(transcriptFile)) continue;
      try {
        const stat = fs.statSync(transcriptFile);
        if (stat.mtimeMs < todayStartMs) continue;

        const content = fs.readFileSync(transcriptFile, 'utf8');
        const lines = content.split('\n');
        const meta = agyMetaMap.get(sessionId) || {};
        const project = resolveProject({
          workspaces: meta.workspaces || [],
          title: meta.title || ''
        });

        for (const line of lines) {
          if (!line || !line.includes('"PLANNER_RESPONSE"') || !line.includes('input_tokens')) continue;
          let rec;
          try { rec = JSON.parse(line); } catch { continue; }

          const ts = Date.parse(rec.created_at);
          if (isNaN(ts) || ts < todayStartMs) continue;

          const input = Number(rec.input_tokens) || 0;
          const output = Number(rec.output_tokens) || 0;
          const cacheRead = Number(rec.cache_read_tokens) || 0;
          const cacheWrite = 0;
          const model = rec.model || 'Gemini 2.5 Flash';

          turns.push({
            provider: 'antigravity',
            timestamp: ts,
            hour: new Date(ts).getHours(),
            sessionId,
            project,
            model,
            input,
            output,
            cacheWrite,
            cacheRead,
            cost: calculateTurnCost({ input, output, cacheRead, cacheWrite }, model, 'antigravity')
          });
        }
      } catch {}
    }
  }

  return turns;
}

function getTodayMetrics(filterProvider = 'all') {
  const now = Date.now();
  const todayStartMs = getTodayStartMs();

  if (!cachedData || (now - lastCacheTime) > CACHE_TTL_MS) {
    cachedData = collectRawTurns(todayStartMs);
    lastCacheTime = now;
  }

  const rawTurns = cachedData;
  const filtered = filterProvider === 'all'
    ? rawTurns
    : rawTurns.filter((t) => t.provider === filterProvider);

  // 1. Summary aggregations
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let estimatedCost = 0;
  let claudeCost = 0;
  let antigravityCost = 0;
  const uniqueSessions = new Set();

  for (const t of filtered) {
    inputTokens += t.input;
    outputTokens += t.output;
    cacheReadTokens += t.cacheRead;
    cacheWriteTokens += t.cacheWrite;
    estimatedCost += t.cost;
    if (t.provider === 'claude') claudeCost += t.cost;
    else antigravityCost += t.cost;
    uniqueSessions.add(t.sessionId);
  }

  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const totalInputBase = inputTokens + cacheReadTokens + cacheWriteTokens;
  const cacheHitRate = totalInputBase > 0 ? (cacheReadTokens / totalInputBase) * 100 : 0;

  // Active time estimation: wall-clock minutes where at least one turn occurred
  const activeMinutesSet = new Set();
  for (const t of filtered) {
    if (t.timestamp) {
      activeMinutesSet.add(Math.floor(t.timestamp / 60000));
    }
  }
  const activeMinutes = activeMinutesSet.size;

  // 2. Hourly breakdown (24 hours)
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: String(i).padStart(2, '0') + ':00',
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    totalTokens: 0,
    turns: 0,
    cost: 0
  }));

  for (const t of filtered) {
    const h = t.hour >= 0 && t.hour < 24 ? t.hour : 0;
    hourly[h].inputTokens += t.input + t.cacheWrite;
    hourly[h].outputTokens += t.output;
    hourly[h].cacheTokens += t.cacheRead;
    hourly[h].totalTokens += (t.input + t.output + t.cacheRead + t.cacheWrite);
    hourly[h].turns += 1;
    hourly[h].cost += t.cost;
  }

  // Find max hourly total tokens for responsive bar heights
  const maxHourlyTokens = Math.max(...hourly.map((h) => h.totalTokens), 1);

  // 3. Model breakdown
  const modelMap = new Map();
  for (const t of filtered) {
    const name = t.model || (t.provider === 'claude' ? 'Claude' : 'Gemini');
    if (!modelMap.has(name)) {
      modelMap.set(name, {
        name,
        provider: t.provider,
        tokens: 0,
        cost: 0,
        turns: 0
      });
    }
    const m = modelMap.get(name);
    m.tokens += (t.input + t.output + t.cacheRead + t.cacheWrite);
    m.cost += t.cost;
    m.turns += 1;
  }
  const models = Array.from(modelMap.values())
    .filter((m) => m.tokens > 0 && m.name !== '<synthetic>')
    .map((m) => ({
      ...m,
      percent: totalTokens > 0 ? Math.round((m.tokens / totalTokens) * 100) : 0
    }))
    .sort((a, b) => b.tokens - a.tokens);

  // 4. Project breakdown
  const projectMap = new Map();
  for (const t of filtered) {
    const p = t.project || 'Sonstige';
    if (!projectMap.has(p)) {
      projectMap.set(p, {
        name: p,
        tokens: 0,
        cost: 0,
        turns: 0,
        sessions: new Set(),
        lastActive: 0
      });
    }
    const item = projectMap.get(p);
    item.tokens += (t.input + t.output + t.cacheRead + t.cacheWrite);
    item.cost += t.cost;
    item.turns += 1;
    item.sessions.add(t.sessionId);
    if (t.timestamp > item.lastActive) item.lastActive = t.timestamp;
  }
  const projects = Array.from(projectMap.values())
    .map((p) => ({
      name: p.name,
      tokens: p.tokens,
      cost: p.cost,
      turns: p.turns,
      sessionsCount: p.sessions.size,
      lastActive: p.lastActive
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    filterProvider,
    summary: {
      totalTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cacheHitRate: Math.round(cacheHitRate * 10) / 10,
      estimatedCost,
      claudeCost,
      antigravityCost,
      turnsCount: filtered.length,
      sessionsCount: uniqueSessions.size,
      activeMinutes
    },
    hourly,
    maxHourlyTokens,
    models,
    projects
  };
}

module.exports = {
  getTodayMetrics,
  calculateTurnCost
};
