'use strict';

const fs = require('fs');
const path = require('path');

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
  return 'c:\\lucee\\tomcat\\webapps\\ROOT';
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

  const subfolders = getKnownSubfolders(rootDir);
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
      if (!l) continue;
      const m = l.match(/[\\\/]webapps[\\\/]ROOT[\\\/]([a-zA-Z0-9_\-\.]+)/i);
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
  getKnownSubfolders,
  resolveProject,
  UNASSIGNED_PROJECT
};
