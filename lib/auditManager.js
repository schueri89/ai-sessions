'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
let vscode;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}
const { getKnownSubfolders, getDefaultRoot } = require('./project');

class AuditManager {
  constructor(context, options = {}) {
    this.context = context;
    this.vscode = options.vscode || vscode;
    this.soundNotifier = options.soundNotifier || null;
    this.toastNotifier = options.toastNotifier || null;
    this.runningProjects = new Map(); // projectName -> { mode, startTime, process, pid, isRestored }
    this.processWatchers = new Map(); // projectName -> setInterval timer
    const runningState = this.loadRunningState();
    this.auditQueue = Array.isArray(runningState.queue) ? runningState.queue : []; // [{ projectName, mode, diff, model }]
    this.changeListeners = new Set();
    this.cachedReports = null;
    this.lastScanTime = 0;
    this.cachedModels = null;
    this.lastModelScanTime = 0;

    // Reconcile running processes from disk or OS
    this.reconcileRunningProcesses();
    this.syncAuditConfig();
  }

  getDefaultModel() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.audits');
        const configured = cfg.get('defaultModel');
        if (configured && typeof configured === 'string' && configured.trim()) {
          return configured.trim();
        }
      } catch (err) {
        console.warn('[AuditManager] Error reading defaultModel setting:', err);
      }
    }
    return 'gemma4:e4b';
  }

  getNightlyModel() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.audits');
        const configured = cfg.get('nightlyModel');
        if (configured && typeof configured === 'string' && configured.trim()) {
          return configured.trim();
        }
      } catch (err) {
        console.warn('[AuditManager] Error reading nightlyModel setting:', err);
      }
    }
    return 'gemma4:e4b';
  }

  getWeekendFullAudit() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.audits');
        return Boolean(cfg.get('weekendFullAudit', true));
      } catch {}
    }
    return true;
  }

  getWeekendDay() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.audits');
        const day = cfg.get('weekendDay');
        if (day && typeof day === 'string' && day.trim()) return day.trim();
      } catch {}
    }
    return 'Saturday';
  }

  getDailyDiffMode() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.audits');
        const mode = cfg.get('dailyDiffMode');
        if (mode && typeof mode === 'string' && mode.trim()) return mode.trim();
      } catch {}
    }
    return 'since-yesterday';
  }

  getScheduledTaskTime() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.audits');
        const t = cfg.get('scheduledTaskTime');
        if (t && typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t.trim())) return t.trim();
      } catch {}
    }
    return '04:30';
  }

  syncAuditConfig() {
    try {
      const stateFile = this.getStateFilePath();
      const nightlyModel = this.getNightlyModel();
      const weekendFull = this.getWeekendFullAudit();
      const weekendDay = this.getWeekendDay();
      const dailyDiff = this.getDailyDiffMode();
      const taskTime = this.getScheduledTaskTime();

      let state = { version: 1, last_updated: '', config: {}, projects: {} };
      if (fs.existsSync(stateFile)) {
        try {
          const raw = fs.readFileSync(stateFile, 'utf8');
          state = JSON.parse(raw) || state;
        } catch {}
      }
      if (!state.config) state.config = {};
      let changed = false;

      if (state.config.nightly_model !== nightlyModel) {
        state.config.nightly_model = nightlyModel;
        changed = true;
      }
      if (state.config.weekend_full_audit !== weekendFull) {
        state.config.weekend_full_audit = weekendFull;
        changed = true;
      }
      if (state.config.weekend_day !== weekendDay) {
        state.config.weekend_day = weekendDay;
        changed = true;
      }
      if (state.config.daily_diff_mode !== dailyDiff) {
        state.config.daily_diff_mode = dailyDiff;
        changed = true;
      }
      if (state.config.scheduled_task_time !== taskTime) {
        state.config.scheduled_task_time = taskTime;
        changed = true;
      }

      if (changed) {
        const tmp = `${stateFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(tmp, stateFile);
      }
    } catch (err) {
      console.warn('[AuditManager] Error syncing audit config:', err);
    }
  }

  getDismissals(projectName) {
    const state = this.loadAuditState();
    const pSt = (state.projects && state.projects[projectName]) || {};
    return Array.isArray(pSt.dismissals) ? pSt.dismissals.slice() : [];
  }

  addDismissal(projectName, dismissal) {
    if (!projectName || !dismissal) return null;
    const state = this.loadAuditState();
    if (!state.projects) state.projects = {};
    if (!state.projects[projectName]) state.projects[projectName] = {};
    const pSt = state.projects[projectName];
    if (!Array.isArray(pSt.dismissals)) pSt.dismissals = [];

    const dId = dismissal.id || `dsm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowStr = this.formatGermanDate(Date.now());
    const entry = {
      id: dId,
      title: String(dismissal.title || 'Ignorierter Befund').trim(),
      file: String(dismissal.file || '').trim(),
      line: dismissal.line ? Number(dismissal.line) : null,
      reason: String(dismissal.reason || 'False Positive / Gewolltes Verhalten').trim(),
      type: dismissal.type || 'all',
      severity: dismissal.severity || 'WARNUNG',
      createdAt: dismissal.createdAt || nowStr
    };

    const existingIdx = pSt.dismissals.findIndex((d) => d.id === dId);
    if (existingIdx >= 0) {
      pSt.dismissals[existingIdx] = entry;
    } else {
      pSt.dismissals.push(entry);
    }

    this.saveAuditState(state);
    this.cachedReports = null;
    this.notifyChange();
    if (vscode && vscode.window) {
      vscode.window.showInformationMessage(`Befund "${entry.title}" für ${projectName} als ignoriert gespeichert.`);
    }
    return entry;
  }

  removeDismissal(projectName, dismissalId) {
    if (!projectName || !dismissalId) return false;
    const state = this.loadAuditState();
    const pSt = state.projects && state.projects[projectName];
    if (!pSt || !Array.isArray(pSt.dismissals)) return false;

    const origLen = pSt.dismissals.length;
    pSt.dismissals = pSt.dismissals.filter((d) => d.id !== dismissalId);
    if (pSt.dismissals.length !== origLen) {
      this.saveAuditState(state);
      this.cachedReports = null;
      this.notifyChange();
      if (vscode && vscode.window) {
        vscode.window.showInformationMessage(`Ignorierter Befund für ${projectName} wieder aktiviert.`);
      }
      return true;
    }
    return false;
  }

  getAvailableModels() {
    const now = Date.now();
    if (this.cachedModels && (now - this.lastModelScanTime < 30000)) {
      return this.cachedModels;
    }

    let models = ['gemma4:e4b', 'gemma4:26b'];
    try {
      const scriptPath = path.join(this.getToolsDir(), 'project-audit.py');
      if (fs.existsSync(scriptPath)) {
        const out = execSync(`python "${scriptPath}" --list-models --format json`, {
          cwd: this.getRoot(),
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 3000
        }).toString('utf8').trim();
        const parsed = JSON.parse(out);
        if (Array.isArray(parsed) && parsed.length > 0) {
          models = parsed;
        }
      }
    } catch {
      // fallback to default list
    }

    const def = this.getDefaultModel();
    if (models.includes(def)) {
      models = [def, ...models.filter((m) => m !== def)];
    }

    this.cachedModels = models;
    this.lastModelScanTime = now;
    return models;
  }

  onDidChange(listener) {
    this.changeListeners.add(listener);
    return {
      dispose: () => this.changeListeners.delete(listener)
    };
  }

  notifyChange() {
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[AuditManager] Listener error:', err);
      }
    }
  }

  getRoot() {
    return typeof getDefaultRoot === 'function' ? getDefaultRoot() : process.cwd();
  }

  getReportsDir() {
    return path.join(this.getRoot(), '.agents', 'reports');
  }

  getToolsDir() {
    return path.join(this.getRoot(), '.agents', 'tools');
  }

  getStateFilePath() {
    return path.join(this.getReportsDir(), 'audit-state.json');
  }

  isPidAlive(pid) {
    if (!pid || typeof pid !== 'number' || isNaN(pid)) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  getRunningStateFilePath() {
    return path.join(this.getReportsDir(), 'audit-running.json');
  }

  loadRunningState() {
    const file = this.getRunningStateFilePath();
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            processes: Array.isArray(parsed.processes) ? parsed.processes : [],
            queue: Array.isArray(parsed.queue) ? parsed.queue : []
          };
        }
      } catch (err) {
        console.warn('[AuditManager] Error reading audit-running.json:', err);
      }
    }
    return { processes: [], queue: [] };
  }

  saveRunningState(state) {
    try {
      const reportsDir = this.getReportsDir();
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      const file = this.getRunningStateFilePath();
      const hasProcesses = state && Array.isArray(state.processes) && state.processes.length > 0;
      const hasQueue = state && Array.isArray(state.queue) && state.queue.length > 0;
      if (!hasProcesses && !hasQueue) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
        return;
      }
      const toSave = {
        processes: (state && Array.isArray(state.processes)) ? state.processes : [],
        queue: (state && Array.isArray(state.queue)) ? state.queue : (this.auditQueue || [])
      };
      const tmpFile = `${file}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(toSave, null, 2), 'utf8');
      fs.renameSync(tmpFile, file);
    } catch (err) {
      console.warn('[AuditManager] Error saving audit-running.json:', err);
    }
  }

  saveQueueState() {
    const state = this.loadRunningState();
    state.queue = this.auditQueue;
    this.saveRunningState(state);
  }

  addRunningState(entry) {
    const state = this.loadRunningState();
    state.processes = state.processes.filter((p) => p.project !== entry.project);
    state.processes.push(entry);
    state.queue = this.auditQueue;
    this.saveRunningState(state);
  }

  removeRunningState(project) {
    const state = this.loadRunningState();
    state.processes = state.processes.filter((p) => p.project !== project);
    state.queue = this.auditQueue;
    this.saveRunningState(state);
  }

  detectActiveAuditProcesses() {
    const detected = [];
    if (process.platform !== 'win32') return detected;
    try {
      const cmd = `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%project-audit.py%'" | Where-Object { $_.CommandLine -notmatch 'powershell' } | ForEach-Object { [PSCustomObject]@{ pid = $_.ProcessId; commandLine = $_.CommandLine; creationDate = $_.CreationDate.ToString('o') } } | ConvertTo-Json -Compress`;
      const out = execSync(`powershell.exe -NoProfile -NonInteractive -Command "${cmd}"`, {
        cwd: this.getRoot(),
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 4000
      }).toString('utf8').trim();

      if (out) {
        let items = [];
        try {
          const parsed = JSON.parse(out);
          items = Array.isArray(parsed) ? parsed : [parsed];
        } catch {}

        for (const it of items) {
          if (!it || !it.pid || !it.commandLine) continue;
          const pid = Number(it.pid);
          if (isNaN(pid) || !this.isPidAlive(pid)) continue;

          const projMatch = it.commandLine.match(/--project\s+([^\s]+)/);
          const modeMatch = it.commandLine.match(/--mode\s+([^\s]+)/);
          const diffMatch = it.commandLine.match(/--diff\s+([^\s]+)/);
          const modelMatch = it.commandLine.match(/--model\s+([^\s]+)/);
          const isGuards = it.commandLine.includes('--mode guards');

          const project = isGuards ? '__workspace_guards__' : (projMatch ? projMatch[1] : null);
          if (!project) continue;

          let startTime = Date.now();
          if (it.creationDate) {
            const d = new Date(it.creationDate);
            if (!isNaN(d.getTime())) startTime = d.getTime();
          }

          detected.push({
            pid,
            project,
            mode: isGuards ? 'guards' : (modeMatch ? modeMatch[1] : 'all'),
            diff: diffMatch ? diffMatch[1] : 'unstaged',
            model: modelMatch ? modelMatch[1] : this.getDefaultModel(),
            startTime
          });
        }
      }
    } catch {}
    return detected;
  }

  reconcileRunningProcesses() {
    const runningState = this.loadRunningState();
    const activeEntries = [];

    for (const p of runningState.processes) {
      if (this.isPidAlive(p.pid)) {
        activeEntries.push(p);
      }
    }

    const detected = this.detectActiveAuditProcesses();
    for (const d of detected) {
      if (!activeEntries.some((a) => a.project === d.project)) {
        activeEntries.push(d);
      }
    }

    if (activeEntries.length !== runningState.processes.length || detected.length > 0) {
      this.saveRunningState({ processes: activeEntries });
    }

    for (const entry of activeEntries) {
      if (!this.runningProjects.has(entry.project)) {
        this.runningProjects.set(entry.project, {
          mode: entry.mode,
          diff: entry.diff,
          model: entry.model,
          startTime: entry.startTime,
          pid: entry.pid,
          isRestored: true
        });
        this.startProcessWatcher(entry.project, entry.pid, entry.startTime);
      }
    }

    if (this.runningProjects.size === 0 && this.auditQueue.length > 0) {
      this.processNextInQueue();
    }
  }

  startProcessWatcher(project, pid, startTime) {
    if (this.processWatchers.has(project)) {
      clearInterval(this.processWatchers.get(project));
      this.processWatchers.delete(project);
    }

    const timer = setInterval(() => {
      if (!this.isPidAlive(pid)) {
        clearInterval(timer);
        this.processWatchers.delete(project);
        if (this.runningProjects.has(project)) {
          const runInfo = this.runningProjects.get(project);
          if (runInfo && runInfo.finishProgress) {
            try { runInfo.finishProgress(); } catch {}
            runInfo.finishProgress = null;
          }
          this.runningProjects.delete(project);
          this.removeRunningState(project);

          if (project && project !== '__workspace_guards__' && project !== 'workspace') {
            try {
              const auditState = this.loadAuditState();
              if (!auditState.projects[project]) {
                auditState.projects[project] = {};
              }
              const pSt = auditState.projects[project];
              const mode = runInfo ? runInfo.mode : 'all';
              if (mode === 'review' || mode === 'cr' || mode === 'all') {
                pSt.cr_status = 'pending';
              }
              if (mode === 'security' || mode === 'sec' || mode === 'all') {
                pSt.sec_status = 'pending';
              }
              if (mode === 'perf' || mode === 'performance' || mode === 'all') {
                pSt.perf_status = 'pending';
              }
              pSt.status = 'pending';
              this.saveAuditState(auditState);
            } catch (stErr) {
              console.warn('[AuditManager] Error updating audit-state in watcher:', stErr);
            }
          }

          this.getReports(true);
          this.notifyChange();

          const durationMs = Date.now() - startTime;
          if (project === '__workspace_guards__') {
            const guards = this.getWorkspaceGuards();
            this.notifyAuditCompletion('workspace', {
              isSuccess: guards ? guards.status === 'passed' : true,
              status: guards ? guards.status : 'passed',
              summary: guards ? guards.summary : 'Erfolgreich geprüft',
              durationMs
            });
          } else {
            const rep = this.cachedReports ? this.cachedReports.get(project) : null;
            this.notifyAuditCompletion(project, {
              isSuccess: rep ? rep.status === 'passed' : true,
              status: rep ? rep.status : 'passed',
              summary: rep ? rep.summary : '',
              durationMs
            });
          }
          this.processNextInQueue();
        }
        return;
      }

      if (this.runningProjects.has(project)) {
        const runInfo = this.runningProjects.get(project);
        if (runInfo && runInfo.progress) {
          const elapsed = Date.now() - startTime;
          const sec = Math.floor(elapsed / 1000);
          const durStr = sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
          runInfo.progress.report({ message: `Prüfung läuft (${durStr})…` });
        }
      }
    }, 1000);

    this.processWatchers.set(project, timer);
  }

  cancelAudit(projectName, mode = null) {
    const key = (projectName === 'workspace' || projectName === '__workspace_guards__') ? '__workspace_guards__' : projectName;

    // 1. Check queue
    const queueIdx = this.auditQueue.findIndex((q) => {
      if (q.projectName !== key) return false;
      if (mode && q.mode !== mode && !(mode === 'review' && q.mode === 'cr') && !(mode === 'security' && q.mode === 'sec') && !(mode === 'perf' && q.mode === 'performance')) return false;
      return true;
    });
    if (queueIdx !== -1) {
      const removed = this.auditQueue.splice(queueIdx, 1)[0];
      this.saveQueueState();
      this.notifyChange();
      if (vscode) {
        const modeSuffix = removed && removed.mode ? ` (${removed.mode})` : '';
        vscode.window.showInformationMessage(`Audit für ${key}${modeSuffix} aus der Warteschlange entfernt.`);
      }
      return true;
    }

    // 2. Check running
    const run = this.runningProjects.get(key);
    if (!run) return false;

    if (run.finishProgress) {
      try { run.finishProgress(); } catch {}
      run.finishProgress = null;
    }

    if (this.processWatchers.has(key)) {
      clearInterval(this.processWatchers.get(key));
      this.processWatchers.delete(key);
    }

    const pid = run.pid || (run.process ? run.process.pid : null);
    if (run.process) {
      try {
        run.process.kill();
      } catch {}
    }
    if (pid && typeof pid === 'number') {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    }

    this.runningProjects.delete(key);
    this.removeRunningState(key);
    this.getReports(true);
    this.notifyChange();

    if (vscode) {
      const label = key === '__workspace_guards__' ? 'Workspace-Guards' : `Audit für "${key}"`;
      vscode.window.showInformationMessage(`${label} wurde abgebrochen.`);
    }

    this.processNextInQueue();
    return true;
  }

  isProgressNotificationEnabled() {
    const vsc = this.vscode || vscode;
    if (!vsc || !vsc.workspace) return false;
    return vsc.workspace.getConfiguration('sessionDashboard.audits').get('showProgressNotification', true);
  }

  startAuditProgressNotification(key, { mode, diff, model, isGuards } = {}) {
    const vsc = this.vscode || vscode;
    if (!vsc || !vsc.window || typeof vsc.window.withProgress !== 'function') return;
    if (!this.isProgressNotificationEnabled()) return;

    const title = isGuards
      ? '[🛡️ Workspace Guards] Prüfung läuft…'
      : `[🛡️ ${key}] Audit (${mode || 'all'}) läuft…`;

    vsc.window.withProgress(
      {
        location: vsc.ProgressLocation.Notification,
        title,
        cancellable: true
      },
      (progress, token) => {
        return new Promise((resolve) => {
          token.onCancellationRequested(() => {
            this.cancelAudit(key, mode);
            resolve();
          });

          const run = this.runningProjects.get(key);
          if (run) {
            run.progress = progress;
            run.finishProgress = resolve;
            progress.report({ message: `Initialisiere (${model || 'Ollama'})…` });
          } else {
            resolve();
          }
        });
      }
    );
  }

  loadAuditState() {
    const file = this.getStateFilePath();
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (!parsed.projects) parsed.projects = {};
          return parsed;
        }
      } catch (err) {
        console.warn('[AuditManager] Error reading audit-state.json:', err);
      }
    }
    return { version: 1, last_updated: '', projects: {} };
  }

  saveAuditState(state) {
    const reportsDir = this.getReportsDir();
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    state.last_updated = this.formatGermanDate(Date.now());
    const file = this.getStateFilePath();
    const tmpFile = `${file}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, file);
  }

  markProjectReviewed(projectName, reviewType = 'all') {
    const state = this.loadAuditState();
    const root = this.getRoot();
    const targets = (!projectName || projectName === 'all') ? this.getProjects() : [projectName];
    const nowStr = this.formatGermanDate(Date.now());
    const nowMs = Date.now();
    const normType = (reviewType === 'review' || reviewType === 'cr') ? 'cr'
      : (reviewType === 'security' || reviewType === 'sec') ? 'sec'
      : (reviewType === 'perf' || reviewType === 'performance') ? 'perf'
      : 'all';

    const reports = this.getReports();

    for (const proj of targets) {
      if (proj === 'workspace') continue;
      const projDir = path.join(root, proj);
      let headSha = '';
      try {
        const out = execSync('git rev-parse HEAD', { cwd: projDir, stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 });
        headSha = out.toString('utf8').trim();
      } catch {
        // ignore git error
      }

      if (!state.projects[proj]) {
        state.projects[proj] = {};
      }
      const p = state.projects[proj];
      const projRep = reports.get(proj);
      const hasCr = Boolean(projRep && projRep.cr);
      const hasSec = Boolean(projRep && projRep.sec);
      const hasPerf = Boolean(projRep && projRep.perf);

      if (normType === 'cr' || normType === 'all') {
        p.cr_status = 'reviewed';
        p.cr_reviewed_at = nowStr;
        p.cr_reviewed_commit = p.last_review_commit || headSha;
        p.cr_reviewed_time = nowMs;
      }
      if (normType === 'sec' || normType === 'all') {
        p.sec_status = 'reviewed';
        p.sec_reviewed_at = nowStr;
        p.sec_reviewed_commit = p.last_security_commit || headSha;
        p.sec_reviewed_time = nowMs;
      }
      if (normType === 'perf' || normType === 'all') {
        p.perf_status = 'reviewed';
        p.perf_reviewed_at = nowStr;
        p.perf_reviewed_commit = p.last_perf_commit || headSha;
        p.perf_reviewed_time = nowMs;
      }

      const crDone = hasCr ? p.cr_status === 'reviewed' : p.cr_status !== 'pending';
      const secDone = hasSec ? p.sec_status === 'reviewed' : p.sec_status !== 'pending';
      const perfDone = hasPerf ? p.perf_status === 'reviewed' : p.perf_status !== 'pending';

      if (crDone && secDone && perfDone) {
        p.status = 'reviewed';
        p.last_reviewed_commit = p.last_review_commit || p.last_security_commit || p.last_perf_commit || headSha;
        p.last_reviewed_at = nowStr;
        p.last_reviewed_time = nowMs;
        p.is_cumulative = false;
        p.unreviewed_days = 0;
      } else {
        p.status = 'pending';
      }
    }

    this.saveAuditState(state);
    this.notifyChange();

    if (vscode) {
      const typeLabel = normType === 'cr' ? 'Code-Review für '
        : normType === 'sec' ? 'Security-Audit für '
        : normType === 'perf' ? 'Performance-Review für '
        : '';
      const label = (!projectName || projectName === 'all')
        ? (normType === 'all' ? 'Alle Projekte' : `${typeLabel}alle Projekte`)
        : (normType === 'all' ? `Projekt „${projectName}“` : `${typeLabel}Projekt „${projectName}“`);
      vscode.window.showInformationMessage(`${label} als geprüft quittiert.`);
    }
  }

  toggleDailyAudit(projectName, enabled = null) {
    if (!projectName) return false;
    const state = this.loadAuditState();
    if (!state.projects[projectName]) {
      state.projects[projectName] = {};
    }
    const current = Boolean(state.projects[projectName].daily_active);
    const targetState = (enabled !== null && enabled !== undefined) ? Boolean(enabled) : !current;
    state.projects[projectName].daily_active = targetState;
    this.saveAuditState(state);
    this.notifyChange();
    if (vscode) {
      const label = targetState ? 'aktiviert' : 'deaktiviert';
      vscode.window.showInformationMessage(`Daily Audit für „${projectName}“ ${label}.`);
    }
    return targetState;
  }

  setAllDailyAudits(enabled) {
    const state = this.loadAuditState();
    const targetState = Boolean(enabled);
    const projects = this.getProjects();
    for (const p of projects) {
      if (p === 'workspace') continue;
      if (!state.projects[p]) {
        state.projects[p] = {};
      }
      state.projects[p].daily_active = targetState;
    }
    this.saveAuditState(state);
    this.notifyChange();
    if (vscode) {
      const label = targetState ? 'für alle Projekte aktiviert' : 'für alle Projekte deaktiviert';
      vscode.window.showInformationMessage(`Daily Audit ${label}.`);
    }
    return targetState;
  }

  getProjects() {
    const root = this.getRoot();
    const subfolders = typeof getKnownSubfolders === 'function' ? getKnownSubfolders(root) : [];
    const validProjects = [];

    for (const sub of subfolders) {
      const gitDir = path.join(root, sub, '.git');
      if (fs.existsSync(gitDir)) {
        validProjects.push(sub);
      }
    }

    // Also include .agents if it has .git
    if (fs.existsSync(path.join(root, '.agents', '.git')) && !validProjects.includes('.agents')) {
      validProjects.push('.agents');
    }

    validProjects.sort((a, b) => a.localeCompare(b));
    return validProjects;
  }

  formatGermanDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  parseGermanDateToMs(str) {
    if (!str || typeof str !== 'string') return 0;
    const m = str.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    const [, d, mon, y, h, min, s] = m;
    return new Date(Number(y), Number(mon) - 1, Number(d), Number(h), Number(min), s ? Number(s) : 0).getTime();
  }

  decodeCliBuffer(buf) {
    if (!buf || !buf.length) return '';
    let isUtf8 = true;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] >= 0x80) {
        if ((buf[i] & 0xE0) === 0xC0 && i + 1 < buf.length && (buf[i + 1] & 0xC0) === 0x80) {
          i++;
        } else if ((buf[i] & 0xF0) === 0xE0 && i + 2 < buf.length && (buf[i + 1] & 0xC0) === 0x80 && (buf[i + 2] & 0xC0) === 0x80) {
          i += 2;
        } else {
          isUtf8 = false;
          break;
        }
      }
    }

    let text = '';
    if (isUtf8) {
      text = buf.toString('utf8');
    } else {
      const cp850 = { 0x84: 'ä', 0x94: 'ö', 0x81: 'ü', 0x8E: 'Ä', 0x99: 'Ö', 0x9A: 'Ü', 0xE1: 'ß' };
      const cp1252 = { 0xE4: 'ä', 0xF6: 'ö', 0xFC: 'ü', 0xC4: 'Ä', 0xD6: 'Ö', 0xDC: 'Ü', 0xDF: 'ß' };
      let matches850 = 0;
      let matches1252 = 0;
      for (let i = 0; i < buf.length; i++) {
        if (cp850[buf[i]]) matches850++;
        if (cp1252[buf[i]]) matches1252++;
      }
      const map = matches850 >= matches1252 ? cp850 : cp1252;
      const chars = [];
      for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (b < 0x80) chars.push(String.fromCharCode(b));
        else if (map[b]) chars.push(map[b]);
        else chars.push(String.fromCharCode(b));
      }
      text = chars.join('');
    }

    return this.fixUmlauts(text);
  }

  fixUmlauts(str) {
    if (!str) return '';
    return String(str)
      .replace(/\uFEFF/g, '')
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã„/g, 'Ä')
      .replace(/Ã–/g, 'Ö')
      .replace(/Ãœ/g, 'Ü')
      .replace(/ÃŸ/g, 'ß')
      .replace(/T\uFFFDglich/g, 'Täglich')
      .replace(/Tglich/g, 'Täglich')
      .replace(/N\uFFFDchtlich/g, 'Nächtlich')
      .replace(/Nchtlich/g, 'Nächtlich')
      .replace(/N\uFFFDchtlicher/g, 'Nächtlicher')
      .replace(/Nchtlicher/g, 'Nächtlicher')
      .replace(/verf\uFFFDgbar/g, 'verfügbar')
      .replace(/verfgbar/g, 'verfügbar')
      .replace(/ausgef\uFFFDhrt/g, 'ausgeführt')
      .replace(/ausgefhrt/g, 'ausgeführt')
      .replace(/regelm\uFFFDssig/g, 'regelmäßig')
      .replace(/regelmssig/g, 'regelmäßig');
  }

  getReports(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedReports && (now - this.lastScanTime < 5000)) {
      return this.cachedReports;
    }

    const reportsDir = this.getReportsDir();
    const reportsByProject = new Map();

    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir);
      // Matches YYYY-MM-DD_<project>_review.md, _security.md, and _perf.md
      const crPattern = /^(\d{4}-\d{2}-\d{2})_(.+)_(?:review|cr)\.md$/i;
      const secPattern = /^(\d{4}-\d{2}-\d{2})_(.+)_(?:security|sec)\.md$/i;
      const perfPattern = /^(\d{4}-\d{2}-\d{2})_(.+)_(?:perf|performance)\.md$/i;

      for (const f of files) {
        let m = f.match(crPattern);
        let reportType = '';
        if (m) {
          reportType = 'cr';
        } else {
          m = f.match(secPattern);
          if (m) {
            reportType = 'sec';
          } else {
            m = f.match(perfPattern);
            if (m) {
              reportType = 'perf';
            }
          }
        }
        if (!m) continue;

        const [, dateStr, project] = m;
        const filePath = path.join(reportsDir, f);
        let stat;
        try {
          stat = fs.statSync(filePath);
        } catch {
          continue;
        }

        if (!reportsByProject.has(project)) {
          reportsByProject.set(project, { project, cr: null, sec: null, perf: null });
        }
        const projRep = reportsByProject.get(project);
        const existing = projRep[reportType];

        if (!existing || stat.mtimeMs > existing.mtimeMs) {
          const content = fs.readFileSync(filePath, 'utf8');
          const dismissals = this.getDismissals(project);
          const status = this.parseReportStatus(content, stat.mtimeMs, dismissals);

          projRep[reportType] = {
            project,
            date: dateStr,
            lastRun: status.timestamp || this.formatGermanDate(stat.mtimeMs),
            filePath,
            fileName: f,
            mtimeMs: stat.mtimeMs,
            status: status.status,
            mode: status.mode,
            model: status.model,
            summary: status.summary
          };
        }
      }
    }

    this.cachedReports = reportsByProject;
    this.lastScanTime = now;
    return reportsByProject;
  }

  parseReportStatus(content, mtimeMs, dismissals = null) {
    let mode = 'all';
    let model = 'gemma4:e4b';
    let status = 'passed';
    let summary = 'Keine Auffälligkeiten';
    let timestamp = '';

    // Parse header lines
    const datumMatch = content.match(/Datum:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4}\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)/i);
    if (datumMatch) {
      timestamp = datumMatch[1].replace(/(\b\d{1,2}:\d{2}):\d{2}\b/g, '$1');
    } else if (mtimeMs) {
      timestamp = this.formatGermanDate(mtimeMs);
    }

    const modeMatch = content.match(/Modus:\s*`([^`]+)`/i);
    if (modeMatch) mode = modeMatch[1];

    const modelMatch = content.match(/Modell:\s*`([^`]+)`/i);
    if (modelMatch) model = modelMatch[1];

    // Strip handover prompt footer before analyzing findings
    const bodyContent = content.split(/## 🚀 Übergabe an KI-Assistenten/i)[0];

    // Exclude prompt template headlines, confidence scores and "(Keine Befunde)"
    let cleanContent = bodyContent
      .replace(/KRITISCH\s*\(ERROR\)\s*\/\s*WARNUNG\s*\(WARN\)\s*\/\s*HINWEIS\s*\(INFO\)/gi, '')
      .replace(/KRITISCH\s*\(CRITICAL\)\s*\/\s*HOCH\s*\(HIGH\)\s*\/\s*MITTEL\s*\(MEDIUM\)\s*(?:\/\s*NIEDRIG\s*\(LOW\)\s*)?\/\s*HINWEIS\s*\(INFO\)/gi, '')
      .replace(/OPTIMAL\s*\/\s*OPTIMIERUNGSBEDARF\s*\/\s*KRITISCHE BREMSE/gi, '')
      .replace(/\[KRITISCHE BREMSE\s*\|\s*OPTIMIERUNGSBEDARF\]/gi, '')
      .replace(/####\s*KRITISCH[^\n]*\r?\n\s*\(Keine Befunde\)/gi, '')
      .replace(/Schweregrade?:\s*Kritisch\s*\/\s*Hoch\s*\/\s*Mittel/gi, '')
      .replace(/\*{0,2}Konfidenz\*{0,2}:\s*\[?[0-9]+(?:-[0-9]+)?%[^\]\r\n]*\]?/gi, '');

    // Dismissal filtering: neutralize dismissed findings
    let hadDismissedFindings = false;
    if (Array.isArray(dismissals) && dismissals.length > 0) {
      const lines = cleanContent.split('\n');
      const blocks = [];
      let cur = [];
      for (const line of lines) {
        const strp = line.trim();
        const isStart = strp.startsWith('####') || (strp.startsWith('###') && !strp.startsWith('### Zusammenfassung') && !strp.startsWith('### Gesamtbewertung') && !strp.startsWith('### 💡'));
        if (isStart && cur.length > 0) {
          blocks.push(cur.join('\n'));
          cur = [];
        }
        cur.push(line);
      }
      if (cur.length > 0) blocks.push(cur.join('\n'));

      const processed = [];
      for (const b of blocks) {
        let matched = false;
        for (const d of dismissals) {
          const tFile = (d.file || '').trim();
          const tTitle = (d.title || '').trim();
          if (tFile && b.includes(tFile)) { matched = true; break; }
          if (tTitle && tTitle.length >= 3 && b.toLowerCase().includes(tTitle.toLowerCase())) { matched = true; break; }
        }
        if (matched) {
          hadDismissedFindings = true;
          processed.push(b.replace(/\b(KRITISCH|CRITICAL|HOCH|HIGH|MITTEL|MEDIUM|WARNUNG|WARN|CHANGES_REQUESTED|ÄNDERUNGEN ERFORDERLICH|KRITISCHE BREMSE|OPTIMIERUNGSBEDARF)\b/gi, '[IGNORIERT]'));
        } else {
          processed.push(b);
        }
      }
      cleanContent = processed.join('\n');
      if (hadDismissedFindings && !/####\s*(?:KRITISCH|CRITICAL|HOCH|HIGH|MITTEL|MEDIUM)/i.test(cleanContent)) {
        cleanContent = cleanContent.replace(/\b(KRITISCHE BREMSE|OPTIMIERUNGSBEDARF)\b/gi, '[IGNORIERT]');
      }
    }

    const hasOllamaError = /ERROR:\s*(?:Request|Connection) to Ollama failed/i.test(cleanContent);
    const guardsFailed = /## ❌ 1\. Guards & Tests/i.test(cleanContent);
    const hasCritical = /(?:\b(?:CRITICAL|KRITISCH)\b|KRITISCHE BREMSE)/i.test(cleanContent);
    const hasHigh = /\b(?:HIGH|HOCH)\b/i.test(cleanContent);
    const hasWarn = /(?:\b(?:WARN|WARNUNG|CHANGES_REQUESTED|OPTIMIERUNGSBEDARF|MITTEL|MEDIUM)\b|(?:^|\W)(?:ÄNDERUNGEN|AENDERUNGEN)[ _-]ERFORDERLICH(?:\W|$))/i.test(cleanContent);

    if (hasOllamaError) {
      status = 'error';
      summary = /timed out/i.test(bodyContent) ? 'Ollama Timeout (Zeitüberschreitung)' : 'Ollama-Fehler';
    } else if (hasCritical || guardsFailed) {
      status = 'error';
      summary = guardsFailed ? 'Guards fehlgeschlagen' : 'Kritische Sicherheitsfunde';
    } else if (hasHigh || hasWarn) {
      status = 'warning';
      summary = hasHigh ? 'Hohe Risiken gefunden' : 'Prüfbedarf / Warnungen';
    } else if (hadDismissedFindings) {
      status = 'passed';
      summary = 'Bestanden (Befunde ignoriert)';
    } else {
      status = 'passed';
      summary = 'Bestanden (Keine Risiken)';
    }

    return { mode, model, status, summary, timestamp };
  }

  getWorkspaceGuards() {
    const reportsDir = this.getReportsDir();
    if (!fs.existsSync(reportsDir)) return null;

    const files = fs.readdirSync(reportsDir);
    const guardFiles = files.filter((f) => f.endsWith('_workspace_guards.md')).sort().reverse();
    if (guardFiles.length === 0) return null;

    const latest = guardFiles[0];
    const filePath = path.join(reportsDir, latest);
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }

    const wbPassed = content.includes('### ✅ Wissensbasis Guard');
    const umPassed = content.includes('### ✅ Umlaut Guard');
    const hasError = content.includes('## ❌ 1. Guards & Tests');

    let status = 'passed';
    let summary = 'Wissensbasis & Umlaute OK';
    if (hasError) {
      if (!wbPassed && !umPassed) {
        status = 'error';
        summary = 'Wissensbasis & Umlaut Guard fehlerhaft';
      } else if (!wbPassed) {
        status = 'error';
        summary = 'Wissensbasis Guard fehlgeschlagen';
      } else {
        status = 'warning';
        summary = 'Umlaut-Hinweise gefunden';
      }
    }

    const datumMatch = content.match(/Datum:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4}\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)/i);
    let lastRun = datumMatch ? datumMatch[1].replace(/(\b\d{1,2}:\d{2}):\d{2}\b/g, '$1') : '';
    if (!lastRun) {
      try {
        const stat = fs.statSync(filePath);
        lastRun = this.formatGermanDate(stat.mtimeMs);
      } catch {
        const dateMatch = latest.match(/^(\d{4}-\d{2}-\d{2})/);
        lastRun = dateMatch ? dateMatch[1] : '';
      }
    }

    const running = this.runningProjects.get('__workspace_guards__');
    const queueIdx = this.auditQueue.findIndex((q) => q.projectName === '__workspace_guards__' || q.mode === 'guards');
    const isQueued = queueIdx !== -1;
    const queuePosition = isQueued ? queueIdx + 1 : null;
    return {
      status,
      summary,
      lastRun,
      filePath,
      isRunning: Boolean(running),
      isQueued,
      queuePosition,
      startTime: running ? running.startTime : null,
      durationMs: running ? Date.now() - running.startTime : null,
      pid: running ? running.pid : null
    };
  }

  parseCsvLine(line) {
    const values = [];
    const re = /(?:^|,)("(?:[^"]|"")*"|[^,]*)/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      let val = match[1] || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      values.push(val.trim());
      if (re.lastIndex >= line.length) break;
    }
    return values;
  }

  getScheduledTaskName() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.audits');
        const custom = cfg.get('scheduledTaskName');
        if (custom && typeof custom === 'string' && custom.trim()) {
          return custom.trim();
        }
      } catch {}
    }
    return 'DevBox-Nightly-Audit';
  }

  getScheduledTask() {
    const taskName = this.getScheduledTaskName();
    const taskTime = this.getScheduledTaskTime();
    const weekendFull = this.getWeekendFullAudit();
    const weekendDay = this.getWeekendDay();
    const dailyDiff = this.getDailyDiffMode();

    let weekendLabel = 'Sa';
    if (weekendDay === 'Both') weekendLabel = 'Sa & So';
    else if (weekendDay === 'Sunday') weekendLabel = 'So';

    const scheduleStr = weekendFull
      ? `Täglich ${taskTime} Uhr (Mo–Fr: Diff, ${weekendLabel}: Komplett)`
      : `Täglich ${taskTime} Uhr (Diff: ${dailyDiff})`;

    try {
      const buf = execSync(`schtasks.exe /Query /TN "${taskName}" /FO CSV /NH`, {
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000
      });
      const out = this.decodeCliBuffer(buf).trim();
      const parts = this.parseCsvLine(out);
      if (parts.length >= 3) {
        const nextRun = parts[1] ? String(parts[1]).replace(/(\b\d{1,2}:\d{2}):\d{2}\b/g, '$1') : null;
        return {
          isRegistered: true,
          taskName,
          nextRun,
          state: this.fixUmlauts(parts[2] || 'Bereit'),
          schedule: scheduleStr,
          taskTime,
          weekendFullAudit: weekendFull,
          weekendDay,
          dailyDiffMode: dailyDiff,
          nightlyModel: this.getNightlyModel()
        };
      }
    } catch {
      // not registered or query failed
    }

    return {
      isRegistered: false,
      taskName,
      nextRun: null,
      state: 'Nicht registriert',
      schedule: scheduleStr,
      taskTime,
      weekendFullAudit: weekendFull,
      weekendDay,
      dailyDiffMode: dailyDiff,
      nightlyModel: this.getNightlyModel()
    };
  }

  registerScheduledTask() {
    const scriptPath = path.join(this.getToolsDir(), 'setup-task-scheduler.ps1');
    if (!fs.existsSync(scriptPath)) {
      if (vscode) vscode.window.showErrorMessage(`Setup-Skript nicht gefunden: ${scriptPath}`);
      return;
    }
    const taskName = this.getScheduledTaskName();
    const taskTime = this.getScheduledTaskTime();
    try {
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -TaskName "${taskName}" -At "${taskTime}"`, {
        cwd: this.getRoot(),
        encoding: 'utf8',
        timeout: 10000
      });
      if (vscode) vscode.window.showInformationMessage(`Task "${taskName}" erfolgreich registriert (täglich ${taskTime} Uhr).`);
      this.notifyChange();
    } catch (err) {
      if (vscode) vscode.window.showErrorMessage(`Fehler bei Task-Registrierung: ${err.message}`);
    }
  }

  notifyAuditCompletion(projectName, { isSuccess, status, summary, durationMs, error, scopeLabel } = {}) {
    const isWorkspace = !projectName || projectName === 'workspace';
    const proj = isWorkspace ? '[🛡️ Workspace Guards]' : `[🛡️ ${projectName}]`;
    const label = isWorkspace ? 'Workspace Guards' : `Audit (${scopeLabel || 'Diff'})`;

    let durStr = '';
    if (typeof durationMs === 'number' && durationMs >= 0) {
      const sec = Math.round(durationMs / 1000);
      durStr = sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
    }

    // 1. Toast Notification with 1-click action 'Bericht öffnen'
    let notifEnabled = true;
    if (vscode && vscode.workspace) {
      try {
        const notifCfg = vscode.workspace.getConfiguration('sessionDashboard.notifications');
        notifEnabled = notifCfg.get('enabled', true) && notifCfg.get('audits', true);
      } catch (err) {
        console.error('[AuditManager] Toast config error:', err);
      }
    }

    if (notifEnabled && vscode && vscode.window) {
      try {
        let targetReport = null;
        if (isWorkspace) {
          const guards = this.getWorkspaceGuards();
          targetReport = guards ? guards.reportPath : null;
        } else {
          const rep = this.cachedReports ? this.cachedReports.get(projectName) : null;
          targetReport = rep ? (rep.crReportPath || rep.secReportPath || rep.reportPath) : null;
        }

        const actions = targetReport && fs.existsSync(targetReport) ? ['Bericht öffnen'] : [];
        const handleAction = (promise) => {
          if (promise && typeof promise.then === 'function') {
            promise.then((action) => {
              if (action === 'Bericht öffnen' && targetReport) {
                this.openReport(targetReport);
              }
            });
          }
        };

        const timePart = durStr ? ` (${durStr})` : '';
        if (!isSuccess) {
          const errPart = error || 'Fehlgeschlagen';
          const msg = `❌ ${proj} ${label} fehlgeschlagen: ${errPart}${timePart}`.replace(/\s+/g, ' ').trim();
          handleAction(vscode.window.showErrorMessage(msg, ...actions));
        } else if (status === 'error') {
          const msg = `🚨 ${proj} ${label} abgeschlossen: ${summary || 'Befunde vorhanden'}${timePart}`.replace(/\s+/g, ' ').trim();
          handleAction(vscode.window.showErrorMessage(msg, ...actions));
        } else if (status === 'warning') {
          const msg = `⚠️ ${proj} ${label} abgeschlossen: ${summary || 'Prüfbedarf vorhanden'}${timePart}`.replace(/\s+/g, ' ').trim();
          handleAction(vscode.window.showWarningMessage(msg, ...actions));
        } else {
          const msg = `✅ ${proj} ${label} erfolgreich bestanden (Keine Befunde)${timePart}`.replace(/\s+/g, ' ').trim();
          handleAction(vscode.window.showInformationMessage(msg, ...actions));
        }
      } catch (err) {
        console.error('[AuditManager] Toast notification error:', err);
      }
    }

    // 2. Sound Notification
    const isClean = isSuccess && (status === 'passed' || status === 'success' || !status);
    let soundEnabled = true;
    let soundName = isClean ? 'taskCompleted' : 'taskFailed';
    if (vscode && vscode.workspace) {
      try {
        const soundCfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
        soundEnabled = soundCfg.get('enabled', true) && soundCfg.get('audits.enabled', true);
        if (isClean) {
          soundName = soundCfg.get('audits.sound', 'taskCompleted');
        } else {
          soundName = soundCfg.get('audits.soundFailed', 'taskFailed');
        }
      } catch (err) {
        console.error('[AuditManager] Sound config error:', err);
      }
    }

    if (soundEnabled && this.soundNotifier && typeof this.soundNotifier.playSound === 'function') {
      try {
        const eventType = isClean ? 'taskCompleted' : 'taskFailed';
        this.soundNotifier.playSound(eventType, '', soundName);
      } catch (err) {
        console.error('[AuditManager] Sound notification error:', err);
      }
    }
  }

  processNextInQueue() {
    if (this.runningProjects.size === 0 && this.auditQueue.length > 0) {
      const next = this.auditQueue.shift();
      this.saveQueueState();
      this.notifyChange();
      if (next.projectName === '__workspace_guards__' || next.mode === 'guards') {
        this.runWorkspaceGuards();
      } else {
        this.runAudit(next.projectName, next.mode, next.diff, next.model);
      }
    }
  }

  runWorkspaceGuards() {
    const key = '__workspace_guards__';
    if (this.runningProjects.has(key)) {
      if (vscode) vscode.window.showWarningMessage('Workspace-Guards werden bereits geprüft.');
      return;
    }

    if (this.auditQueue.some((q) => q.projectName === key || q.mode === 'guards')) {
      if (vscode) vscode.window.showWarningMessage('Workspace-Guards befinden sich bereits in der Warteschlange.');
      return;
    }

    // Sequential Queue: If an audit or guard is already running, enqueue guards
    if (this.runningProjects.size > 0) {
      this.auditQueue.push({ projectName: key, mode: 'guards', diff: 'unstaged', model: 'deterministic' });
      this.saveQueueState();
      this.notifyChange();
      if (vscode) {
        vscode.window.showInformationMessage(`Workspace-Guards in Warteschlange eingereiht (Position ${this.auditQueue.length}).`);
      }
      return;
    }

    const scriptPath = path.join(this.getToolsDir(), 'project-audit.py');
    if (!fs.existsSync(scriptPath)) {
      if (vscode) vscode.window.showErrorMessage(`Audit-Skript nicht gefunden: ${scriptPath}`);
      return;
    }

    const args = ['-u', scriptPath, '--mode', 'guards'];
    const startTime = Date.now();

    const logDir = this.getReportsDir();
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'audit-workspace.log');
    const outFd = fs.openSync(logPath, 'a');

    const proc = spawn('python', args, {
      cwd: this.getRoot(),
      detached: true,
      shell: false,
      stdio: ['ignore', outFd, outFd]
    });
    proc.unref();
    fs.closeSync(outFd);

    this.runningProjects.set(key, { mode: 'guards', startTime, process: proc, pid: proc.pid });
    this.addRunningState({ pid: proc.pid, project: key, mode: 'guards', diff: 'unstaged', model: 'deterministic', startTime });
    this.startProcessWatcher(key, proc.pid, startTime);
    this.startAuditProgressNotification(key, { mode: 'guards', diff: 'unstaged', model: 'deterministic', isGuards: true });
    this.notifyChange();

    proc.on('close', (code) => {
      if (this.processWatchers.has(key)) {
        clearInterval(this.processWatchers.get(key));
        this.processWatchers.delete(key);
      }
      if (this.runningProjects.has(key)) {
        const run = this.runningProjects.get(key);
        if (run && run.finishProgress) {
          try { run.finishProgress(); } catch {}
          run.finishProgress = null;
        }
        const durationMs = Date.now() - startTime;
        this.runningProjects.delete(key);
        this.removeRunningState(key);
        this.notifyChange();

        const guards = this.getWorkspaceGuards();
        const isSuccess = (code === 0);
        const status = guards ? guards.status : (isSuccess ? 'passed' : 'error');
        const summary = guards ? guards.summary : (isSuccess ? 'Erfolgreich geprüft' : 'Fehlgeschlagen');
        let errMsg = null;
        if (!isSuccess && fs.existsSync(logPath)) {
          try {
            const logContent = fs.readFileSync(logPath, 'utf8').trim();
            errMsg = logContent.split('\n').slice(-5).join(' ').trim();
          } catch {}
        }

        this.notifyAuditCompletion('workspace', {
          isSuccess,
          status,
          summary,
          durationMs,
          error: isSuccess ? null : (errMsg || `Exit-Code ${code}`)
        });

        this.processNextInQueue();
      }
    });

    proc.on('error', (err) => {
      if (this.processWatchers.has(key)) {
        clearInterval(this.processWatchers.get(key));
        this.processWatchers.delete(key);
      }
      if (this.runningProjects.has(key)) {
        const durationMs = Date.now() - startTime;
        this.runningProjects.delete(key);
        this.removeRunningState(key);
        this.notifyChange();

        this.notifyAuditCompletion('workspace', {
          isSuccess: false,
          durationMs,
          error: `Konnte Guards nicht starten: ${err.message}`
        });

        this.processNextInQueue();
      }
    });
  }

  getAuditOverview() {
    this.syncAuditConfig();
    const projects = this.getProjects();
    const reports = this.getReports();
    const state = this.loadAuditState();
    const overview = [];

    for (const p of projects) {
      const rep = reports.get(p) || { project: p, cr: null, sec: null, perf: null };
      const cr = rep.cr || null;
      const sec = rep.sec || null;
      const perf = rep.perf || null;
      const running = this.runningProjects.get(p) || null;
      const runningMode = running
        ? (running.diff === 'full' ? `${running.mode} (Komplett)` : running.mode)
        : null;

      const isCrRunning = Boolean(running && (running.mode === 'review' || running.mode === 'all'));
      const isSecRunning = Boolean(running && (running.mode === 'security' || running.mode === 'all'));
      const isPerfRunning = Boolean(running && (running.mode === 'perf' || running.mode === 'all'));

      const crQueueIdx = this.auditQueue.findIndex((q) => q.projectName === p && (q.mode === 'review' || q.mode === 'all'));
      const isCrQueued = crQueueIdx !== -1;
      const crQueuePosition = isCrQueued ? crQueueIdx + 1 : null;

      const secQueueIdx = this.auditQueue.findIndex((q) => q.projectName === p && (q.mode === 'security' || q.mode === 'all'));
      const isSecQueued = secQueueIdx !== -1;
      const secQueuePosition = isSecQueued ? secQueueIdx + 1 : null;

      const perfQueueIdx = this.auditQueue.findIndex((q) => q.projectName === p && (q.mode === 'perf' || q.mode === 'all'));
      const isPerfQueued = perfQueueIdx !== -1;
      const perfQueuePosition = isPerfQueued ? perfQueueIdx + 1 : null;

      const isQueued = isCrQueued || isSecQueued || isPerfQueued;
      const qPositions = [crQueuePosition, secQueuePosition, perfQueuePosition].filter(Boolean);
      const queuePosition = qPositions.length > 0 ? Math.min(...qPositions) : null;

      const pState = (state.projects && state.projects[p]) || {};

      // Separate review statuses for Code-Review, Security-Audit & Performance-Review
      let crReviewStatus = 'never';
      if (cr) {
        const isCrReportStale = Boolean(
          (pState.cr_reviewed_time && cr.mtimeMs > (pState.cr_reviewed_time + 5000)) ||
          (!pState.cr_reviewed_time && pState.cr_reviewed_at && cr.mtimeMs > (this.parseGermanDateToMs(pState.cr_reviewed_at) + 60000))
        );
        const isCrCommitChanged = Boolean(
          pState.last_review_commit && pState.cr_reviewed_commit && pState.last_review_commit !== pState.cr_reviewed_commit
        );

        if (pState.cr_status === 'pending') {
          crReviewStatus = 'pending';
        } else if (pState.cr_status === 'reviewed') {
          crReviewStatus = (isCrReportStale || isCrCommitChanged) ? 'pending' : 'reviewed';
        } else if (pState.status === 'reviewed') {
          crReviewStatus = (isCrReportStale || isCrCommitChanged) ? 'pending' : 'reviewed';
        } else {
          crReviewStatus = 'pending';
        }
      }

      let secReviewStatus = 'never';
      if (sec) {
        const isSecReportStale = Boolean(
          (pState.sec_reviewed_time && sec.mtimeMs > (pState.sec_reviewed_time + 5000)) ||
          (!pState.sec_reviewed_time && pState.sec_reviewed_at && sec.mtimeMs > (this.parseGermanDateToMs(pState.sec_reviewed_at) + 60000))
        );
        const isSecCommitChanged = Boolean(
          pState.last_security_commit && pState.sec_reviewed_commit && pState.last_security_commit !== pState.sec_reviewed_commit
        );

        if (pState.sec_status === 'pending') {
          secReviewStatus = 'pending';
        } else if (pState.sec_status === 'reviewed') {
          secReviewStatus = (isSecReportStale || isSecCommitChanged) ? 'pending' : 'reviewed';
        } else if (pState.status === 'reviewed') {
          secReviewStatus = (isSecReportStale || isSecCommitChanged) ? 'pending' : 'reviewed';
        } else {
          secReviewStatus = 'pending';
        }
      }

      let perfReviewStatus = 'never';
      if (perf) {
        const isPerfReportStale = Boolean(
          (pState.perf_reviewed_time && perf.mtimeMs > (pState.perf_reviewed_time + 5000)) ||
          (!pState.perf_reviewed_time && pState.perf_reviewed_at && perf.mtimeMs > (this.parseGermanDateToMs(pState.perf_reviewed_at) + 60000))
        );
        const isPerfCommitChanged = Boolean(
          pState.last_perf_commit && pState.perf_reviewed_commit && pState.last_perf_commit !== pState.perf_reviewed_commit
        );

        if (pState.perf_status === 'pending') {
          perfReviewStatus = 'pending';
        } else if (pState.perf_status === 'reviewed') {
          perfReviewStatus = (isPerfReportStale || isPerfCommitChanged) ? 'pending' : 'reviewed';
        } else if (pState.status === 'reviewed') {
          perfReviewStatus = (isPerfReportStale || isPerfCommitChanged) ? 'pending' : 'reviewed';
        } else {
          perfReviewStatus = 'pending';
        }
      }

      const activeReviewStatuses = [
        cr ? crReviewStatus : null,
        sec ? secReviewStatus : null,
        perf ? perfReviewStatus : null
      ].filter(Boolean);

      let reviewStatus = 'never';
      if (activeReviewStatuses.length > 0) {
        reviewStatus = activeReviewStatuses.every((s) => s === 'reviewed') ? 'reviewed' : 'pending';
      } else if (pState.status) {
        reviewStatus = pState.status;
      }

      const isCumulative = Boolean(pState.is_cumulative || (reviewStatus === 'pending' && (pState.unreviewed_days > 1)));

      // Combined status for row styling, filter chips & sorting
      const presentReports = [cr, sec, perf].filter(Boolean);
      let status = 'never';
      if (presentReports.length > 0) {
        if (presentReports.some((r) => r.status === 'error')) status = 'error';
        else if (presentReports.some((r) => r.status === 'warning')) status = 'warning';
        else status = 'passed';
      }

      // Combined summary
      let summary = 'Noch kein Bericht vorhanden';
      if (presentReports.length > 0) {
        if (presentReports.every((r) => r.status === 'passed')) {
          if (cr && sec && perf) summary = 'Code, Security & Performance bestanden';
          else if (cr && sec) summary = 'Code-Review & Security bestanden';
          else if (perf) summary = `⚡ Perf: ${perf.summary}`;
          else if (sec) summary = `🛡️ Sec: ${sec.summary}`;
          else if (cr) summary = `🔍 CR: ${cr.summary}`;
        } else {
          const parts = [];
          if (sec && sec.status !== 'passed') parts.push(`🛡️ Sec: ${sec.summary}`);
          if (cr && cr.status !== 'passed') parts.push(`🔍 CR: ${cr.summary}`);
          if (perf && perf.status !== 'passed') parts.push(`⚡ Perf: ${perf.summary}`);
          summary = parts.join(' · ') || 'Prüfung abgeschlossen';
        }
      }

      // Most recent scan timestamp
      let lastRun = null;
      if (presentReports.length > 0) {
        const newest = presentReports.reduce((a, b) => (a.mtimeMs >= b.mtimeMs ? a : b));
        lastRun = newest.lastRun;
      }

      overview.push({
        project: p,
        isRunning: Boolean(running),
        isCrRunning,
        isSecRunning,
        isPerfRunning,
        runningMode,
        runningModel: running ? running.model : null,
        isQueued,
        isCrQueued,
        crQueuePosition,
        isSecQueued,
        secQueuePosition,
        isPerfQueued,
        perfQueuePosition,
        queuePosition,
        startTime: running ? running.startTime : null,
        durationMs: running ? Date.now() - running.startTime : null,
        pid: running ? running.pid : null,
        cr,
        sec,
        perf,
        lastRun,
        status,
        summary,
        reportPath: (sec && sec.filePath) || (cr && cr.filePath) || (perf && perf.filePath) || null,
        reviewStatus,
        crReviewStatus,
        secReviewStatus,
        perfReviewStatus,
        crReviewedAt: pState.cr_reviewed_at || (pState.cr_status === 'reviewed' ? pState.last_reviewed_at : null),
        secReviewedAt: pState.sec_reviewed_at || (pState.sec_status === 'reviewed' ? pState.last_reviewed_at : null),
        perfReviewedAt: pState.perf_reviewed_at || (pState.perf_status === 'reviewed' ? pState.last_reviewed_at : null),
        lastReviewedAt: pState.last_reviewed_at || null,
        lastReviewedCommit: pState.last_reviewed_commit ? pState.last_reviewed_commit.slice(0, 7) : null,
        isCumulative,
        unreviewedDays: pState.unreviewed_days || 0,
        dailyActive: Boolean(pState && pState.daily_active),
        dismissals: this.getDismissals(p),
        dismissalsCount: this.getDismissals(p).length
      });
    }

    const dailyActiveCount = overview.filter((p) => p.dailyActive).length;

    return {
      workspaceGuards: this.getWorkspaceGuards(),
      scheduledTask: this.getScheduledTask(),
      availableModels: this.getAvailableModels(),
      defaultModel: this.getDefaultModel(),
      dailyActiveCount,
      projects: overview
    };
  }

  runAudit(projectName, mode = 'all', diff = 'unstaged', model = null) {
    const targetModel = model || this.getDefaultModel();

    // Check if identical audit is already running
    const isRunningSame = Array.from(this.runningProjects.entries()).some(([key, r]) => {
      if (key !== projectName && r.project !== projectName) return false;
      return r.mode === mode || r.mode === 'all' || mode === 'all';
    });
    if (isRunningSame) {
      if (vscode) vscode.window.showWarningMessage(`Audit (${mode}) für ${projectName} läuft bereits.`);
      return;
    }

    // Check if identical audit is already queued
    const isQueuedSame = this.auditQueue.some((q) => {
      if (q.projectName !== projectName) return false;
      return q.mode === mode || q.mode === 'all' || mode === 'all';
    });
    if (isQueuedSame) {
      if (vscode) vscode.window.showWarningMessage(`Audit (${mode}) für ${projectName} befindet sich bereits in der Warteschlange.`);
      return;
    }

    // Sequential Queue: If an audit or guard is already running, enqueue this audit
    if (this.runningProjects.size > 0) {
      this.auditQueue.push({ projectName, mode, diff, model: targetModel });
      this.saveQueueState();
      this.notifyChange();
      if (vscode) {
        vscode.window.showInformationMessage(`Audit (${mode}) für ${projectName} in Warteschlange eingereiht (Position ${this.auditQueue.length}).`);
      }
      return;
    }

    const scriptPath = path.join(this.getToolsDir(), 'project-audit.py');
    if (!fs.existsSync(scriptPath)) {
      const err = `Audit-Skript nicht gefunden: ${scriptPath}`;
      if (vscode) vscode.window.showErrorMessage(err);
      return;
    }

    const args = [
      '-u',
      scriptPath,
      '--project', projectName,
      '--mode', mode,
      '--diff', diff,
      '--model', targetModel
    ];

    const startTime = Date.now();

    const logDir = this.getReportsDir();
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `audit-${projectName}.log`);
    const outFd = fs.openSync(logPath, 'a');

    const proc = spawn('python', args, {
      cwd: this.getRoot(),
      detached: true,
      shell: false,
      stdio: ['ignore', outFd, outFd]
    });
    proc.unref();
    fs.closeSync(outFd);

    this.runningProjects.set(projectName, { mode, diff, model: targetModel, startTime, process: proc, pid: proc.pid });
    this.addRunningState({ pid: proc.pid, project: projectName, mode, diff, model: targetModel, startTime });
    this.startProcessWatcher(projectName, proc.pid, startTime);
    this.startAuditProgressNotification(projectName, { mode, diff, model: targetModel, isGuards: false });
    this.notifyChange();

    proc.on('close', (code) => {
      if (this.processWatchers.has(projectName)) {
        clearInterval(this.processWatchers.get(projectName));
        this.processWatchers.delete(projectName);
      }
      if (this.runningProjects.has(projectName)) {
        const run = this.runningProjects.get(projectName);
        if (run && run.finishProgress) {
          try { run.finishProgress(); } catch {}
          run.finishProgress = null;
        }
        const durationMs = Date.now() - startTime;
        this.runningProjects.delete(projectName);
        this.removeRunningState(projectName);

        this.getReports(true);
        const rep = this.cachedReports ? this.cachedReports.get(projectName) : null;

        if (code === 0 && projectName && projectName !== 'workspace' && projectName !== '__workspace_guards__') {
          try {
            const auditState = this.loadAuditState();
            if (!auditState.projects[projectName]) {
              auditState.projects[projectName] = {};
            }
            const pSt = auditState.projects[projectName];
            if (mode === 'review' || mode === 'cr' || mode === 'all') {
              pSt.cr_status = (rep && rep.cr && rep.cr.status === 'passed') ? 'reviewed' : 'pending';
            }
            if (mode === 'security' || mode === 'sec' || mode === 'all') {
              pSt.sec_status = (rep && rep.sec && rep.sec.status === 'passed') ? 'reviewed' : 'pending';
            }
            if (mode === 'perf' || mode === 'performance' || mode === 'all') {
              pSt.perf_status = (rep && rep.perf && rep.perf.status === 'passed') ? 'reviewed' : 'pending';
            }
            const anyPending = [pSt.cr_status, pSt.sec_status, pSt.perf_status].includes('pending');
            pSt.status = anyPending ? 'pending' : 'reviewed';
            this.saveAuditState(auditState);
          } catch (stErr) {
            console.warn('[AuditManager] Error updating audit-state after runAudit:', stErr);
          }
        }

        this.notifyChange();

        const isSuccess = (code === 0);
        const status = rep ? rep.status : (isSuccess ? 'passed' : 'error');
        const summary = rep ? rep.summary : '';
        let errMsg = null;
        if (!isSuccess && fs.existsSync(logPath)) {
          try {
            const logContent = fs.readFileSync(logPath, 'utf8').trim();
            errMsg = logContent.split('\n').slice(-5).join(' ').trim();
          } catch {}
        }
        const scopeLabel = diff === 'full' ? 'Komplett' : 'Diff';

        this.notifyAuditCompletion(projectName, {
          isSuccess,
          status,
          summary,
          durationMs,
          error: isSuccess ? null : (errMsg || `Beendet mit Code ${code}`).slice(0, 150),
          scopeLabel
        });

        this.processNextInQueue();
      }
    });

    proc.on('error', (err) => {
      if (this.processWatchers.has(projectName)) {
        clearInterval(this.processWatchers.get(projectName));
        this.processWatchers.delete(projectName);
      }
      if (this.runningProjects.has(projectName)) {
        const durationMs = Date.now() - startTime;
        this.runningProjects.delete(projectName);
        this.removeRunningState(projectName);
        this.notifyChange();
        console.error(`[AuditManager] Spawn error for ${projectName}:`, err);

        this.notifyAuditCompletion(projectName, {
          isSuccess: false,
          durationMs,
          error: `Konnte Python für ${projectName} nicht starten: ${err.message}`,
          scopeLabel: diff === 'full' ? 'Komplett' : 'Diff'
        });

        this.processNextInQueue();
      }
    });
  }

  async deleteReport(projectName, reportPath) {
    let targetPaths = [];
    if (reportPath) {
      targetPaths = [reportPath];
    } else if (projectName) {
      const reports = this.getReports(true);
      const rep = reports.get(projectName);
      if (rep) {
        if (rep.cr && rep.cr.filePath) targetPaths.push(rep.cr.filePath);
        if (rep.sec && rep.sec.filePath) targetPaths.push(rep.sec.filePath);
        if (rep.perf && rep.perf.filePath) targetPaths.push(rep.perf.filePath);
      }
    }

    targetPaths = targetPaths.filter((p) => p && fs.existsSync(p));
    if (targetPaths.length === 0) {
      if (vscode) vscode.window.showWarningMessage('Berichtsdatei existiert nicht.');
      return false;
    }

    if (vscode) {
      const isWorkspace = !projectName || projectName === 'workspace';
      const label = isWorkspace ? 'der Workspace Guards' : `für „${projectName}“`;
      const confirm = await vscode.window.showWarningMessage(
        `Möchtest du den Audit-Bericht ${label} wirklich von der Festplatte löschen?`,
        { modal: true },
        'Löschen'
      );
      if (confirm !== 'Löschen') {
        return false;
      }
    }

    try {
      for (const p of targetPaths) {
        fs.unlinkSync(p);
      }

      // Clean up project state in audit-state.json if this was the project's report
      if (projectName && projectName !== 'workspace') {
        const state = this.loadAuditState();
        if (state.projects && state.projects[projectName]) {
          const remainingReports = this.getReports(true).get(projectName);
          const hasRemainingCr = Boolean(remainingReports && remainingReports.cr && remainingReports.cr.filePath && !targetPaths.includes(remainingReports.cr.filePath));
          const hasRemainingSec = Boolean(remainingReports && remainingReports.sec && remainingReports.sec.filePath && !targetPaths.includes(remainingReports.sec.filePath));
          const hasRemainingPerf = Boolean(remainingReports && remainingReports.perf && remainingReports.perf.filePath && !targetPaths.includes(remainingReports.perf.filePath));
          if (!hasRemainingCr && !hasRemainingSec && !hasRemainingPerf) {
            delete state.projects[projectName];
          } else {
            const pState = state.projects[projectName];
            if (!hasRemainingCr) {
              delete pState.cr_status;
              delete pState.cr_reviewed_at;
              delete pState.cr_reviewed_commit;
            }
            if (!hasRemainingSec) {
              delete pState.sec_status;
              delete pState.sec_reviewed_at;
              delete pState.sec_reviewed_commit;
            }
            if (!hasRemainingPerf) {
              delete pState.perf_status;
              delete pState.perf_reviewed_at;
              delete pState.perf_reviewed_commit;
            }
          }
          this.saveAuditState(state);
        }
      }

      this.cachedReports = null;
      this.getReports(true);
      this.notifyChange();

      if (vscode) {
        vscode.window.showInformationMessage('Audit-Bericht erfolgreich gelöscht.');
      }
      return true;
    } catch (err) {
      if (vscode) {
        vscode.window.showErrorMessage(`Fehler beim Löschen des Berichts: ${err.message}`);
      }
      return false;
    }
  }

  async openReport(reportPath) {
    if (!reportPath || !fs.existsSync(reportPath)) {
      if (vscode) vscode.window.showWarningMessage('Berichtsdatei existiert nicht.');
      return;
    }

    if (vscode) {
      const uri = vscode.Uri.file(reportPath);
      try {
        await vscode.commands.executeCommand('markdown.showPreview', uri);
      } catch {
        await vscode.window.showTextDocument(uri);
      }
    }
  }

  buildPrompt(project, reportPathOrPaths) {
    const isWorkspace = !project || project === 'workspace';
    const projectRef = isWorkspace ? 'Workspace Guards' : `das Projekt ${project}`;
    const projectRule = isWorkspace
      ? ''
      : ` sowie die jeweiligen Projekt-Konventionen (${project}/.agents/project-context.md)`;

    const paths = Array.isArray(reportPathOrPaths) ? reportPathOrPaths : [reportPathOrPaths].filter(Boolean);
    const formattedPaths = paths.map((p) => String(p).replace(/\\/g, '/'));
    const hasPerfReport = formattedPaths.some((p) => /_(?:perf|performance)\.md$/i.test(p));

    let fileLines = '';
    if (formattedPaths.length === 1) {
      fileLines = `Berichtsdatei: ${formattedPaths[0]}`;
    } else if (formattedPaths.length > 1) {
      fileLines = `Berichtsdateien:\n` + formattedPaths.map((p) => `- ${p}`).join('\n');
    }

    let dismissalsNote = '';
    const dismissals = (!isWorkspace && project) ? this.getDismissals(project) : [];
    if (dismissals.length > 0) {
      dismissalsNote = `\n\nHinweis: Folgende ${dismissals.length} Befunde wurden im Dismissal Memory bereits als False Positive / gewollt markiert und müssen NICHT bearbeitet werden:\n` +
        dismissals.map((d) => `- [${String(d.type || 'audit').toUpperCase()}] ${d.title} (Ort: ${d.file || '-'}${d.line ? ':' + d.line : ''}): ${d.reason}`).join('\n');
    }

    const perfStep = hasPerfReport
      ? `\n5. Wissensbasis-Evolution: Falls im Performance-Bericht unter „💡 Wissensbasis-Kandidat“ ein neues, wiederkehrendes Performance-Muster genannt wird, schlage nach der Code-Behebung eine kompakte Ergänzung für .agents/claude/rules/cfml-performance.md bzw. .agents/claude/rules/frontend-performance.md vor.`
      : '';

    return `Bitte analysiere die Ergebnisse des lokalen KI-Audits für ${projectRef}:
${fileLines}
${dismissalsNote}
Aufgabenstellung:
1. Lies den Bericht und prüfe alle gemeldeten Befunde (Schweregrade: Kritisch / Hoch / Mittel).
2. Verifiziere im Quellcode, ob es sich um echte Schwachstellen handelt (False-Positive-Ausschluss).
3. Erstelle bei Bedarf einen Implementierungsplan unter .agents/plans/ und setze die Korrekturen defensiv und schrittweise um.
4. Halte dich dabei strikt an das globale Regelwerk (.agents/global-core.md)${projectRule}.${perfStep}`;
  }

  async dispatchAuditPrompt(provider, project, reportPath) {
    let targetPaths = [];
    if (reportPath) {
      targetPaths = [reportPath];
    } else if (project && project !== 'workspace') {
      const reports = this.getReports();
      const rep = reports.get(project);
      const crPath = rep && rep.cr && fs.existsSync(rep.cr.filePath) ? rep.cr.filePath : null;
      const secPath = rep && rep.sec && fs.existsSync(rep.sec.filePath) ? rep.sec.filePath : null;
      const perfPath = rep && rep.perf && fs.existsSync(rep.perf.filePath) ? rep.perf.filePath : null;
      const allAvail = [secPath, crPath, perfPath].filter(Boolean);

      if (allAvail.length > 1 && vscode) {
        const choiceItems = [
          { label: '$(package) Alle Berichte zusammen übergeben', choice: 'all', detail: 'Code-Review, Security-Audit und Performance-Review gemeinsam analysieren (Standard)' }
        ];
        if (secPath) {
          choiceItems.push({ label: '$(shield) Security-Audit übergeben', choice: 'security', detail: `${rep.sec.summary} (${rep.sec.lastRun || ''})` });
        }
        if (crPath) {
          choiceItems.push({ label: '$(search) Code-Review übergeben', choice: 'review', detail: `${rep.cr.summary} (${rep.cr.lastRun || ''})` });
        }
        if (perfPath) {
          choiceItems.push({ label: '$(zap) Performance-Review übergeben', choice: 'perf', detail: `${rep.perf.summary} (${rep.perf.lastRun || ''})` });
        }

        const pickedChoice = await vscode.window.showQuickPick(choiceItems, {
          placeHolder: `Welche Berichte sollen an die KI für „${project}“ übergeben werden?`
        });

        if (!pickedChoice) return;
        if (pickedChoice.choice === 'all') {
          targetPaths = allAvail;
        } else if (pickedChoice.choice === 'security') {
          targetPaths = [secPath];
        } else if (pickedChoice.choice === 'perf') {
          targetPaths = [perfPath];
        } else {
          targetPaths = [crPath];
        }
      } else {
        targetPaths = allAvail;
      }
    }

    targetPaths = targetPaths.filter((p) => p && fs.existsSync(p));
    if (targetPaths.length === 0) {
      if (vscode) vscode.window.showWarningMessage('Keine Berichtsdatei vorhanden.');
      return;
    }

    const prompt = this.buildPrompt(project, targetPaths);

    if (!provider && vscode) {
      const items = [
        { label: '$(dashboard-antigravity) Google Antigravity', provider: 'antigravity', detail: 'Neuen Chat öffnen und Prompt direkt einfügen' },
        { label: '$(dashboard-claude) Claude Code', provider: 'claude', detail: 'Session öffnen und Initial Prompt übergeben' },
        { label: '$(copilot) GitHub Copilot', provider: 'copilot', detail: 'Chat öffnen und Prompt direkt übergeben' },
        { label: '$(dashboard-codex) OpenAI Codex', provider: 'codex', detail: 'Codex-Panel öffnen (Prompt in Zwischenablage)' },
        { label: '$(robot) Cline', provider: 'cline', detail: 'Neuen Task öffnen (Prompt in Zwischenablage)' },
        { label: '$(clippy) Nur Prompt in Zwischenablage kopieren', provider: 'clipboard', detail: 'Formatierten Übergabe-Prompt in die Zwischenablage legen' }
      ];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Audit-Report für ${project || 'Workspace'} an KI übergeben...`
      });

      if (!picked) return;
      provider = picked.provider;
    }

    // Auto-quittieren des Audits bei Übergabe an KI
    if (project && project !== 'workspace') {
      try {
        let reviewType = 'all';
        if (reportPath && typeof reportPath === 'string') {
          if (reportPath.includes('_review.md') || reportPath.includes('_cr.md')) reviewType = 'cr';
          else if (reportPath.includes('_security.md') || reportPath.includes('_sec.md')) reviewType = 'sec';
          else if (reportPath.includes('_perf.md') || reportPath.includes('_performance.md')) reviewType = 'perf';
        }
        this.markProjectReviewed(project, reviewType);
      } catch (markErr) {
        console.warn('[AuditManager] Auto-quittieren fehlgeschlagen:', markErr);
      }
    }

    if (!vscode) {
      return { provider, prompt };
    }

    // Always copy to clipboard as primary or fallback guarantee
    try {
      if (vscode.env && vscode.env.clipboard) {
        await vscode.env.clipboard.writeText(prompt);
      }
    } catch (clipErr) {
      console.warn('[AuditManager] Clipboard copy failed:', clipErr);
    }

    if (provider === 'clipboard') {
      vscode.window.showInformationMessage('Audit-Prompt in die Zwischenablage kopiert.');
      return;
    }

    if (provider === 'antigravity') {
      try {
        await vscode.commands.executeCommand('antigravity.startNewConversation');
        await vscode.commands.executeCommand('antigravity.addContext', prompt);
        vscode.window.showInformationMessage('Audit-Prompt an Google Antigravity übergeben.');
      } catch (err) {
        try {
          await vscode.commands.executeCommand('antigravity.panel.focus');
        } catch {}
        vscode.window.showInformationMessage('Google Antigravity fokussiert – Prompt liegt in der Zwischenablage (Strg+V).');
      }
      return;
    }

    if (provider === 'claude') {
      try {
        await vscode.commands.executeCommand(
          'claude-vscode.editor.open',
          undefined,
          prompt,
          undefined,
          undefined,
          undefined,
          { programmatic: 'honor-preferred-location' }
        );
        vscode.window.showInformationMessage('Audit-Prompt an Claude Code übergeben.');
      } catch (err) {
        try {
          await vscode.commands.executeCommand('claude-vscode.newConversation');
        } catch {}
        vscode.window.showInformationMessage('Claude Code geöffnet – Prompt liegt in der Zwischenablage (Strg+V).');
      }
      return;
    }

    if (provider === 'copilot') {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
        vscode.window.showInformationMessage('Audit-Prompt an GitHub Copilot übergeben.');
      } catch (err) {
        vscode.window.showErrorMessage(`GitHub Copilot konnte nicht geöffnet werden: ${err.message}`);
      }
      return;
    }

    if (provider === 'codex') {
      try {
        await vscode.commands.executeCommand('chatgpt.newCodexPanel');
        vscode.window.showInformationMessage('Codex-Panel geöffnet – Prompt liegt in der Zwischenablage (Strg+V).');
      } catch {
        try {
          await vscode.commands.executeCommand('chatgpt.openSidebar');
        } catch {}
        vscode.window.showInformationMessage('Codex geöffnet – Prompt liegt in der Zwischenablage (Strg+V).');
      }
      return;
    }

    if (provider === 'cline') {
      try {
        await vscode.commands.executeCommand('cline.plusButtonClicked');
        vscode.window.showInformationMessage('Cline neuer Task geöffnet – Prompt liegt in der Zwischenablage (Strg+V).');
      } catch (err) {
        vscode.window.showErrorMessage(`Cline konnte nicht geöffnet werden: ${err.message}`);
      }
      return;
    }
  }

  dispose() {
    for (const [, timer] of this.processWatchers) {
      clearInterval(timer);
    }
    this.processWatchers.clear();
    // Running audit processes are detached background jobs.
    // They must NOT be killed on window reload / extension deactivation.
    // Explicit cancellation is handled by cancelAudit().
    this.runningProjects.clear();
    this.auditQueue = [];
    this.changeListeners.clear();
  }
}

module.exports = { AuditManager };

