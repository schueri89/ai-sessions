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
    this.soundNotifier = options.soundNotifier || null;
    this.toastNotifier = options.toastNotifier || null;
    this.runningProjects = new Map(); // projectName -> { mode, startTime, process, pid, isRestored }
    this.processWatchers = new Map(); // projectName -> setInterval timer
    this.auditQueue = []; // [{ projectName, mode, diff, model }]
    this.changeListeners = new Set();
    this.cachedReports = null;
    this.lastScanTime = 0;
    this.cachedModels = null;
    this.lastModelScanTime = 0;

    // Reconcile running processes from disk or OS
    this.reconcileRunningProcesses();
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
    return 'gemma4:26b';
  }

  getAvailableModels() {
    const now = Date.now();
    if (this.cachedModels && (now - this.lastModelScanTime < 30000)) {
      return this.cachedModels;
    }

    let models = ['gemma4:26b', 'gemma4:e4b'];
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
    return typeof getDefaultRoot === 'function' ? getDefaultRoot() : 'c:\\lucee\\tomcat\\webapps\\ROOT';
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
        if (parsed && Array.isArray(parsed.processes)) {
          return parsed;
        }
      } catch (err) {
        console.warn('[AuditManager] Error reading audit-running.json:', err);
      }
    }
    return { processes: [] };
  }

  saveRunningState(state) {
    try {
      const reportsDir = this.getReportsDir();
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      const file = this.getRunningStateFilePath();
      if (!state.processes || state.processes.length === 0) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
        return;
      }
      const tmpFile = `${file}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
      fs.renameSync(tmpFile, file);
    } catch (err) {
      console.warn('[AuditManager] Error saving audit-running.json:', err);
    }
  }

  addRunningState(entry) {
    const state = this.loadRunningState();
    state.processes = state.processes.filter((p) => p.project !== entry.project);
    state.processes.push(entry);
    this.saveRunningState(state);
  }

  removeRunningState(project) {
    const state = this.loadRunningState();
    state.processes = state.processes.filter((p) => p.project !== project);
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
        this.runningProjects.delete(project);
        this.removeRunningState(project);
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
    }, 2000);

    this.processWatchers.set(project, timer);
  }

  cancelAudit(projectName) {
    const key = (projectName === 'workspace' || projectName === '__workspace_guards__') ? '__workspace_guards__' : projectName;

    // 1. Check queue
    const queueIdx = this.auditQueue.findIndex((q) => q.projectName === key);
    if (queueIdx !== -1) {
      this.auditQueue.splice(queueIdx, 1);
      this.notifyChange();
      if (vscode) {
        vscode.window.showInformationMessage(`Audit für ${key} aus der Warteschlange entfernt.`);
      }
      return true;
    }

    // 2. Check running
    const run = this.runningProjects.get(key);
    if (!run) return false;

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

  markProjectReviewed(projectName) {
    const state = this.loadAuditState();
    const root = this.getRoot();
    const targets = (!projectName || projectName === 'all') ? this.getProjects() : [projectName];
    const nowStr = this.formatGermanDate(Date.now());

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
      state.projects[proj].status = 'reviewed';
      state.projects[proj].last_reviewed_commit = headSha;
      state.projects[proj].last_reviewed_at = nowStr;
      state.projects[proj].is_cumulative = false;
      state.projects[proj].unreviewed_days = 0;
    }

    this.saveAuditState(state);
    this.notifyChange();

    if (vscode) {
      const label = (!projectName || projectName === 'all') ? 'Alle Projekte' : `Projekt „${projectName}“`;
      vscode.window.showInformationMessage(`${label} als geprüft quittiert.`);
    }
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
      // Matches YYYY-MM-DD_<project>_review.md (or _cr.md) and YYYY-MM-DD_<project>_security.md (or _sec.md)
      const crPattern = /^(\d{4}-\d{2}-\d{2})_(.+)_(?:review|cr)\.md$/i;
      const secPattern = /^(\d{4}-\d{2}-\d{2})_(.+)_(?:security|sec)\.md$/i;

      for (const f of files) {
        let m = f.match(crPattern);
        let reportType = '';
        if (m) {
          reportType = 'cr';
        } else {
          m = f.match(secPattern);
          if (m) {
            reportType = 'sec';
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
          reportsByProject.set(project, { project, cr: null, sec: null });
        }
        const projRep = reportsByProject.get(project);
        const existing = projRep[reportType];

        if (!existing || stat.mtimeMs > existing.mtimeMs) {
          const content = fs.readFileSync(filePath, 'utf8');
          const status = this.parseReportStatus(content, stat.mtimeMs);

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

  parseReportStatus(content, mtimeMs) {
    let mode = 'all';
    let model = 'gemma4:26b';
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

    // Exclude prompt template headlines and "(Keine Befunde)"
    const cleanContent = bodyContent
      .replace(/KRITISCH\s*\(ERROR\)\s*\/\s*WARNUNG\s*\(WARN\)\s*\/\s*HINWEIS\s*\(INFO\)/gi, '')
      .replace(/####\s*KRITISCH[^\n]*\r?\n\s*\(Keine Befunde\)/gi, '')
      .replace(/Schweregrade?:\s*Kritisch\s*\/\s*Hoch\s*\/\s*Mittel/gi, '');

    const hasOllamaError = /ERROR:\s*(?:Request|Connection) to Ollama failed/i.test(cleanContent);
    const guardsFailed = /## ❌ 1\. Guards & Tests/i.test(cleanContent);
    const hasCritical = /\b(?:CRITICAL|KRITISCH)\b/i.test(cleanContent);
    const hasHigh = /\b(?:HIGH|HOCH)\b/i.test(cleanContent);
    const hasWarn = /(?:\b(?:WARN|WARNUNG|CHANGES_REQUESTED)\b|(?:^|\W)(?:ÄNDERUNGEN|AENDERUNGEN)[ _-]ERFORDERLICH(?:\W|$))/i.test(cleanContent);

    if (hasOllamaError) {
      status = 'error';
      summary = /timed out/i.test(bodyContent) ? 'Ollama Timeout (Zeitüberschreitung)' : 'Ollama-Fehler';
    } else if (hasCritical || guardsFailed) {
      status = 'error';
      summary = guardsFailed ? 'Guards fehlgeschlagen' : 'Kritische Sicherheitsfunde';
    } else if (hasHigh || hasWarn) {
      status = 'warning';
      summary = hasHigh ? 'Hohe Risiken gefunden' : 'Prüfbedarf / Warnungen';
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
    return {
      status,
      summary,
      lastRun,
      filePath,
      isRunning: Boolean(running),
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

  getScheduledTask() {
    try {
      const buf = execSync('schtasks.exe /Query /TN "DevBox-Nightly-Audit" /FO CSV /NH', {
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000
      });
      const out = this.decodeCliBuffer(buf).trim();
      const parts = this.parseCsvLine(out);
      if (parts.length >= 3) {
        const nextRun = parts[1] ? String(parts[1]).replace(/(\b\d{1,2}:\d{2}):\d{2}\b/g, '$1') : null;
        return {
          isRegistered: true,
          taskName: 'DevBox-Nightly-Audit',
          nextRun,
          state: this.fixUmlauts(parts[2] || 'Bereit'),
          schedule: 'Täglich 04:30 Uhr'
        };
      }
    } catch {
      // not registered or query failed
    }

    return {
      isRegistered: false,
      taskName: 'DevBox-Nightly-Audit',
      nextRun: null,
      state: 'Nicht registriert',
      schedule: 'Täglich 04:30 Uhr'
    };
  }

  registerScheduledTask() {
    const scriptPath = path.join(this.getToolsDir(), 'setup-task-scheduler.ps1');
    if (!fs.existsSync(scriptPath)) {
      if (vscode) vscode.window.showErrorMessage(`Setup-Skript nicht gefunden: ${scriptPath}`);
      return;
    }
    try {
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
        cwd: this.getRoot(),
        encoding: 'utf8',
        timeout: 10000
      });
      if (vscode) vscode.window.showInformationMessage('Task "DevBox-Nightly-Audit" erfolgreich registriert (täglich 04:30 Uhr).');
      this.notifyChange();
    } catch (err) {
      if (vscode) vscode.window.showErrorMessage(`Fehler bei Task-Registrierung: ${err.message}`);
    }
  }

  notifyAuditCompletion(projectName, { isSuccess, status, summary, durationMs, error, scopeLabel } = {}) {
    const isWorkspace = !projectName || projectName === 'workspace';
    const proj = isWorkspace ? '[Workspace Guards]' : `[${projectName}]`;
    const label = isWorkspace ? 'Workspace Guards' : `Audit (${scopeLabel || 'Diff'})`;

    let durStr = '';
    if (typeof durationMs === 'number' && durationMs >= 0) {
      const sec = Math.round(durationMs / 1000);
      durStr = sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
    }

    // 1. Toast Notification
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
        const timePart = durStr ? ` (${durStr})` : '';
        if (!isSuccess) {
          const errPart = error || 'Fehlgeschlagen';
          const msg = `❌ ${proj} ${label} fehlgeschlagen: ${errPart}${timePart}`.replace(/\s+/g, ' ').trim();
          vscode.window.showErrorMessage(msg);
        } else if (status === 'error') {
          const msg = `🚨 ${proj} ${label} abgeschlossen: ${summary || 'Befunde vorhanden'}${timePart}`.replace(/\s+/g, ' ').trim();
          vscode.window.showErrorMessage(msg);
        } else if (status === 'warning') {
          const msg = `⚠️ ${proj} ${label} abgeschlossen: ${summary || 'Prüfbedarf vorhanden'}${timePart}`.replace(/\s+/g, ' ').trim();
          vscode.window.showWarningMessage(msg);
        } else {
          const msg = `✅ ${proj} ${label} erfolgreich bestanden (Keine Befunde)${timePart}`.replace(/\s+/g, ' ').trim();
          vscode.window.showInformationMessage(msg);
        }
      } catch (err) {
        console.error('[AuditManager] Toast notification error:', err);
      }
    }

    // 2. Sound Notification
    let soundEnabled = true;
    if (vscode && vscode.workspace) {
      try {
        const soundCfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
        soundEnabled = soundCfg.get('enabled', true) && soundCfg.get('audits.enabled', true);
      } catch (err) {
        console.error('[AuditManager] Sound config error:', err);
      }
    }

    if (soundEnabled && this.soundNotifier && typeof this.soundNotifier.playSound === 'function') {
      try {
        this.soundNotifier.playSound('taskCompleted');
      } catch (err) {
        console.error('[AuditManager] Sound notification error:', err);
      }
    }
  }

  processNextInQueue() {
    if (this.runningProjects.size === 0 && this.auditQueue.length > 0) {
      const next = this.auditQueue.shift();
      this.notifyChange();
      this.runAudit(next.projectName, next.mode, next.diff, next.model);
    }
  }

  runWorkspaceGuards() {
    const key = '__workspace_guards__';
    if (this.runningProjects.has(key)) {
      if (vscode) vscode.window.showWarningMessage('Workspace-Guards werden bereits geprüft.');
      return;
    }

    const scriptPath = path.join(this.getToolsDir(), 'project-audit.py');
    if (!fs.existsSync(scriptPath)) {
      if (vscode) vscode.window.showErrorMessage(`Audit-Skript nicht gefunden: ${scriptPath}`);
      return;
    }

    const args = [scriptPath, '--mode', 'guards'];
    const startTime = Date.now();
    const proc = spawn('python', args, {
      cwd: this.getRoot(),
      shell: false
    });

    this.runningProjects.set(key, { mode: 'guards', startTime, process: proc, pid: proc.pid });
    this.addRunningState({ pid: proc.pid, project: key, mode: 'guards', diff: 'unstaged', model: 'deterministic', startTime });
    this.notifyChange();

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      this.runningProjects.delete(key);
      this.removeRunningState(key);
      if (this.processWatchers.has(key)) {
        clearInterval(this.processWatchers.get(key));
        this.processWatchers.delete(key);
      }
      this.notifyChange();

      const guards = this.getWorkspaceGuards();
      const isSuccess = (code === 0);
      const status = guards ? guards.status : (isSuccess ? 'passed' : 'error');
      const summary = guards ? guards.summary : (isSuccess ? 'Erfolgreich geprüft' : 'Fehlgeschlagen');

      this.notifyAuditCompletion('workspace', {
        isSuccess,
        status,
        summary,
        durationMs,
        error: isSuccess ? null : (stderr || stdout || `Exit-Code ${code}`)
      });

      this.processNextInQueue();
    });

    proc.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      this.runningProjects.delete(key);
      this.removeRunningState(key);
      if (this.processWatchers.has(key)) {
        clearInterval(this.processWatchers.get(key));
        this.processWatchers.delete(key);
      }
      this.notifyChange();

      this.notifyAuditCompletion('workspace', {
        isSuccess: false,
        durationMs,
        error: `Konnte Guards nicht starten: ${err.message}`
      });

      this.processNextInQueue();
    });
  }

  getAuditOverview() {
    const projects = this.getProjects();
    const reports = this.getReports();
    const state = this.loadAuditState();
    const overview = [];

    for (const p of projects) {
      const rep = reports.get(p) || { project: p, cr: null, sec: null };
      const cr = rep.cr || null;
      const sec = rep.sec || null;
      const running = this.runningProjects.get(p) || null;
      const runningMode = running
        ? (running.diff === 'full' ? `${running.mode} (Komplett)` : running.mode)
        : null;

      const queueIdx = this.auditQueue.findIndex((q) => q.projectName === p);
      const isQueued = queueIdx !== -1;
      const queuePosition = isQueued ? queueIdx + 1 : null;

      const pState = (state.projects && state.projects[p]) || {};
      const hasAnyReport = Boolean(cr || sec);
      const reviewStatus = pState.status || (hasAnyReport ? 'pending' : 'never');
      const isCumulative = Boolean(pState.is_cumulative || (reviewStatus === 'pending' && (pState.unreviewed_days > 1)));

      // Combined status for row styling, filter chips & sorting
      let status = 'never';
      if (cr && sec) {
        if (cr.status === 'error' || sec.status === 'error') status = 'error';
        else if (cr.status === 'warning' || sec.status === 'warning') status = 'warning';
        else if (cr.status === 'passed' && sec.status === 'passed') status = 'passed';
        else status = 'passed';
      } else if (cr) {
        status = cr.status;
      } else if (sec) {
        status = sec.status;
      }

      // Combined summary
      let summary = 'Noch kein Bericht vorhanden';
      if (cr && sec) {
        if (cr.status === 'passed' && sec.status === 'passed') {
          summary = 'Code-Review & Security bestanden';
        } else if (sec.status === 'error' || sec.status === 'warning') {
          summary = `🛡️ Sec: ${sec.summary}` + (cr.status !== 'passed' ? ` · 🔍 CR: ${cr.summary}` : '');
        } else {
          summary = `🔍 CR: ${cr.summary}`;
        }
      } else if (sec) {
        summary = `🛡️ Sec: ${sec.summary}`;
      } else if (cr) {
        summary = `🔍 CR: ${cr.summary}`;
      }

      // Most recent scan timestamp
      let lastRun = null;
      if (cr && sec) {
        lastRun = (cr.mtimeMs >= sec.mtimeMs) ? cr.lastRun : sec.lastRun;
      } else if (cr) {
        lastRun = cr.lastRun;
      } else if (sec) {
        lastRun = sec.lastRun;
      }

      overview.push({
        project: p,
        isRunning: Boolean(running),
        runningMode,
        runningModel: running ? running.model : null,
        isQueued,
        queuePosition,
        startTime: running ? running.startTime : null,
        durationMs: running ? Date.now() - running.startTime : null,
        pid: running ? running.pid : null,
        cr,
        sec,
        lastRun,
        status,
        summary,
        reportPath: (sec && sec.filePath) || (cr && cr.filePath) || null,
        reviewStatus,
        lastReviewedAt: pState.last_reviewed_at || null,
        lastReviewedCommit: pState.last_reviewed_commit ? pState.last_reviewed_commit.slice(0, 7) : null,
        isCumulative,
        unreviewedDays: pState.unreviewed_days || 0
      });
    }

    return {
      workspaceGuards: this.getWorkspaceGuards(),
      scheduledTask: this.getScheduledTask(),
      availableModels: this.getAvailableModels(),
      defaultModel: this.getDefaultModel(),
      projects: overview
    };
  }

  runAudit(projectName, mode = 'all', diff = 'unstaged', model = null) {
    const targetModel = model || this.getDefaultModel();

    if (this.runningProjects.has(projectName)) {
      if (vscode) vscode.window.showWarningMessage(`Audit für ${projectName} läuft bereits.`);
      return;
    }

    if (this.auditQueue.some((q) => q.projectName === projectName)) {
      if (vscode) vscode.window.showWarningMessage(`Audit für ${projectName} befindet sich bereits in der Warteschlange.`);
      return;
    }

    // Sequential Queue: If an audit or guard is already running, enqueue this audit
    if (this.runningProjects.size > 0) {
      this.auditQueue.push({ projectName, mode, diff, model: targetModel });
      this.notifyChange();
      if (vscode) {
        vscode.window.showInformationMessage(`Audit für ${projectName} in Warteschlange eingereiht (Position ${this.auditQueue.length}).`);
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
      scriptPath,
      '--project', projectName,
      '--mode', mode,
      '--diff', diff,
      '--model', targetModel
    ];

    const startTime = Date.now();
    const proc = spawn('python', args, {
      cwd: this.getRoot(),
      shell: false
    });

    this.runningProjects.set(projectName, { mode, diff, model: targetModel, startTime, process: proc, pid: proc.pid });
    this.addRunningState({ pid: proc.pid, project: projectName, mode, diff, model: targetModel, startTime });
    this.notifyChange();

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      this.runningProjects.delete(projectName);
      this.removeRunningState(projectName);
      if (this.processWatchers.has(projectName)) {
        clearInterval(this.processWatchers.get(projectName));
        this.processWatchers.delete(projectName);
      }
      this.getReports(true);
      this.notifyChange();

      const rep = this.cachedReports ? this.cachedReports.get(projectName) : null;
      const isSuccess = (code === 0);
      const status = rep ? rep.status : (isSuccess ? 'passed' : 'error');
      const summary = rep ? rep.summary : '';
      const errMsg = stderr || stdout || (isSuccess ? null : `Beendet mit Code ${code}`);
      const scopeLabel = diff === 'full' ? 'Komplett' : 'Diff';

      this.notifyAuditCompletion(projectName, {
        isSuccess,
        status,
        summary,
        durationMs,
        error: isSuccess ? null : errMsg.slice(0, 150),
        scopeLabel
      });

      this.processNextInQueue();
    });

    proc.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      this.runningProjects.delete(projectName);
      this.removeRunningState(projectName);
      if (this.processWatchers.has(projectName)) {
        clearInterval(this.processWatchers.get(projectName));
        this.processWatchers.delete(projectName);
      }
      this.notifyChange();
      console.error(`[AuditManager] Spawn error for ${projectName}:`, err);

      this.notifyAuditCompletion(projectName, {
        isSuccess: false,
        durationMs,
        error: `Konnte Python für ${projectName} nicht starten: ${err.message}`,
        scopeLabel: diff === 'full' ? 'Komplett' : 'Diff'
      });

      this.processNextInQueue();
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
          delete state.projects[projectName];
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

    let fileLines = '';
    if (formattedPaths.length === 1) {
      fileLines = `Berichtsdatei: ${formattedPaths[0]}`;
    } else if (formattedPaths.length > 1) {
      fileLines = `Berichtsdateien:\n` + formattedPaths.map((p) => `- ${p}`).join('\n');
    }

    return `Bitte analysiere die Ergebnisse des lokalen KI-Audits für ${projectRef}:
${fileLines}

Aufgabenstellung:
1. Lies den Bericht und prüfe alle gemeldeten Befunde (Schweregrade: Kritisch / Hoch / Mittel).
2. Verifiziere im Quellcode, ob es sich um echte Schwachstellen handelt (False-Positive-Ausschluss).
3. Erstelle bei Bedarf einen Implementierungsplan unter .agents/plans/ und setze die Korrekturen defensiv und schrittweise um.
4. Halte dich dabei strikt an das globale Regelwerk (.agents/global-core.md)${projectRule}.`;
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

      if (crPath && secPath && vscode) {
        const choiceItems = [
          { label: '$(package) Beide Berichte zusammen übergeben', choice: 'both', detail: 'Code-Review und Security-Audit gemeinsam analysieren (Standard)' },
          { label: '$(shield) Security-Audit übergeben', choice: 'security', detail: `${rep.sec.summary} (${rep.sec.lastRun || ''})` },
          { label: '$(search) Code-Review übergeben', choice: 'review', detail: `${rep.cr.summary} (${rep.cr.lastRun || ''})` }
        ];

        const pickedChoice = await vscode.window.showQuickPick(choiceItems, {
          placeHolder: `Welche Berichte sollen an die KI für „${project}“ übergeben werden?`
        });

        if (!pickedChoice) return;
        if (pickedChoice.choice === 'both') {
          targetPaths = [secPath, crPath];
        } else if (pickedChoice.choice === 'security') {
          targetPaths = [secPath];
        } else {
          targetPaths = [crPath];
        }
      } else if (secPath && crPath) {
        targetPaths = [secPath, crPath];
      } else if (secPath) {
        targetPaths = [secPath];
      } else if (crPath) {
        targetPaths = [crPath];
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
        this.markProjectReviewed(project);
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
    for (const [, run] of this.runningProjects) {
      if (run.process) {
        try {
          run.process.kill();
        } catch {}
      }
    }
    this.runningProjects.clear();
    this.auditQueue = [];
    this.changeListeners.clear();
  }
}

module.exports = { AuditManager };

