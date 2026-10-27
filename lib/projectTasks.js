'use strict';

const fs = require('fs');
const path = require('path');
let vscode;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}
const { getKnownSubfolders, getDefaultRoot } = require('./project');

/**
 * Robust JSONC comment stripper.
 * Strips // comments and /* block comments without breaking string literals containing slashes.
 * Also removes trailing commas before } and ].
 */
function stripJsonComments(text) {
  if (typeof text !== 'string') return '';
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n' || ch === '\r') {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      } else if (ch === '\n') {
        out += '\n';
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    out += ch;
  }
  return out.replace(/,(\s*[\]}])/g, '$1');
}

/**
 * Parses a .vscode/tasks.json file and extracts normalized task definitions.
 */
function parseTasksFile(filePath, projectName) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const cleaned = stripJsonComments(raw);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error(`[projectTasks] Failed to parse ${filePath}:`, err.message);
    return [];
  }

  const rawTasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  if (rawTasks.length === 0) return [];

  // Identify subtasks: referenced in dependsOn of any task in the file
  const referencedSubtasks = new Set();
  for (const t of rawTasks) {
    if (Array.isArray(t.dependsOn)) {
      for (const dep of t.dependsOn) {
        if (typeof dep === 'string') {
          referencedSubtasks.add(dep.trim());
        }
      }
    }
  }

  const tasks = [];
  for (const t of rawTasks) {
    if (!t || !t.label) continue;
    const label = String(t.label).trim();
    const isBuild = t.group === 'build' || (t.group && typeof t.group === 'object' && t.group.kind === 'build');
    const isDefault = Boolean(t.group && typeof t.group === 'object' && t.group.isDefault);
    const hasDependsOn = Array.isArray(t.dependsOn) && t.dependsOn.length > 0;
    const isStepPattern = /^\s*APK\s+\d+\/\d+/i.test(label);
    const isReferenced = referencedSubtasks.has(label);

    // isTopLevel: Top-Level workflow tasks (executable by user) vs. internal sub-steps
    const isTopLevel = Boolean(isBuild || isDefault || hasDependsOn || (!isReferenced && !isStepPattern));

    tasks.push({
      id: `${projectName}:${label}`,
      project: projectName,
      projectDir: path.dirname(path.dirname(filePath)),
      label,
      detail: t.detail || '',
      type: t.type || 'shell',
      command: t.command || '',
      args: Array.isArray(t.args) ? t.args : [],
      options: t.options || {},
      group: t.group,
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
      dependsOrder: t.dependsOrder || 'parallel',
      presentation: t.presentation || {},
      isBuild,
      isDefault,
      isTopLevel
    });
  }

  return tasks;
}

/**
 * Scans directories for .vscode/tasks.json
 */
