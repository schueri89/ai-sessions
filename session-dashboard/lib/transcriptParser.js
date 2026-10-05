'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { calculateTurnCost } = require('./analytics');
const { workspaceStorageDir } = require('./providers/copilot');

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function antigravityDir() {
  return process.env.ANTIGRAVITY_CONFIG_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
}

function findClaudeTranscript(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const root = path.join(claudeDir(), 'projects');
  if (!fs.existsSync(root)) return null;
  try {
    const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of dirs) {
      const file = path.join(root, d.name, `${sessionId}.jsonl`);
      if (fs.existsSync(file)) return file;
    }
  } catch {}
  return null;
}

function findAntigravityTranscript(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const base = path.join(antigravityDir(), 'brain', sessionId, '.system_generated', 'logs');
  const full = path.join(base, 'transcript_full.jsonl');
  if (fs.existsSync(full)) return full;
  const standard = path.join(base, 'transcript.jsonl');
  if (fs.existsSync(standard)) return standard;
  return null;
}

function findCopilotTranscript(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const wsDir = workspaceStorageDir();
  if (!fs.existsSync(wsDir)) return null;
  try {
    const hashes = fs.readdirSync(wsDir);
    for (const h of hashes) {
      const file = path.join(wsDir, h, 'chatSessions', `${sessionId}.jsonl`);
      if (fs.existsSync(file)) return file;
    }
  } catch {}
  return null;
}

function findTranscriptFile(sessionId, provider) {
  if (sessionId && typeof sessionId === 'object') {
    provider = sessionId.provider || provider;
    sessionId = sessionId.sessionId;
  }
  if (!sessionId || typeof sessionId !== 'string') return null;
  if (provider === 'copilot') {
    const copilot = findCopilotTranscript(sessionId);
    if (copilot) return { file: copilot, provider: 'copilot' };
    const claude = findClaudeTranscript(sessionId);
    if (claude) return { file: claude, provider: 'claude' };
    const agy = findAntigravityTranscript(sessionId);
    if (agy) return { file: agy, provider: 'antigravity' };
  } else if (provider === 'antigravity') {
    const agy = findAntigravityTranscript(sessionId);
    if (agy) return { file: agy, provider: 'antigravity' };
    const claude = findClaudeTranscript(sessionId);
    if (claude) return { file: claude, provider: 'claude' };
    const copilot = findCopilotTranscript(sessionId);
    if (copilot) return { file: copilot, provider: 'copilot' };
  } else {
    const claude = findClaudeTranscript(sessionId);
    if (claude) return { file: claude, provider: 'claude' };
    const agy = findAntigravityTranscript(sessionId);
    if (agy) return { file: agy, provider: 'antigravity' };
    const copilot = findCopilotTranscript(sessionId);
    if (copilot) return { file: copilot, provider: 'copilot' };
  }
  return null;
}

