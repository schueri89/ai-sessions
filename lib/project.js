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

let projectCache = { key: '', list: [], time: 0 };
const SCAN_INTERVAL_MS = 60000;

function getWorkspaceFolderPaths() {
  if (!vscode || !vscode.workspace || !Array.isArray(vscode.workspace.workspaceFolders)) return [];
  return vscode.workspace.workspaceFolders
    .filter((f) => f.uri && f.uri.fsPath)
    .map((f) => path.normalize(f.uri.fsPath));
}

function getConfiguredRoot() {
  if (!vscode || !vscode.workspace) return '';
  const custom = vscode.workspace.getConfiguration('sessionDashboard').get('rootDirectory');
  if (custom && typeof custom === 'string' && custom.trim() && fs.existsSync(custom.trim())) {
    return path.normalize(custom.trim());
  }
  return '';
}

function getDefaultRoot() {
  return getConfiguredRoot() || getWorkspaceFolderPaths()[0] || '';
}

function scanSubfolders(root) {
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !IGNORED_FOLDERS.has(e.name.toLowerCase()))
    .map((e) => ({ name: e.name, dir: path.join(root, e.name) }));
}

// Root (explicit or configured) or single workspace folder: its subfolders; multi-root: the workspace folders themselves.
// Sorted by path length desc so nested projects win in matchProjectInText().
function getKnownProjects(rootDir) {
  let root = rootDir || getConfiguredRoot();
  const folders = root ? [] : getWorkspaceFolderPaths();
  const multiRoot = folders.length > 1;
  if (!multiRoot && !root) root = folders[0] || '';
  const key = multiRoot ? 'ws:' + folders.join('|') : 'root:' + root;

  const now = Date.now();
  if (projectCache.key === key && (now - projectCache.time) < SCAN_INTERVAL_MS) {
    return projectCache.list;
  }
  const list = multiRoot
    ? folders.map((dir) => ({ name: path.basename(dir), dir }))
    : scanSubfolders(root);
  for (const p of list) p.match = p.dir.replace(/\\/g, '/').toLowerCase();
  list.sort((a, b) => b.match.length - a.match.length);

  projectCache = { key, list, time: now };
  return list;
}

function getKnownSubfolders(rootDir) {
  return getKnownProjects(rootDir).map((p) => p.name);
}

// Finds the project whose directory occurs in the text (plain paths, JSON-escaped paths or file URIs).
function matchProjectInText(str) {
  if (!str) return null;
  const hay = String(str).replace(/\\+/g, '/').replace(/%3a/gi, ':').toLowerCase();
  for (const p of getKnownProjects()) {
    let i = hay.indexOf(p.match);
    while (i !== -1) {
      const next = hay.charAt(i + p.match.length);
      if (!next || !/[a-z0-9_.-]/.test(next)) return p.name;
      i = hay.indexOf(p.match, i + 1);
    }
  }
  return null;
}

const UNASSIGNED_PROJECT = 'Nicht zugewiesen';

function resolveProject({ cwd = '', workspaces = [], title = '', lastPrompt = '', rawLines = [], hintProject = '', detectionMode = 'auto' } = {}) {
  if (detectionMode === 'manual') {
    return UNASSIGNED_PROJECT;
  }

  const subfolders = getKnownSubfolders();
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
    for (const l of rawLines) {
      const p = matchProjectInText(l);
      if (p === '.agents') foundAgents = true;
      else if (p) return p;
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
  getKnownProjects,
  getKnownSubfolders,
  matchProjectInText,
  resolveProject,
  UNASSIGNED_PROJECT
};
