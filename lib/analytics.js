'use strict';

// Aggregation and metrics for token usage, costs, timelines (today, 7d, 30d)
// and Tool & Content Breakdown for Claude Code and Google Antigravity.

const fs = require('fs');
const path = require('path');
const os = require('os');
let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}
const { resolveProject } = require('./project');
const { workspaceStorageDir, parseJsonlChatSession } = require('./providers/copilot');
const { codexDir, sessionsDir: codexSessionsDir, dbPath: codexDbPath } = require('./providers/codex');

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

function decodeWorkspaceUri(uri) {
  if (!uri) return '';
  try {
    let p = uri.replace(/^file:\/\/\/?/, '');
    p = decodeURIComponent(p);
    return path.normalize(p);
  } catch {
    return uri;
  }
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
  'gemini-4-argon': { input: 1.25, output: 5.0, cacheRead: 0.3125, cacheWrite: 1.25 },
  'gemini-ultra': { input: 5.0, output: 20.0, cacheRead: 1.25, cacheWrite: 5.0 },
  'gpt-4o': { input: 2.50, output: 10.0, cacheRead: 1.25, cacheWrite: 2.50 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, cacheRead: 0.075, cacheWrite: 0.15 },
  'o1': { input: 15.0, output: 60.0, cacheRead: 7.50, cacheWrite: 15.0 },
  'o3-mini': { input: 1.10, output: 4.40, cacheRead: 0.55, cacheWrite: 1.10 },
  'gpt-6': { input: 2.50, output: 10.0, cacheRead: 1.25, cacheWrite: 2.50 },
  'gpt-5': { input: 2.00, output: 8.0, cacheRead: 1.00, cacheWrite: 2.00 },
  'codex': { input: 2.50, output: 10.0, cacheRead: 1.25, cacheWrite: 2.50 },
  'raptor': { input: 0.15, output: 0.60, cacheRead: 0.075, cacheWrite: 0.15 },
  'copilot': { input: 2.50, output: 10.0, cacheRead: 1.25, cacheWrite: 2.50 }
};