function parseClaudeTranscript(filePath, sessionId) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);

  let title = '';
  let project = '';
  let model = 'Claude 3.7 Sonnet';
  let startedAt = 0;
  let lastActivity = 0;
  const activeMinutesSet = new Set();

  const turns = [];
  let currentTurn = null;

  for (const line of lines) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }

    const ts = rec.timestamp ? Date.parse(rec.timestamp) : 0;
    if (ts > 0) {
      if (!startedAt) startedAt = ts;
      lastActivity = ts;
      activeMinutesSet.add(Math.floor(ts / 60000));
    }

    if (!project) {
      const m = line.match(/[\\\/]webapps[\\\/]ROOT[\\\/]([a-zA-Z0-9_\-\.]+)/i);
      if (m && !['WEB-INF', 'META-INF', 'lucee.code-workspace'].includes(m[1])) {
        project = m[1];
      }
    }

    if (rec.type === 'custom-title' && rec.customTitle) title = rec.customTitle;
    else if (rec.type === 'ai-title' && rec.aiTitle && !title) title = rec.aiTitle;
    else if (rec.type === 'agent-name' && rec.agentName && !title) title = rec.agentName;

    if (rec.type === 'user') {
      let promptText = '';
      if (typeof rec.message?.content === 'string') {
        promptText = rec.message.content;
      } else if (Array.isArray(rec.message?.content)) {
        const textParts = rec.message.content
          .filter((c) => c.type === 'text' && !c.text.startsWith('<ide_'))
          .map((c) => c.text);
        promptText = textParts.join('\n');
      }

      if (promptText.trim()) {
        if (currentTurn) {
          if (currentTurn.endTimestamp >= currentTurn.startTimestamp) {
            currentTurn.durationMs = currentTurn.endTimestamp - currentTurn.startTimestamp;
          }
          turns.push(currentTurn);
        }
        currentTurn = {
          index: turns.length + 1,
          timestamp: ts || Date.now(),
          startTimestamp: ts || Date.now(),
          endTimestamp: ts || Date.now(),
          durationMs: 0,
          userPrompt: promptText.trim(),
          thinking: [],
          tools: [],
          response: '',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0
        };
      }
    } else if (rec.type === 'assistant') {
      if (!currentTurn) {
        currentTurn = {
          index: turns.length + 1,
          timestamp: ts || Date.now(),
          startTimestamp: ts || Date.now(),
          endTimestamp: ts || Date.now(),
          durationMs: 0,
          userPrompt: '',
          thinking: [],
          tools: [],
          response: '',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0
        };
      }

      if (ts > 0) {
        currentTurn.endTimestamp = ts;
      }

      if (rec.message && Array.isArray(rec.message.content)) {
        for (const c of rec.message.content) {
          if (c.type === 'thinking' && c.thinking) {
            currentTurn.thinking.push(c.thinking);
          } else if (c.type === 'tool_use') {
            currentTurn.tools.push({
              name: c.name || 'tool',
              id: c.id,
              input: c.input || {}
            });
          } else if (c.type === 'text' && c.text) {
            currentTurn.response += (currentTurn.response ? '\n\n' : '') + c.text;
          }
        }
      }

      if (rec.message?.model && typeof rec.message.model === 'string') {
        model = rec.message.model;
      }

      if (rec.message?.usage) {
        const u = rec.message.usage;
        const inTok = Number(u.input_tokens) || 0;
        const outTok = Number(u.output_tokens) || 0;
        const cRead = Number(u.cache_read_input_tokens) || 0;
        const cWrite = Number(u.cache_creation_input_tokens) || 0;

        currentTurn.inputTokens += inTok;
        currentTurn.outputTokens += outTok;
        currentTurn.cacheReadTokens += cRead;
        currentTurn.cacheWriteTokens += cWrite;
        currentTurn.cost += calculateTurnCost({ input: inTok, output: outTok, cacheRead: cRead, cacheWrite: cWrite }, model, 'claude');
      }
    }
  }

  if (currentTurn) {
    if (currentTurn.endTimestamp >= currentTurn.startTimestamp) {
      currentTurn.durationMs = currentTurn.endTimestamp - currentTurn.startTimestamp;
    }
    turns.push(currentTurn);
  }

  let totalTokens = 0;
  let totalCost = 0;
  let toolsCount = 0;

  for (const t of turns) {
    totalTokens += (t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens);
    totalCost += t.cost;
    toolsCount += t.tools.length;
  }

  return {
    sessionId,
    provider: 'claude',
    title: title || 'Claude Session',
    project: project || 'tools',
    model,
    filePath,
    startedAt,
    lastActivity,
    activeMinutes: activeMinutesSet.size,
    spanMs: (lastActivity && startedAt && lastActivity >= startedAt) ? (lastActivity - startedAt) : 0,
    turnsCount: turns.length,
    toolsCount,
    totalTokens,
    cost: totalCost,
    turns
  };
}