function scanProjectTasks(rootDir, extraProjectDirs = []) {
  const root = rootDir || (typeof getDefaultRoot === 'function' ? getDefaultRoot() : 'c:\\lucee\\tomcat\\webapps\\ROOT');
  const projectDirs = new Map();

  // 1. Projects under rootDir
  try {
    const subfolders = typeof getKnownSubfolders === 'function' ? getKnownSubfolders(root) : [];
    for (const sub of subfolders) {
      projectDirs.set(sub, path.join(root, sub));
    }
  } catch {}

  // 2. Extra project dirs (e.g. from active workspace folders)
  if (Array.isArray(extraProjectDirs)) {
    for (const p of extraProjectDirs) {
      if (p && typeof p === 'string') {
        const name = path.basename(p);
        if (!projectDirs.has(name)) {
          projectDirs.set(name, p);
        }
      }
    }
  }

  const allTasks = [];
  for (const [projectName, pDir] of projectDirs.entries()) {
    const tasksFile = path.join(pDir, '.vscode', 'tasks.json');
    if (fs.existsSync(tasksFile)) {
      const tasks = parseTasksFile(tasksFile, projectName);
      allTasks.push(...tasks);
    }
  }

  // Sort: by project asc, then isTopLevel desc, then isDefault desc, then label asc
  allTasks.sort((a, b) => {
    if (a.project !== b.project) return a.project.localeCompare(b.project);
    if (a.isTopLevel !== b.isTopLevel) return a.isTopLevel ? -1 : 1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return allTasks;
}

class ProjectTasksManager {
  constructor(context) {
    this.context = context;
    this.tasks = [];
    this.taskStates = new Map(); // taskId -> { status: 'idle'|'running'|'success'|'error', lastRun, lastDurationMs, lastExitCode, error }
    this.activeExecutions = new Map(); // execution -> { taskId, startTime }
    this.favoriteTaskIds = new Set();
    this.changeListeners = new Set();
    this.watcher = null;

    // Load persisted state if available
    if (context && context.globalState) {
      const saved = context.globalState.get('sessionDashboard.projectTaskStates', {});
      for (const [id, val] of Object.entries(saved)) {
        this.taskStates.set(id, { ...val, status: val.status === 'running' ? 'idle' : val.status });
      }
      const savedFavs = context.globalState.get('sessionDashboard.favoriteTasks', []);
      if (Array.isArray(savedFavs)) {
        for (const id of savedFavs) {
          if (typeof id === 'string') this.favoriteTaskIds.add(id);
        }
      }
    }
  }

  init() {
    this.refresh();

    // Setup file watcher on **/.vscode/tasks.json
    if (vscode && vscode.workspace && typeof vscode.workspace.createFileSystemWatcher === 'function') {
      try {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/.vscode/tasks.json');
        this.watcher.onDidChange(() => this.refresh());
        this.watcher.onDidCreate(() => this.refresh());
        this.watcher.onDidDelete(() => this.refresh());
        if (this.context && this.context.subscriptions) {
          this.context.subscriptions.push(this.watcher);
        }
      } catch (err) {
        console.error('[projectTasks] Failed to setup file watcher:', err);
      }
    }

    // Setup task execution listeners
    if (vscode && vscode.tasks && typeof vscode.tasks.onDidStartTask === 'function') {
      const startSub = vscode.tasks.onDidStartTask((e) => {
        const task = e.execution?.task;
        if (!task) return;
        const taskId = this.resolveTaskIdForVsTask(task);
        if (taskId) {
          const startTime = Date.now();
          this.activeExecutions.set(e.execution, { taskId, startTime });
          this.updateTaskState(taskId, {
            status: 'running',
            lastRun: startTime,
            lastExitCode: undefined,
            error: undefined
          });
        }
      });

      const endProcSub = vscode.tasks.onDidEndTaskProcess((e) => {
        const info = this.activeExecutions.get(e.execution);
        const task = e.execution?.task;
        const taskId = info?.taskId || (task ? this.resolveTaskIdForVsTask(task) : null);
        if (taskId) {
          const duration = info ? Date.now() - info.startTime : undefined;
          const isSuccess = e.exitCode === 0;
          this.updateTaskState(taskId, {
            status: isSuccess ? 'success' : 'error',
            lastDurationMs: duration,
            lastExitCode: e.exitCode,
            error: isSuccess ? undefined : `Beendet mit Exit-Code ${e.exitCode}`
          });
          this.activeExecutions.delete(e.execution);
        }
      });

      const endTaskSub = vscode.tasks.onDidEndTask((e) => {
        const info = this.activeExecutions.get(e.execution);
        if (info) {
          const current = this.taskStates.get(info.taskId);
          if (current && current.status === 'running') {
            const duration = Date.now() - info.startTime;
            this.updateTaskState(info.taskId, {
              status: 'idle',
              lastDurationMs: duration
            });
          }
          this.activeExecutions.delete(e.execution);
        }
      });

      if (this.context && this.context.subscriptions) {
        this.context.subscriptions.push(startSub, endProcSub, endTaskSub);
      }
    }
  }

  resolveTaskIdForVsTask(vsTask) {
    if (!vsTask) return null;
    const taskName = vsTask.name;
    let projName = '';
    if (vsTask.scope && typeof vsTask.scope === 'object') {
      projName = vsTask.scope.name || path.basename(vsTask.scope.uri?.fsPath || '');
    }
    if (projName) {
      const match = this.tasks.find((t) => t.project === projName && t.label === taskName);
      if (match) return match.id;
    }
    // Fallback: match by task name alone
    const candidates = this.tasks.filter((t) => t.label === taskName);
    if (candidates.length === 1) return candidates[0].id;
    return null;
  }

  refresh() {
    const extraDirs = [];
    if (vscode && vscode.workspace && Array.isArray(vscode.workspace.workspaceFolders)) {
      for (const f of vscode.workspace.workspaceFolders) {
        if (f.uri && f.uri.fsPath) {
          extraDirs.push(f.uri.fsPath);
        }
      }
    }
    this.tasks = scanProjectTasks(undefined, extraDirs);
    this.notifyChange();
    return this.tasks;
  }

  getAllTasks() {
    return this.tasks.map((t) => ({
      ...t,
      isFavorite: this.favoriteTaskIds.has(t.id),
      state: this.taskStates.get(t.id) || { status: 'idle' }
    }));
  }

  getTask(taskId) {
    const t = this.tasks.find((item) => item.id === taskId);
    if (!t) return null;
    return {
      ...t,
      isFavorite: this.favoriteTaskIds.has(t.id),
      state: this.taskStates.get(t.id) || { status: 'idle' }
    };
  }

  isFavorite(taskId) {
    return this.favoriteTaskIds.has(taskId);
  }

  toggleFavorite(taskId) {
    if (this.favoriteTaskIds.has(taskId)) {
      this.favoriteTaskIds.delete(taskId);
    } else {
      this.favoriteTaskIds.add(taskId);
    }
    if (this.context && this.context.globalState) {
      this.context.globalState.update('sessionDashboard.favoriteTasks', Array.from(this.favoriteTaskIds));
    }
    this.notifyChange(taskId, this.taskStates.get(taskId) || { status: 'idle' });
    return this.favoriteTaskIds.has(taskId);
  }

  setFavorite(taskId, isFav) {
    if (isFav) {
      this.favoriteTaskIds.add(taskId);
    } else {
      this.favoriteTaskIds.delete(taskId);
    }
    if (this.context && this.context.globalState) {
      this.context.globalState.update('sessionDashboard.favoriteTasks', Array.from(this.favoriteTaskIds));
    }
    this.notifyChange(taskId, this.taskStates.get(taskId) || { status: 'idle' });
  }

  getProjects() {
    const set = new Set();
    for (const t of this.tasks) {
      set.add(t.project);
    }
    return Array.from(set).sort();
  }

  updateTaskState(taskId, stateUpdate) {
    const prev = this.taskStates.get(taskId) || { status: 'idle' };
    const next = { ...prev, ...stateUpdate };
    this.taskStates.set(taskId, next);

    if (this.context && this.context.globalState) {
      const obj = Object.fromEntries(this.taskStates.entries());
      this.context.globalState.update('sessionDashboard.projectTaskStates', obj);
    }

    this.notifyChange(taskId, next);
  }

  onDidChange(listener) {
    this.changeListeners.add(listener);
    return {
      dispose: () => this.changeListeners.delete(listener)
    };
  }

  notifyChange(taskId, state) {
    for (const listener of this.changeListeners) {
      try {
        listener(taskId, state);
      } catch (err) {
        console.error('[projectTasks] Change listener error:', err);
      }
    }
  }

  async executeTask(taskId) {
    const taskDef = this.tasks.find((t) => t.id === taskId);
    if (!taskDef) {
      throw new Error(`Task '${taskId}' nicht gefunden.`);
    }

    // 1. Try to find native VS Code task
    if (vscode && vscode.tasks && typeof vscode.tasks.fetchTasks === 'function') {
      try {
        const vsTasks = await vscode.tasks.fetchTasks();
        const matched = vsTasks.find((vt) => {
          if (vt.name !== taskDef.label) return false;
          if (vt.scope && typeof vt.scope === 'object') {
            const scopeName = vt.scope.name || path.basename(vt.scope.uri?.fsPath || '');
            if (scopeName === taskDef.project) return true;
          }
          return false;
        });

        if (matched) {
          const execution = await vscode.tasks.executeTask(matched);
          const startTime = Date.now();
          this.activeExecutions.set(execution, { taskId, startTime });
          this.updateTaskState(taskId, {
            status: 'running',
            lastRun: startTime,
            lastExitCode: undefined,
            error: undefined
          });
          return { method: 'native', execution };
        }
      } catch (err) {
        console.warn(`[projectTasks] fetchTasks/executeTask failed for ${taskId}, trying fallback:`, err.message);
      }
    }

    // 2. Fallback: Run in Integrated Terminal if project directory exists
    if (!fs.existsSync(taskDef.projectDir)) {
      throw new Error(`Projektverzeichnis '${taskDef.projectDir}' existiert nicht.`);
    }

    if (!vscode || !vscode.window) {
      throw new Error('VS Code window API nicht verfügbar.');
    }

    const termName = `Task: ${taskDef.label} (${taskDef.project})`;
    let terminal = vscode.window.terminals.find((t) => t.name === termName);
    if (!terminal) {
      terminal = vscode.window.createTerminal({
        name: termName,
        cwd: taskDef.projectDir
      });
    }
    terminal.show(false);

    let cmdStr = '';
    if (taskDef.type === 'shell' || !taskDef.type) {
      const parts = [];
      if (taskDef.command) parts.push(taskDef.command);
      if (Array.isArray(taskDef.args)) parts.push(...taskDef.args);
      cmdStr = parts.join(' ');
    } else {
      cmdStr = taskDef.command || taskDef.label;
    }

    const startTime = Date.now();
    this.updateTaskState(taskId, {
      status: 'running',
      lastRun: startTime,
      lastExitCode: undefined,
      error: undefined
    });

    terminal.sendText(cmdStr);
    return { method: 'terminal', terminal };
  }

  dispose() {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }
    this.changeListeners.clear();
    this.activeExecutions.clear();
  }
}

module.exports = {
  stripJsonComments,
  parseTasksFile,
  scanProjectTasks,
  ProjectTasksManager
};
