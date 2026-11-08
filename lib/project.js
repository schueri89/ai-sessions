'use strict';

const fs = require('fs');
const path = require('path');
let vscode;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}

const IGNORED_FOLDERS = new Set([
  'web-inf',
  'meta-inf',
  'node_modules',
  '.git',
  '.vscode',
  'logs',
  'data',
  'backups',
  'neuer ordner',
  'scratchpad',
  'dist',
  'build'
]);

let cachedSubfolders = null;
let lastScanTime = 0;
const SCAN_INTERVAL_MS = 60000;

function getDefaultRoot() {
  if (vscode && vscode.workspace) {
    try {
      const custom = vscode.workspace.getConfiguration('sessionDashboard').get('rootDirectory');
      if (custom && typeof custom === 'string' && custom.trim() && fs.existsSync(custom.trim())) {
        return path.normalize(custom.trim());
      }
      const folders = vscode.workspace.workspaceFolders;
      if (Array.isArray(folders) && folders.length > 0) {
        for (const f of folders) {
          if (f.uri && f.uri.fsPath) {
            const wsPath = path.normalize(f.uri.fsPath);
            if (fs.existsSync(path.join(wsPath, '.agents'))) {
              return wsPath;
            }
            const parentDir = path.dirname(wsPath);
            if (fs.existsSync(path.join(parentDir, '.agents'))) {
              return parentDir;
            }
            if (fs.existsSync(wsPath)) {
              return wsPath;
            }
          }
        }
      }
    } catch {}
  }

  const cwd = process.cwd();
  const parentCwd = path.dirname(cwd);
  if (fs.existsSync(path.join(parentCwd, '.agents'))) {
    return path.normalize(parentCwd);
  }
  if (fs.existsSync(path.join(cwd, '.agents'))) {
    return path.normalize(cwd);
  }
  return path.normalize(cwd);
}

function getKnownSubfolders(rootDir) {
  const now = Date.now();
  if (cachedSubfolders && (now - lastScanTime) < SCAN_INTERVAL_MS) {
    return cachedSubfolders;
  }
  const root = rootDir || getDefaultRoot();
  const list = [];
  try {
    if (fs.existsSync(root)) {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && !IGNORED_FOLDERS.has(e.name.toLowerCase())) {
          list.push(e.name);
        }
      }
    }
  } catch {}
  if (!list.includes('.agents')) list.push('.agents');

  cachedSubfolders = list;
  lastScanTime = now;
  return list;
}

const UNASSIGNED_PROJECT = 'Nicht zugewiesen';

function resolveProject({ cwd = '', workspaces = [], title = '', lastPrompt = '', rawLines = [], hintProject = '', detectionMode = 'auto' } = {}, rootDir) {
  if (detectionMode === 'manual') {
    return UNASSIGNED_PROJECT;
  }

  const root = rootDir || getDefaultRoot();
  const subfolders = getKnownSubfolders(root);
  const entries = subfolders.map((f) => [f.toLowerCase(), f]).sort((a, b) => b[0].length - a[0].length);

  if (hintProject) {
    const lowerHint = hintProject.toLowerCase();
    for (const [lower, orig] of entries) {
      if (lower === lowerHint) return orig;
    }
  }

  // 1. Direct match on cwd (prioritize specific project folders over .agents)
  if (cwd) {
    const norm = cwd.replace(/\\/g, '/');
    for (const [lower, orig] of entries) {
      if (orig === '.agents') continue;
      if (norm.toLowerCase().includes('/' + lower + '/') || norm.toLowerCase().endsWith('/' + lower)) {
        return orig;
      }
    }
    if (norm.toLowerCase().includes('/.agents/') || norm.toLowerCase().endsWith('/.agents')) {
      return '.agents';
    }
  }

  // 2. Direct match on Antigravity workspaces
  if (Array.isArray(workspaces)) {
    for (const w of workspaces) {
      const dec = decodeURIComponent(w).replace(/\\/g, '/');
      for (const [lower, orig] of entries) {
        if (orig === '.agents') continue;
        if (dec.toLowerCase().includes('/' + lower + '/') || dec.toLowerCase().endsWith('/' + lower)) {
          return orig;
        }
      }
      if (dec.toLowerCase().includes('/.agents/') || dec.toLowerCase().endsWith('/.agents')) {
        return '.agents';
      }
    }
  }

  // 3. Match from file paths in rawLines / tool inputs
  let foundAgents = false;
  if (Array.isArray(rawLines)) {
    const rootName = path.basename(root);
    const rootRegex = new RegExp('[\\\\\\/]' + rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\\\\\/]([a-zA-Z0-9_\\-\\.]+)', 'i');
    for (const l of rawLines) {
      if (!l) continue;
      const m = l.match(rootRegex);
      if (m) {
        const sub = m[1].toLowerCase();
        for (const [lower, orig] of entries) {
          if (lower === sub) {
            if (orig !== '.agents') return orig;
            foundAgents = true;
          }
        }
      }
    }
  }
  if (foundAgents) return '.agents';

  // 4. Match from title and prompt (word boundary match) - ONLY in 'auto' mode
  if (detectionMode === 'auto') {
    const text = (title + ' ' + lastPrompt).toLowerCase();
    for (const [lower, orig] of entries) {
      if (orig === '.agents') continue;
      const re = new RegExp('(?:^|[^a-z0-9_-])' + lower.replace(/[-_.]/g, '[-_.]') + '(?:[^a-z0-9_-]|$)', 'i');
      if (re.test(text)) {
        return orig;
      }
    }
    return 'ROOT';
  }

  // In 'exact' mode: if no exact path or tool file matched, do not guess text and do not default to ROOT
  return UNASSIGNED_PROJECT;
}

module.exports = {
  getDefaultRoot,
  getKnownSubfolders,
  resolveProject,
  UNASSIGNED_PROJECT
};