function parseAntigravityTranscript(filePath, sessionId) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);

  let title = '';
  let project = '';
  let model = 'Gemini 2.5 Flash';
  let startedAt = 0;
  let lastActivity = 0;
  const activeMinutesSet = new Set();

  const turns = [];
  let currentTurn = null;

  for (const line of lines) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }

    const ts = rec.created_at ? Date.parse(rec.created_at) : 0;
    if (ts > 0) {
      if (!startedAt) startedAt = ts;
      lastActivity = ts;
      activeMinutesSet.add(Math.floor(ts / 60000));
    }

    if (rec.type === 'USER_INPUT') {
      let rawText = rec.content || '';
      let text = rawText
        .replace(/^<USER_REQUEST>[\r\n]*/, '')
        .replace(/[\r\n]*<\/USER_REQUEST>$/, '')
        .trim();

      if (!title && text) {
        title = text.length > 60 ? text.slice(0, 58) + '…' : text;
      }

      if (!project && text) {
        const m = text.match(/[\\\/]webapps[\\\/]ROOT[\\\/]([a-zA-Z0-9_\-\.]+)/i);
        if (m && !['WEB-INF', 'META-INF', 'lucee.code-workspace'].includes(m[1])) {
          project = m[1];
        }
      }

      if (text) {
        if (currentTurn) {
          if (currentTurn.endTimestamp >= currentTurn.startTimestamp) {
            currentTurn.durationMs = currentTurn.endTimestamp - currentTurn.startTimestamp;
          }
          turns.push(currentTurn);
        }
        currentTurn = {
          index: turns.length + 1,
          timestamp: ts || Date.now(),
          startTimestamp: ts || Date.now(),
          endTimestamp: ts || Date.now(),
          durationMs: 0,
          userPrompt: text,
          thinking: [],
          tools: [],
          response: '',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0
        };
      }
    } else if (rec.type === 'PLANNER_RESPONSE') {
      if (!currentTurn) {
        currentTurn = {
          index: turns.length + 1,
          timestamp: ts || Date.now(),
          startTimestamp: ts || Date.now(),
          endTimestamp: ts || Date.now(),
          durationMs: 0,
          userPrompt: '',
          thinking: [],
          tools: [],
          response: '',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0
        };
      }

      if (ts > 0) {
        currentTurn.endTimestamp = ts;
      }

      if (rec.thinking) {
        currentTurn.thinking.push(rec.thinking);
      }
      if (rec.content) {
        currentTurn.response += (currentTurn.response ? '\n\n' : '') + rec.content;
      }
      if (Array.isArray(rec.tool_calls)) {
        for (const tc of rec.tool_calls) {
          currentTurn.tools.push({
            name: tc.name || tc.function?.name || 'tool',
            action: tc.toolAction,
            summary: tc.toolSummary,
            input: tc.parameters || {}
          });
        }
      }

      if (rec.model) {
        model = rec.model;
      }

      const inTok = Number(rec.input_tokens) || 0;
      const outTok = Number(rec.output_tokens) || 0;
      const cRead = Number(rec.cache_read_tokens) || 0;

      currentTurn.inputTokens += inTok;
      currentTurn.outputTokens += outTok;
      currentTurn.cacheReadTokens += cRead;
      currentTurn.cost += calculateTurnCost({ input: inTok, output: outTok, cacheRead: cRead, cacheWrite: 0 }, model, 'antigravity');
    }
  }

  if (currentTurn) {
    if (currentTurn.endTimestamp >= currentTurn.startTimestamp) {
      currentTurn.durationMs = currentTurn.endTimestamp - currentTurn.startTimestamp;
    }
    turns.push(currentTurn);
  }

  let totalTokens = 0;
  let totalCost = 0;
  let toolsCount = 0;

  for (const t of turns) {
    totalTokens += (t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens);
    totalCost += t.cost;
    toolsCount += t.tools.length;
  }

  return {
    sessionId,
    provider: 'antigravity',
    title: title || 'Antigravity Session',
    project: project || 'tools',
    model,
    filePath,
    startedAt,
    lastActivity,
    activeMinutes: activeMinutesSet.size,
    spanMs: (lastActivity && startedAt && lastActivity >= startedAt) ? (lastActivity - startedAt) : 0,
    turnsCount: turns.length,
    toolsCount,
    totalTokens,
    cost: totalCost,
    turns
  };
}

