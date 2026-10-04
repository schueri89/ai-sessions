'use strict';

// Aggregation and metrics for token usage, costs, timelines (today, 7d, 30d)
// and Tool & Content Breakdown for Claude Code and Google Antigravity.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const { resolveProject } = require('./project');

const BUNDLE_CACHE_TTL_MS = 20 * 1000;
let cachedAnalyticsBundle = null;
let lastBundleTime = 0;

// Incremental file cache: filePath -> { mtimeMs, size, turns: [...] }
const fileTurnCache = new Map();

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function antigravityDir() {
  return process.env.ANTIGRAVITY_APP_DATA_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
}

// Rates per 1,000,000 tokens in USD
const MODEL_PRICING = {
  'claude-opus-5-5': { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-5': { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4': { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
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
  return provider === 'antigravity' ? MODEL_PRICING['gemini-2.5-flash'] : MODEL_PRICING['claude-3-7-sonnet'];
}

function calculateTurnCost(usage, modelName, provider) {
  const p = getModelPricing(modelName, provider);
  const inCost = ((usage.input || 0) / 1000000) * p.input;
  const outCost = ((usage.output || 0) / 1000000) * p.output;
  const readCost = ((usage.cacheRead || 0) / 1000000) * p.cacheRead;
  const writeCost = ((usage.cacheWrite || 0) / 1000000) * p.cacheWrite;
  return inCost + outCost + readCost + writeCost;
}

function getStartOfDay(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TOOL_CATEGORIES = {
  read: {
    key: 'read',
    label: 'Dateien lesen (Read)',
    icon: '📖',
    color: '#06b6d4'
  },
  edit: {
    key: 'edit',
    label: 'Code schreiben & anpassen (Edit)',
    icon: '✏️',
    color: '#f59e0b'
  },
  terminal: {
    key: 'terminal',
    label: 'Terminal & Shell-Befehle (Bash)',
    icon: '🛠️',
    color: '#10b981'
  },
  search: {
    key: 'search',
    label: 'Suche & Verzeichnis-Scans',
    icon: '🔍',
    color: '#3b82f6'
  },
  web: {
    key: 'web',
    label: 'Browser & Web-Tools',
    icon: '🌐',
    color: '#a855f7'
  },
  tasks: {
    key: 'tasks',
    label: 'Tasks & Orchestrierung',
    icon: '⚙️',
    color: '#64748b'
  }
};

function categorizeTool(toolName) {
  if (!toolName) return 'tasks';
  const name = String(toolName).toLowerCase();
  if (name.startsWith('mcp__') || name.includes('browser') || name.includes('url') || name.includes('webfetch') || name.includes('fetchurl') || name.includes('read_url')) {
    return 'web';
  }
  if (name === 'read' || name === 'view_file' || name.includes('view') || name.includes('read_file')) {
    return 'read';
  }
  if (name === 'edit' || name === 'write' || name === 'replace_file_content' || name === 'write_to_file' || name.includes('edit') || name.includes('patch')) {
    return 'edit';
  }
  if (name === 'bash' || name === 'powershell' || name === 'run_command' || name === 'manage_task' || name.includes('exec') || name.includes('command')) {
    return 'terminal';
  }
  if (name === 'grep' || name === 'glob' || name === 'grep_search' || name === 'list_dir' || name === 'file_search' || name === 'toolsearch' || name.includes('search') || name.includes('find')) {
    return 'search';
  }
  return 'tasks';
}

function loadAntigravityWorkspaceMap() {
  const map = new Map();
  const dbPath = path.join(antigravityDir(), 'conversations.db');
  if (!fs.existsSync(dbPath)) return map;
  try {
    const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
    try {
      const rows = db.prepare('SELECT conversation_id, workspace_uris, title FROM conversations').all();
      for (const r of rows) {
        if (r && r.conversation_id) {
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

function collectRawTurns(thirtyDaysStartMs) {
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
          if (stat.mtimeMs < thirtyDaysStartMs) continue;

          let cached = fileTurnCache.get(filePath);
          if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size || (cached.turns.length > 0 && cached.turns[0].tools === undefined)) {
            const fileTurns = [];
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
            }

            for (const line of lines) {
              if (!line || !line.includes('"type":"assistant"') || !line.includes('"usage"')) continue;
              let rec;
              try { rec = JSON.parse(line); } catch { continue; }

              const ts = Date.parse(rec.timestamp);
              if (isNaN(ts)) continue;

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

              const toolCalls = [];
              let hasThinking = false;
              if (rec.message && Array.isArray(rec.message.content)) {
                for (const c of rec.message.content) {
                  if (c.type === 'tool_use' && c.name) {
                    toolCalls.push(c.name);
                  }
                  if (c.type === 'thinking') {
                    hasThinking = true;
                  }
                }
              }

              fileTurns.push({
                provider: 'claude',
                timestamp: ts,
                dateKey: toDateKey(new Date(ts)),
                hour: new Date(ts).getHours(),
                sessionId,
                project,
                model,
                input,
                output,
                cacheWrite,
                cacheRead,
                tools: toolCalls,
                thinking: hasThinking,
                cost: calculateTurnCost({ input, output, cacheRead, cacheWrite }, model, 'claude')
              });
            }

            cached = { mtimeMs: stat.mtimeMs, size: stat.size, turns: fileTurns };
            fileTurnCache.set(filePath, cached);
          }

          for (const t of cached.turns) {
            if (t.timestamp >= thirtyDaysStartMs) turns.push(t);
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
        if (stat.mtimeMs < thirtyDaysStartMs) continue;

        let cached = fileTurnCache.get(transcriptFile);
        if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size || (cached.turns.length > 0 && cached.turns[0].tools === undefined)) {
          const fileTurns = [];
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
            if (isNaN(ts)) continue;

            const input = Number(rec.input_tokens) || 0;
            const output = Number(rec.output_tokens) || 0;
            const cacheRead = Number(rec.cache_read_tokens) || 0;
            const cacheWrite = 0;
            const model = rec.model || 'Gemini 2.5 Flash';

            const toolCalls = [];
            let hasThinking = Boolean(rec.thinking);
            if (Array.isArray(rec.tool_calls)) {
              for (const tc of rec.tool_calls) {
                const name = tc.name || (tc.function && tc.function.name);
                if (name) toolCalls.push(name);
              }
            }

            fileTurns.push({
              provider: 'antigravity',
              timestamp: ts,
              dateKey: toDateKey(new Date(ts)),
              hour: new Date(ts).getHours(),
              sessionId,
              project,
              model,
              input,
              output,
              cacheWrite,
              cacheRead,
              tools: toolCalls,
              thinking: hasThinking,
              cost: calculateTurnCost({ input, output, cacheRead, cacheWrite }, model, 'antigravity')
            });
          }

          cached = { mtimeMs: stat.mtimeMs, size: stat.size, turns: fileTurns };
          fileTurnCache.set(transcriptFile, cached);
        }

        for (const t of cached.turns) {
          if (t.timestamp >= thirtyDaysStartMs) turns.push(t);
        }
      } catch {}
    }
  }

  return turns;
}

function aggregateScope(rawTurns, scope = 'today', filterProvider = 'all') {
  const startToday = getStartOfDay(0);
  const start7d = getStartOfDay(6);
  const start30d = getStartOfDay(29);

  const sinceMs = scope === 'today' ? startToday : (scope === '7d' ? start7d : start30d);
  const filtered = rawTurns.filter((t) => t.timestamp >= sinceMs && (filterProvider === 'all' || t.provider === filterProvider));

  // 1. Summary aggregations
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let estimatedCost = 0;
  let claudeCost = 0;
  let antigravityCost = 0;
  const uniqueSessions = new Set();
  const activeMinutesSet = new Set();
  const activeDaysSet = new Set();

  for (const t of filtered) {
    inputTokens += t.input;
    outputTokens += t.output;
    cacheReadTokens += t.cacheRead;
    cacheWriteTokens += t.cacheWrite;
    estimatedCost += t.cost;
    if (t.provider === 'claude') claudeCost += t.cost;
    else antigravityCost += t.cost;
    uniqueSessions.add(t.sessionId);
    if (t.timestamp) activeMinutesSet.add(Math.floor(t.timestamp / 60000));
    if (t.dateKey) activeDaysSet.add(t.dateKey);
  }

  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const totalInputBase = inputTokens + cacheReadTokens + cacheWriteTokens;
  const cacheHitRate = totalInputBase > 0 ? (cacheReadTokens / totalInputBase) * 100 : 0;

  // 2. Timeline aggregation
  let timeline = [];
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const fullWeekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  if (scope === 'today') {
    timeline = Array.from({ length: 24 }, (_, i) => ({
      slotIndex: i,
      label: String(i).padStart(2, '0') + ':00',
      fullDateLabel: 'Heute, ' + String(i).padStart(2, '0') + ':00 Uhr',
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      totalTokens: 0,
      turns: 0,
      cost: 0
    }));

    for (const t of filtered) {
      const h = t.hour >= 0 && t.hour < 24 ? t.hour : 0;
      timeline[h].inputTokens += t.input + t.cacheWrite;
      timeline[h].outputTokens += t.output;
      timeline[h].cacheTokens += t.cacheRead;
      timeline[h].totalTokens += (t.input + t.output + t.cacheRead + t.cacheWrite);
      timeline[h].turns += 1;
      timeline[h].cost += t.cost;
    }
  } else {
    const daysCount = scope === '7d' ? 7 : 30;
    const startMs = scope === '7d' ? start7d : start30d;
    const slotMap = new Map();

    for (let d = 0; d < daysCount; d++) {
      const dt = new Date(startMs);
      dt.setDate(dt.getDate() + d);
      const dateKey = toDateKey(dt);
      const dayNum = String(dt.getDate()).padStart(2, '0');
      const monNum = String(dt.getMonth() + 1).padStart(2, '0');
      const weekday = weekdays[dt.getDay()];
      const fullWeekday = fullWeekdays[dt.getDay()];
      const label = scope === '7d' ? `${weekday} ${dayNum}.${monNum}.` : `${dayNum}.${monNum}.`;
      const fullDateLabel = `${fullWeekday}, ${dayNum}.${monNum}.${dt.getFullYear()}`;

      const item = {
        slotIndex: d,
        dateKey,
        label,
        fullDateLabel,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
        turns: 0,
        cost: 0
      };
      timeline.push(item);
      slotMap.set(dateKey, item);
    }

    for (const t of filtered) {
      const slot = slotMap.get(t.dateKey);
      if (slot) {
        slot.inputTokens += t.input + t.cacheWrite;
        slot.outputTokens += t.output;
        slot.cacheTokens += t.cacheRead;
        slot.totalTokens += (t.input + t.output + t.cacheRead + t.cacheWrite);
        slot.turns += 1;
        slot.cost += t.cost;
      }
    }
  }

  // Max total tokens in timeline for SVG scaling
  const maxTimelineTokens = Math.max(...timeline.map((s) => s.totalTokens), 1);

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

  // 5. Tool & Content Breakdown
  let totalToolCalls = 0;
  const toolCountMap = new Map();
  const categoryCountMap = {
    read: 0,
    edit: 0,
    terminal: 0,
    search: 0,
    web: 0,
    tasks: 0
  };
  let thinkingTurnsCount = 0;

  for (const t of filtered) {
    if (t.thinking) thinkingTurnsCount++;
    if (Array.isArray(t.tools)) {
      for (const toolName of t.tools) {
        totalToolCalls++;
        toolCountMap.set(toolName, (toolCountMap.get(toolName) || 0) + 1);
        const catKey = categorizeTool(toolName);
        categoryCountMap[catKey] = (categoryCountMap[catKey] || 0) + 1;
      }
    }
  }

  const toolCategories = [
    { key: 'read', label: 'Dateien lesen (Read)', icon: '📖', color: '#06b6d4', count: categoryCountMap.read },
    { key: 'edit', label: 'Code schreiben & anpassen (Edit)', icon: '✏️', color: '#f59e0b', count: categoryCountMap.edit },
    { key: 'terminal', label: 'Terminal & Shell-Befehle (Bash)', icon: '🛠️', color: '#10b981', count: categoryCountMap.terminal },
    { key: 'search', label: 'Suche & Verzeichnis-Scans', icon: '🔍', color: '#3b82f6', count: categoryCountMap.search },
    { key: 'web', label: 'Browser & Web-Tools', icon: '🌐', color: '#a855f7', count: categoryCountMap.web },
    { key: 'tasks', label: 'Tasks & Orchestrierung', icon: '⚙️', color: '#64748b', count: categoryCountMap.tasks }
  ]
    .map((c) => ({
      ...c,
      percent: totalToolCalls > 0 ? Math.round((c.count / totalToolCalls) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const topTools = Array.from(toolCountMap.entries())
    .map(([name, count]) => ({
      name,
      category: categorizeTool(name),
      count,
      percent: totalToolCalls > 0 ? Math.round((count / totalToolCalls) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const content = {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    thinkingTurns: thinkingTurnsCount,
    inputPercent: totalTokens > 0 ? Math.round((inputTokens / totalTokens) * 100) : 0,
    outputPercent: totalTokens > 0 ? Math.round((outputTokens / totalTokens) * 100) : 0,
    cacheReadPercent: totalTokens > 0 ? Math.round((cacheReadTokens / totalTokens) * 100) : 0,
    cacheWritePercent: totalTokens > 0 ? Math.round((cacheWriteTokens / totalTokens) * 100) : 0
  };

  const tools = {
    totalCalls: totalToolCalls,
    categories: toolCategories,
    topTools
  };

  return {
    scope,
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
      activeMinutes: activeMinutesSet.size,
      activeDays: activeDaysSet.size
    },
    hourly: timeline, // for backward compatibility if hourly is read
    maxHourlyTokens: maxTimelineTokens,
    timeline,
    timelineType: scope === 'today' ? 'hourly' : 'daily',
    maxTimelineTokens,
    models,
    projects,
    tools,
    content
  };
}

function getAllAnalytics() {
  const now = Date.now();
  if (cachedAnalyticsBundle && (now - lastBundleTime) < BUNDLE_CACHE_TTL_MS) {
    return cachedAnalyticsBundle;
  }

  const thirtyDaysStartMs = getStartOfDay(29);
  const rawTurns = collectRawTurns(thirtyDaysStartMs);

  const bundle = {
    all: {
      today: aggregateScope(rawTurns, 'today', 'all'),
      '7d': aggregateScope(rawTurns, '7d', 'all'),
      '30d': aggregateScope(rawTurns, '30d', 'all')
    },
    claude: {
      today: aggregateScope(rawTurns, 'today', 'claude'),
      '7d': aggregateScope(rawTurns, '7d', 'claude'),
      '30d': aggregateScope(rawTurns, '30d', 'claude')
    },
    antigravity: {
      today: aggregateScope(rawTurns, 'today', 'antigravity'),
      '7d': aggregateScope(rawTurns, '7d', 'antigravity'),
      '30d': aggregateScope(rawTurns, '30d', 'antigravity')
    }
  };

  cachedAnalyticsBundle = bundle;
  lastBundleTime = now;
  return bundle;
}

function getTodayMetrics(filterProvider = 'all') {
  const bundle = getAllAnalytics();
  return (bundle[filterProvider] && bundle[filterProvider].today) || bundle.all.today;
}

function getScopeMetrics(scope = 'today', filterProvider = 'all') {
  const bundle = getAllAnalytics();
  const prov = bundle[filterProvider] || bundle.all;
  return prov[scope] || prov.today;
}

module.exports = {
  getAllAnalytics,
  getScopeMetrics,
  getTodayMetrics,
  calculateTurnCost,
  TOOL_CATEGORIES,
  categorizeTool
};