function getModelPricing(modelName, provider = 'claude') {
  if (!modelName) {
    if (provider === 'antigravity') return MODEL_PRICING['gemini-2.5-flash'];
    if (provider === 'copilot') return MODEL_PRICING['gpt-4o'];
    if (provider === 'codex') return MODEL_PRICING['gpt-6'];
    return MODEL_PRICING['claude-3-7-sonnet'];
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
  if (m.includes('argon')) return MODEL_PRICING['gemini-4-argon'];
  if (m.includes('gpt-4o-mini')) return MODEL_PRICING['gpt-4o-mini'];
  if (m.includes('gpt-4o')) return MODEL_PRICING['gpt-4o'];
  if (m.includes('o3-mini')) return MODEL_PRICING['o3-mini'];
  if (m.includes('o1')) return MODEL_PRICING['o1'];
  if (m.includes('raptor')) return MODEL_PRICING['raptor'];
  if (provider === 'copilot') return MODEL_PRICING['gpt-4o'];
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

// VS Code ToolConfirmKind: 0 Denied, 1 ConfirmationNotNeeded, 2 Setting, 3 LmServicePerTool (remembered), 4 UserAction, 5 Skipped
const APPROVAL_MANUAL = 4;
// Bump when the shape of cached Copilot turns changes.
const COPILOT_TURN_CACHE_VERSION = 3;

// Programs whose first non-option argument is a meaningful subcommand (git status, npm install, ...).
const SUBCOMMAND_PROGRAMS = new Set(['git', 'gh', 'npm', 'npx', 'pnpm', 'yarn', 'dotnet', 'docker', 'kubectl', 'az', 'mvn', 'pip', 'cargo', 'go', 'winget', 'choco', 'code']);
// git global options that consume the following token as their value.
const GIT_VALUE_OPTIONS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

// Splits on ; && || and newlines outside of quotes; single pipes stay part of their command.
function splitCommandChain(raw) {
  const parts = [];
  let cur = '';
  let quote = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = '';
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    const two = raw.substr(i, 2);
    if (two === '&&' || two === '||') {
      parts.push(cur);
      cur = '';
      i++;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '\r') {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function subcommandOf(program, rest) {
  if (!SUBCOMMAND_PROGRAMS.has(program)) return '';
  const tokens = rest.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/\)+$/, '');
    if (!t) continue;
    if (program === 'git' && GIT_VALUE_OPTIONS.has(t)) {
      i++;
      continue;
    }
    if (t.startsWith('-')) continue;
    return /^[a-z0-9][\w:.-]*$/i.test(t) ? t.toLowerCase() : '';
  }
  return '';
}

// Every command of a (chained) terminal command line as { cmd, sub }, ignoring cd and leading variable assignments.
function terminalCommands(toolSpecificData) {
  const cl = toolSpecificData && toolSpecificData.kind === 'terminal' ? toolSpecificData.commandLine : null;
  const raw = cl && (cl.userEdited || cl.toolEdited || cl.original);
  if (!raw) return [];
  const result = [];
  for (const seg of splitCommandChain(String(raw))) {
    const s = seg.trim().replace(/^&\s*/, '').replace(/^\$[\w:]+\s*=\s*/, '').replace(/^@?\(+/, '');
    if (!s) continue;
    const m = s.match(/^\[[^\]]+\]::\w+|^"([^"]+)"|^'([^']+)'|^[^\s(]+/);
    let first = m ? (m[1] || m[2] || m[0]) : '';
    // A quoted token is a program only if it looks like a path ("C:\...\git.exe"), otherwise it's a string literal being output.
    if (m && (m[1] || m[2]) && !/[\\/]|\.exe$/i.test(first)) continue;
    first = first.split(/[\\/]/).pop().replace(/\.exe$/i, '');
    if (!first || /^(cd|set-location|sl|push-location|pushd|pop-location|popd|chdir)$/i.test(first)) continue;
    // Shell keywords and variable statements ($i++) are not commands that could be auto-approved.
    if (/^(if|elseif|else|foreach|for|while|do|switch|try|catch|finally|function|return|[{}])$|^\$/i.test(first)) continue;
    first = first.toLowerCase();
    result.push({ cmd: first, sub: subcommandOf(first, s.slice(m[0].length)) });
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadAntigravityWorkspaceMap() {
  const map = new Map();
  if (!DatabaseSync) return map;
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

function loadCodexThreadsMap() {
  const map = new Map();
  if (!DatabaseSync) return map;
  const p = codexDbPath();
  if (!fs.existsSync(p)) return map;
  try {
    const db = new DatabaseSync(p, { open: true, readOnly: true });
    try {
      const rows = db.prepare('SELECT id, rollout_path, cwd, title, model FROM threads').all();
      for (const r of rows) {
        if (r && r.id) {
          let cwd = r.cwd || '';
          if (typeof cwd === 'string') cwd = cwd.replace(/^\\\\\?\\/, '');
          let rollout = r.rollout_path || '';
          if (typeof rollout === 'string') rollout = rollout.replace(/^\\\\\?\\/, '');
          map.set(r.id, {
            cwd: path.normalize(cwd),
            title: r.title || '',
            model: r.model || '',
            rolloutPath: rollout ? path.normalize(rollout) : ''
          });
        }
      }
    } finally {
      try { db.close(); } catch {}
    }
  } catch {}
  return map;
}

function findCodexRolloutFiles() {
  const root = codexSessionsDir();
  if (!fs.existsSync(root)) return [];
  const files = [];
  try {
    const years = fs.readdirSync(root);
    for (const y of years) {
      const yPath = path.join(root, y);
      if (!fs.statSync(yPath).isDirectory()) continue;
      const months = fs.readdirSync(yPath);
      for (const m of months) {
        const mPath = path.join(yPath, m);
        if (!fs.statSync(mPath).isDirectory()) continue;
        const days = fs.readdirSync(mPath);
        for (const d of days) {
          const dPath = path.join(mPath, d);
          if (!fs.statSync(dPath).isDirectory()) continue;
          const entries = fs.readdirSync(dPath);
          for (const f of entries) {
            if (f.endsWith('.jsonl')) {
              files.push(path.join(dPath, f));
            }
          }
        }
      }
    }
  } catch {}
  return files;
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

  // 3. Collect GitHub Copilot turns
  const copilotStorage = workspaceStorageDir();
  if (fs.existsSync(copilotStorage)) {
    let wsFolders = [];
    try {
      wsFolders = fs.readdirSync(copilotStorage, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {}

    for (const d of wsFolders) {
      const wsFolder = path.join(copilotStorage, d.name);
      const csDir = path.join(wsFolder, 'chatSessions');
      if (!fs.existsSync(csDir)) continue;

      let wsPath = '';
      const wsFile = path.join(wsFolder, 'workspace.json');
      if (fs.existsSync(wsFile)) {
        try {
          const json = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
          wsPath = decodeWorkspaceUri(json.folder || json.workspace || '');
        } catch {}
      }

      let files = [];
      try {
        files = fs.readdirSync(csDir).filter((f) => f.endsWith('.jsonl'));
      } catch {}

      for (const f of files) {
        const filePath = path.join(csDir, f);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < thirtyDaysStartMs) continue;

          let cached = fileTurnCache.get(filePath);
          if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size || cached.v !== COPILOT_TURN_CACHE_VERSION) {
            const fileTurns = [];
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            const sessionId = path.basename(f, '.jsonl');

            const { sessionObj, customTitle } = parseJsonlChatSession(lines);
            // The replayed JSONL log can contain the same tool invocation more than once.
            const seenToolCalls = new Set();

            if (sessionObj && Array.isArray(sessionObj.requests)) {
              const project = resolveProject({
                cwd: wsPath,
                title: customTitle || sessionObj.customTitle || ''
              });

              for (const req of sessionObj.requests) {
                const ts = Number(req.timestamp) || sessionObj.creationDate || stat.mtimeMs;
                if (!ts || isNaN(ts)) continue;

                const meta = req.result?.metadata;
                const input = Number(meta?.promptTokens) || 0;
                const output = Number(meta?.outputTokens) || 0;
                const model = meta?.resolvedModel || req.modelId || 'copilot';

                const toolCalls = [];
                const approvals = [];
                let hasThinking = false;
                if (Array.isArray(req.response)) {
                  for (const p of req.response) {
                    if (p.kind === 'toolInvocationSerialized' && (p.toolId || p.name)) {
                      if (p.toolCallId) {
                        if (seenToolCalls.has(p.toolCallId)) continue;
                        seenToolCalls.add(p.toolCallId);
                      }
                      toolCalls.push(p.toolId || p.name);
                      const ic = p.isConfirmed;
                      if (ic && typeof ic === 'object' && typeof ic.type === 'number') {
                        approvals.push({
                          tool: p.toolId || p.name,
                          type: ic.type,
                          scope: ic.scope || '',
                          commands: terminalCommands(p.toolSpecificData)
                        });
                      }
                    }
                    if (p.kind === 'progressTaskSerialized' || p.kind === 'thinking') {
                      hasThinking = true;
                    }
                  }
                }
                if (meta?.toolCallResults) {
                  for (const callId of Object.keys(meta.toolCallResults)) {
                    if (!toolCalls.includes(callId)) toolCalls.push('tool_call');
                  }
                }

                fileTurns.push({
                  provider: 'copilot',
                  timestamp: ts,
                  dateKey: toDateKey(new Date(ts)),
                  hour: new Date(ts).getHours(),
                  sessionId,
                  project,
                  model,
                  input,
                  output,
                  cacheWrite: 0,
                  cacheRead: 0,
                  tools: toolCalls,
                  approvals,
                  thinking: hasThinking,
                  cost: calculateTurnCost({ input, output, cacheRead: 0, cacheWrite: 0 }, model, 'copilot')
                });
              }
            }

            cached = { v: COPILOT_TURN_CACHE_VERSION, mtimeMs: stat.mtimeMs, size: stat.size, turns: fileTurns };
            fileTurnCache.set(filePath, cached);
          }

          for (const t of cached.turns) {
            if (t.timestamp >= thirtyDaysStartMs) turns.push(t);
          }
        } catch {}
      }
    }
  }

  // 4. Collect OpenAI Codex turns
  const codexRollouts = findCodexRolloutFiles();
  const codexThreadsMap = loadCodexThreadsMap();
  const seenRollouts = new Set(codexRollouts);
  for (const meta of codexThreadsMap.values()) {
    if (meta.rolloutPath && fs.existsSync(meta.rolloutPath) && !seenRollouts.has(meta.rolloutPath)) {
      codexRollouts.push(meta.rolloutPath);
      seenRollouts.add(meta.rolloutPath);
    }
  }

  for (const filePath of codexRollouts) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < thirtyDaysStartMs) continue;

      let cached = fileTurnCache.get(filePath);
      if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size || (cached.turns.length > 0 && cached.turns[0].tools === undefined)) {
        const fileTurns = [];
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        let detectedCwd = '';
        let detectedModel = '';
        let detectedProject = '';
        let sessionIdFromMeta = '';

        for (const line of lines) {
          if (!line) continue;
          if (line.includes('"session_meta"')) {
            try {
              const sm = JSON.parse(line);
              if (sm.payload?.cwd) {
                detectedCwd = String(sm.payload.cwd).replace(/^\\\\\?\\/, '');
                const m = detectedCwd.match(/[\\\/]webapps[\\\/]ROOT[\\\/]([a-zA-Z0-9_\-\.]+)/i);
                if (m && !['WEB-INF', 'META-INF', 'lucee.code-workspace'].includes(m[1])) {
                  detectedProject = m[1];
                }
              }
              if (sm.payload?.model_provider) detectedModel = sm.payload.model_provider;
              if (sm.payload?.id) sessionIdFromMeta = sm.payload.id;
            } catch {}
          }
          if (line.includes('"turn_context"') && !detectedModel) {
            try {
              const tc = JSON.parse(line);
              if (tc.payload?.model) detectedModel = tc.payload.model;
            } catch {}
          }
        }

        let pendingTools = [];
        let hasThinking = false;

        for (const line of lines) {
          if (!line) continue;
          if (line.includes('"response_item"')) {
            let item;
            try { item = JSON.parse(line); } catch { continue; }
            const p = item.payload || {};
            if (p.type === 'reasoning') {
              hasThinking = true;
            } else if (p.type === 'custom_tool_call' || p.type === 'function_call') {
              const tName = p.name || p.call?.name;
              if (tName) pendingTools.push(tName);
            }
            continue;
          }

          if (!line.includes('"token_usage_record"')) continue;
          let rec;
          try { rec = JSON.parse(line); } catch { continue; }

          const ts = rec.timestamp ? Date.parse(rec.timestamp) : 0;
          if (isNaN(ts) || ts <= 0) continue;

          const u = rec.payload?.usage;
          if (!u) continue;

          const sessionId = rec.payload?.session_id || rec.payload?.thread_id || sessionIdFromMeta || path.basename(filePath, '.jsonl').replace(/^rollout-[\d-T]+-/, '');
          const threadMeta = codexThreadsMap.get(sessionId) || {};

          const cachedInput = Number(u.cached_input_tokens) || 0;
          const input = Math.max(0, (Number(u.input_tokens) || 0) - cachedInput);
          const output = Number(u.output_tokens) || 0;
          const cacheRead = cachedInput;
          const cacheWrite = 0;
          const model = threadMeta.model || detectedModel || 'gpt-6.1-sol';

          const cwd = threadMeta.cwd || detectedCwd || '';
          const project = resolveProject({
            cwd,
            title: threadMeta.title || '',
            hintProject: detectedProject
          });

          fileTurns.push({
            provider: 'codex',
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
            tools: [...pendingTools],
            thinking: hasThinking || ((Number(u.reasoning_output_tokens) || 0) > 0),
            cost: calculateTurnCost({ input, output, cacheRead, cacheWrite }, model, 'codex')
          });

          pendingTools = [];
          hasThinking = false;
        }

        cached = { mtimeMs: stat.mtimeMs, size: stat.size, turns: fileTurns };
        fileTurnCache.set(filePath, cached);
      }

      for (const t of cached.turns) {
        if (t.timestamp >= thirtyDaysStartMs) turns.push(t);
      }
    } catch {}
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
  let copilotCost = 0;
  let codexCost = 0;
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
    else if (t.provider === 'antigravity') antigravityCost += t.cost;
    else if (t.provider === 'copilot') copilotCost += t.cost;
    else if (t.provider === 'codex') codexCost += t.cost;
    uniqueSessions.add(t.sessionId);
    if (t.timestamp) activeMinutesSet.add(Math.floor(t.timestamp / 60000));
    if (t.dateKey) activeDaysSet.add(t.dateKey);
  }

  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const totalInputBase = inputTokens + cacheReadTokens + cacheWriteTokens;
  const cacheHitRate = totalInputBase > 0 ? (cacheReadTokens / totalInputBase) * 100 : 0;

  const countManualApprovals = (t) => (t.approvals ? t.approvals.filter((a) => a.type === APPROVAL_MANUAL).length : 0);

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
      cost: 0,
      manualApprovals: 0
    }));

    for (const t of filtered) {
      const h = t.hour >= 0 && t.hour < 24 ? t.hour : 0;
      timeline[h].inputTokens += t.input + t.cacheWrite;
      timeline[h].outputTokens += t.output;
      timeline[h].cacheTokens += t.cacheRead;
      timeline[h].totalTokens += (t.input + t.output + t.cacheRead + t.cacheWrite);
      timeline[h].turns += 1;
      timeline[h].cost += t.cost;
      timeline[h].manualApprovals += countManualApprovals(t);
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
        cost: 0,
        manualApprovals: 0
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
        slot.manualApprovals += countManualApprovals(t);
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
        lastActive: 0,
        manualApprovals: 0
      });
    }
    const item = projectMap.get(p);
    item.tokens += (t.input + t.output + t.cacheRead + t.cacheWrite);
    item.cost += t.cost;
    item.turns += 1;
    item.sessions.add(t.sessionId);
    item.manualApprovals += countManualApprovals(t);
    if (t.timestamp > item.lastActive) item.lastActive = t.timestamp;
  }
  const projects = Array.from(projectMap.values())
    .map((p) => ({
      name: p.name,
      tokens: p.tokens,
      cost: p.cost,
      turns: p.turns,
      sessionsCount: p.sessions.size,
      lastActive: p.lastActive,
      manualApprovals: p.manualApprovals
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

  // 6. Tool approvals (GitHub Copilot only)
  const approvals = {
    total: 0,
    manual: 0,
    remembered: 0,
    rememberedSession: 0,
    rememberedWorkspace: 0,
    rememberedProfile: 0,
    setting: 0,
    notNeeded: 0,
    denied: 0,
    skipped: 0
  };
  const manualToolMap = new Map();
  const manualCommandMap = new Map();
  for (const t of filtered) {
    for (const a of (t.approvals || [])) {
      approvals.total++;
      if (a.type === APPROVAL_MANUAL) {
        approvals.manual++;
        manualToolMap.set(a.tool, (manualToolMap.get(a.tool) || 0) + 1);
        // A program counts once per approval, but each distinct subcommand of the chain counts separately.
        const seenCmds = new Set();
        const seenSubs = new Set();
        for (const c of (a.commands || [])) {
          let entry = manualCommandMap.get(c.cmd);
          if (!entry) {
            entry = { count: 0, subs: new Map() };
            manualCommandMap.set(c.cmd, entry);
          }
          if (!seenCmds.has(c.cmd)) {
            seenCmds.add(c.cmd);
            entry.count++;
          }
          const subKey = c.cmd + '\0' + c.sub;
          if (c.sub && !seenSubs.has(subKey)) {
            seenSubs.add(subKey);
            entry.subs.set(c.sub, (entry.subs.get(c.sub) || 0) + 1);
          }
        }
      } else if (a.type === 3) {
        approvals.remembered++;
        if (a.scope === 'session') approvals.rememberedSession++;
        else if (a.scope === 'workspace') approvals.rememberedWorkspace++;
        else approvals.rememberedProfile++;
      } else if (a.type === 2) {
        approvals.setting++;
      } else if (a.type === 1) {
        approvals.notNeeded++;
      } else if (a.type === 0) {
        approvals.denied++;
      } else if (a.type === 5) {
        approvals.skipped++;
      }
    }
  }
  approvals.needed = approvals.total - approvals.notNeeded;
  approvals.manualPercent = approvals.needed > 0 ? Math.round((approvals.manual / approvals.needed) * 100) : 0;
  const toTop = (map) => Array.from(map.entries())
    .map(([name, count]) => ({ name, count, percent: approvals.manual > 0 ? Math.round((count / approvals.manual) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  approvals.topTools = toTop(manualToolMap);
  const allCommands = Array.from(manualCommandMap.entries())
    .map(([name, e]) => ({
      name,
      count: e.count,
      percent: approvals.manual > 0 ? Math.round((e.count / approvals.manual) * 100) : 0,
      re: escapeRegex(name),
      hasSubcommands: SUBCOMMAND_PROGRAMS.has(name),
      subs: Array.from(e.subs.entries())
        .map(([sub, count]) => ({ name: sub, count, re: escapeRegex(sub) }))
        .sort((x, y) => y.count - x.count)
    }))
    .sort((x, y) => y.count - x.count);
  // Full list (unsliced) for the admin export; the UI only shows the top 8.
  approvals.allCommands = allCommands;
  approvals.topCommands = allCommands.slice(0, 8);

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
      copilotCost,
      codexCost,
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
    approvals,
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
    },
    copilot: {
      today: aggregateScope(rawTurns, 'today', 'copilot'),
      '7d': aggregateScope(rawTurns, '7d', 'copilot'),
      '30d': aggregateScope(rawTurns, '30d', 'copilot')
    },
    codex: {
      today: aggregateScope(rawTurns, 'today', 'codex'),
      '7d': aggregateScope(rawTurns, '7d', 'codex'),
      '30d': aggregateScope(rawTurns, '30d', 'codex')
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

function getSessionMetricsMap(rawTurns) {
  const map = new Map();
  for (const t of rawTurns) {
    if (!t.sessionId) continue;
    let s = map.get(t.sessionId);
    if (!s) {
      s = {
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        turnsCount: 0,
        thinkingTurns: 0,
        models: new Set(),
        tools: {},
        firstTimestamp: t.timestamp || 0,
        lastTimestamp: t.timestamp || 0
      };
      map.set(t.sessionId, s);
    }
    s.totalCost += t.cost || 0;
    s.inputTokens += t.input || 0;
    s.outputTokens += t.output || 0;
    s.cacheReadTokens += t.cacheRead || 0;
    s.cacheWriteTokens += t.cacheWrite || 0;
    s.totalTokens += (t.input || 0) + (t.output || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0);
    s.turnsCount += 1;
    if (t.thinking) s.thinkingTurns += 1;
    if (t.model) s.models.add(t.model);
    if (t.timestamp && (!s.firstTimestamp || t.timestamp < s.firstTimestamp)) s.firstTimestamp = t.timestamp;
    if (t.timestamp && t.timestamp > s.lastTimestamp) s.lastTimestamp = t.timestamp;
    if (Array.isArray(t.tools)) {
      for (const tool of t.tools) {
        const cat = categorizeTool(tool);
        s.tools[cat] = (s.tools[cat] || 0) + 1;
      }
    }
  }
  return map;
}

function getSessionHistoryList(sessions) {
  const thirtyDaysStartMs = getStartOfDay(29);
  const rawTurns = collectRawTurns(thirtyDaysStartMs);
  const metricsMap = getSessionMetricsMap(rawTurns);

  return (sessions || []).map((s) => {
    const m = metricsMap.get(s.sessionId);
    let primaryModel = '';
    if (m && m.models.size > 0) {
      primaryModel = Array.from(m.models)[0];
    } else if (s.tokens && s.tokens.model) {
      primaryModel = s.tokens.model;
    } else if (s.provider === 'claude') {
      primaryModel = 'claude-3-7-sonnet';
    } else if (s.provider === 'antigravity') {
      primaryModel = 'gemini-2.5-flash';
    } else if (s.provider === 'copilot') {
      primaryModel = 'gpt-4o';
    } else if (s.provider === 'codex') {
      primaryModel = 'gpt-6.1-sol';
    }

    let totalCost = m ? m.totalCost : 0;
    let inputTokens = m ? m.inputTokens : (s.tokens?.inputTokens || 0);
    let outputTokens = m ? m.outputTokens : (s.tokens?.outputTokens || 0);
    let cacheReadTokens = m ? m.cacheReadTokens : (s.tokens?.cacheReadTokens || 0);
    let cacheWriteTokens = m ? m.cacheWriteTokens : (s.tokens?.cacheCreationTokens || 0);
    let totalTokens = m ? m.totalTokens : (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens);

    if (totalCost === 0 && (inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0)) {
      totalCost = calculateTurnCost({
        input: inputTokens,
        output: outputTokens,
        cacheRead: cacheReadTokens,
        cacheWrite: cacheWriteTokens
      }, primaryModel, s.provider);
    }

    const cacheTotal = inputTokens + cacheReadTokens;
    const cacheRatio = cacheTotal > 0 ? Math.round((cacheReadTokens / cacheTotal) * 100) : 0;
    const turnsCount = m ? m.turnsCount : (s.startedAt ? 1 : 0);
    const thinkingTurns = m ? m.thinkingTurns : 0;

    let durationMs = 0;
    if (m && m.lastTimestamp > m.firstTimestamp) {
      durationMs = m.lastTimestamp - m.firstTimestamp;
    } else if (s.startedAt && s.statusUpdatedAt && s.statusUpdatedAt > s.startedAt) {
      durationMs = s.statusUpdatedAt - s.startedAt;
    }

    return {
      sessionId: s.sessionId,
      provider: s.provider || 'claude',
      project: s.project || 'ROOT',
      autoProject: s.autoProject || s.project || 'ROOT',
      isProjectOverridden: Boolean(s.isProjectOverridden),
      title: s.title || s.sessionId.slice(0, 8),
      lastPrompt: s.lastPrompt || '',
      displayState: s.displayState || 'idle',
      isBookmarked: Boolean(s.isBookmarked),
      ticket: s.ticket || null,
      startedAt: s.startedAt || 0,
      statusUpdatedAt: s.statusUpdatedAt || s.startedAt || 0,
      cwd: s.cwd || '',
      activity: s.activity || '',
      primaryModel,
      models: m ? Array.from(m.models) : [primaryModel],
      totalCost,
      totalTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cacheRatio,
      contextPeak: s.tokens?.context || (inputTokens + cacheReadTokens + cacheWriteTokens),
      maxContext: s.tokens?.maxContext || 200000,
      contextPercent: s.tokens?.percent || 0,
      turnsCount,
      thinkingTurns,
      durationMs,
      tools: m ? m.tools : {}
    };
  });
}

module.exports = {
  getAllAnalytics,
  getScopeMetrics,
  getTodayMetrics,
  calculateTurnCost,
  TOOL_CATEGORIES,
  categorizeTool,
  getSessionHistoryList,
  terminalCommands,
  splitCommandChain,
  subcommandOf,
  escapeRegex
};