function parseCopilotTranscript(filePath, sessionId) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);

  let sessionObj = null;
  let customTitle = '';

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.kind === 0 && parsed.v) {
        sessionObj = parsed.v;
      } else if (parsed.kind === 1 && parsed.k && parsed.k[0] === 'customTitle') {
        customTitle = parsed.v;
      } else if (parsed.kind === 2 && parsed.k && parsed.k[0] === 'requests' && sessionObj) {
        if (!sessionObj.requests) sessionObj.requests = [];
        sessionObj.requests = sessionObj.requests.concat(parsed.v);
      }
    } catch {}
  }

  if (!sessionObj) return null;

  let title = customTitle || sessionObj.customTitle || '';
  let project = '';
  let model = 'Copilot';
  let startedAt = sessionObj.creationDate || 0;
  let lastActivity = startedAt;
  const activeMinutesSet = new Set();

  const requests = sessionObj.requests || [];
  const turns = [];

  for (let idx = 0; idx < requests.length; idx++) {
    const req = requests[idx];
    const ts = Number(req.timestamp) || sessionObj.creationDate || 0;
    if (ts > 0) {
      if (!startedAt) startedAt = ts;
      lastActivity = Math.max(lastActivity, ts);
      activeMinutesSet.add(Math.floor(ts / 60000));
    }

    const meta = req.result?.metadata;
    const resolved = meta?.resolvedModel || req.modelId;
    if (resolved) model = resolved;

    const userPrompt = req.message?.text || '';
    if (!title && userPrompt) {
      title = userPrompt.slice(0, 60);
    }

    let assistantResponse = '';
    const tools = [];
    let thinking = '';

    if (Array.isArray(req.response)) {
      for (const p of req.response) {
        if (typeof p.value === 'string') {
          assistantResponse += p.value + '\n\n';
        } else if (p.content?.value) {
          assistantResponse += p.content.value + '\n\n';
        } else if (p.kind === 'toolInvocationSerialized') {
          const tName = p.toolId || p.name || 'tool';
          const tSummary = p.toolInvocationMessage?.value || p.pastTenseMessage?.value || p.toolId || 'Tool ausgeführt';
          tools.push({
            name: tName,
            summary: tSummary,
            input: p.parameters || {}
          });
        } else if (p.kind === 'progressTaskSerialized' || p.kind === 'thinking') {
          const txt = p.content?.value || p.message || '';
          if (txt) thinking += (thinking ? '\n' : '') + txt;
        }
      }
    }

    if (meta?.toolCallResults) {
      for (const [callId, callData] of Object.entries(meta.toolCallResults)) {
        if (!tools.some((t) => t.name === callId)) {
          tools.push({
            name: callData?.name || callId,
            summary: callData?.summary || 'Tool Call',
            input: callData?.args || {}
          });
        }
      }
    }

    const inputTokens = Number(meta?.promptTokens) || 0;
    const outputTokens = Number(meta?.outputTokens) || 0;
    const elapsedMs = req.elapsedMs || (req.modelState?.completedAt && ts ? (req.modelState.completedAt - ts) : 0);
    const endTs = req.modelState?.completedAt || (ts + elapsedMs);

    const turnCost = calculateTurnCost(
      { input: inputTokens, output: outputTokens, cacheRead: 0, cacheWrite: 0 },
      model,
      'copilot'
    );

    turns.push({
      index: idx + 1,
      turnIndex: idx + 1,
      timestamp: ts,
      startTimestamp: ts,
      endTimestamp: endTs,
      durationMs: elapsedMs,
      userPrompt,
      thinking: thinking ? [thinking.trim()] : [],
      response: assistantResponse.trim(),
      assistantResponse: assistantResponse.trim(),
      tools,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: turnCost,
      model
    });
  }

  let totalTokens = 0;
  let totalCost = 0;
  let toolsCount = 0;

  for (const t of turns) {
    totalTokens += (t.inputTokens + t.outputTokens);
    totalCost += t.cost;
    toolsCount += t.tools.length;
  }

  // Detect project from filePath or workspace
  const m = filePath.match(/[\\\/]workspaceStorage[\\\/]([a-zA-Z0-9_\-]+)/);
  if (m) {
    try {
      const wsFile = path.join(filePath.split('chatSessions')[0], 'workspace.json');
      if (fs.existsSync(wsFile)) {
        const j = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
        const pStr = j.folder || j.workspace || '';
        const pm = pStr.match(/ROOT[\\\/]([a-zA-Z0-9_\-\.]+)/i);
        if (pm && !['WEB-INF', 'META-INF', 'lucee.code-workspace'].includes(pm[1])) {
          project = pm[1];
        }
      }
    } catch {}
  }

  return {
    sessionId,
    provider: 'copilot',
    title: title || 'Copilot Session',
    project: project || 'ROOT',
    model,
    filePath,
    startedAt,
    lastActivity,
    activeMinutes: activeMinutesSet.size,
    spanMs: (lastActivity && startedAt && lastActivity >= startedAt) ? (lastActivity - startedAt) : 0,
    turnsCount: turns.length,
    toolsCount,
    totalTokens,
    cost: totalCost,
    turns
  };
}

function getSessionTranscript(sessionId, provider) {
  let sid = sessionId;
  let prov = provider;
  if (sessionId && typeof sessionId === 'object') {
    prov = sessionId.provider || provider;
    sid = sessionId.sessionId;
  }
  const found = findTranscriptFile(sid, prov);
  if (!found) return null;
  if (found.provider === 'claude') {
    return parseClaudeTranscript(found.file, sid);
  }
  if (found.provider === 'copilot') {
    return parseCopilotTranscript(found.file, sid);
  }
  return parseAntigravityTranscript(found.file, sid);
}

module.exports = {
  findTranscriptFile,
  findCopilotTranscript,
  parseClaudeTranscript,
  parseAntigravityTranscript,
  parseCopilotTranscript,
  getSessionTranscript
};
