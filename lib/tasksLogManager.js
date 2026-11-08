'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let vscode;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}
const { getDefaultRoot } = require('./project');

class TasksLogManager {
  constructor(context, options = {}) {
    this.context = context;
    this.soundNotifier = options.soundNotifier || null;
    this.toastNotifier = options.toastNotifier || null;
    this.changeListeners = new Set();
    this.cachedOverview = null;
    this.lastScanTime = 0;
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
        console.error('[TasksLogManager] Listener error:', err);
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

  getKnownTasks() {
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.logs');
        const configured = cfg.get('tasks');
        if (Array.isArray(configured) && configured.length > 0) {
          return configured.filter((t) => t && typeof t.taskName === 'string' && t.taskName.trim());
        }
      } catch {}
    }
    return [
      {
        taskName: 'DevBox-Nightly-BackupSync',
        displayName: 'Google Drive Backup & Sync',
        associatedLog: 'backup-sync.log',
        defaultSchedule: 'Täglich 03:00 Uhr'
      },
      {
        taskName: 'DevBox-Nightly-Audit',
        displayName: 'Lokale KI-Audits (Code-Review & Security)',
        associatedLog: 'nightly-audit.log',
        defaultSchedule: 'Täglich 04:30 Uhr'
      }
    ];
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

  formatTimeHM(str) {
    if (!str) return '-';
    return String(str).replace(/(\b\d{1,2}:\d{2}):\d{2}\b/g, '$1');
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

  getTaskInfo(taskName) {
    try {
      const buf = execSync(`schtasks.exe /Query /TN "${taskName}" /FO CSV /V /NH`, {
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 3000
      });
      const out = this.decodeCliBuffer(buf).trim();

      const parts = this.parseCsvLine(out);
      if (parts.length >= 7) {
        const nextRun = this.formatTimeHM(parts[2] || '-');
        const state = this.fixUmlauts(parts[3] || 'Unbekannt');
        const lastRun = parts[5] || '-';
        const lastResultRaw = parts[6] || '';
        const lastResult = parseInt(lastResultRaw, 10);
        const action = parts[8] || '';
        const comment = this.fixUmlauts(parts[10] || '');
        const scheduleType = this.fixUmlauts(parts[18] || '');
        const startTime = this.formatTimeHM(parts[19] || '');
        const schedule = (scheduleType && startTime) ? `${scheduleType.trim()} ${startTime.trim()} Uhr` : 'Täglich';

        let status = 'ready';
        let statusLabel = 'Bereit';
        let isFailed = false;

        if (state.toLowerCase().includes('ausgef') || state.toLowerCase().includes('running') || lastResult === 267009) {
          status = 'running';
          statusLabel = 'Läuft...';
        } else if (lastResultRaw === '267011' || lastRun.includes('1999')) {
          status = 'never';
          statusLabel = 'Noch kein Lauf';
        } else if (lastResult === 0) {
          status = 'success';
          statusLabel = 'Erfolgreich (0)';
        } else if (!isNaN(lastResult) && lastResult !== 0) {
          status = 'failed';
          statusLabel = `Fehlgeschlagen (${lastResultRaw})`;
          isFailed = true;
        }

        return {
          isRegistered: true,
          taskName,
          nextRun,
          lastRun: lastRun.includes('1999') ? 'Noch nicht gelaufen' : this.formatTimeHM(lastRun),
          state,
          lastResult: lastResultRaw,
          status,
          statusLabel,
          isFailed,
          action,
          comment,
          schedule: schedule || 'Täglich'
        };
      }
    } catch {
      // not registered or query failed
    }

    return {
      isRegistered: false,
      taskName,
      nextRun: '-',
      lastRun: '-',
      state: 'Nicht registriert',
      lastResult: '-',
      status: 'unregistered',
      statusLabel: 'Nicht registriert',
      isFailed: false,
      action: '',
      comment: '',
      schedule: '-'
    };
  }

  getLogFiles() {
    const reportsDir = this.getReportsDir();
    const logs = [];
    const foundNames = new Set();

    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir);
      for (const f of files) {
        if (f.endsWith('.log')) {
          const fullPath = path.join(reportsDir, f);
          try {
            const stat = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            let errorCount = 0;
            let warnCount = 0;
            for (const line of lines) {
              if (/fehler|error|critical|exception/i.test(line)) {
                errorCount++;
              } else if (/warnung|warning/i.test(line)) {
                warnCount++;
              }
            }

            logs.push({
              name: f,
              path: fullPath,
              sizeBytes: stat.size,
              sizeFormatted: this.formatBytes(stat.size),
              mtimeMs: stat.mtimeMs,
              lastModified: this.formatDate(stat.mtimeMs),
              linesCount: lines.length,
              errorCount,
              warnCount,
              hasErrors: errorCount > 0,
              exists: true
            });
            foundNames.add(f);
          } catch {
            // ignore read error
          }
        }
      }
    }

    // Ensure default known logs are always present in the selector
    const defaultLogs = this.getKnownTasks().map((t) => t.associatedLog).filter(Boolean);
    if (!defaultLogs.includes('backup-sync.log')) defaultLogs.unshift('backup-sync.log');
    if (!defaultLogs.includes('nightly-audit.log')) defaultLogs.splice(1, 0, 'nightly-audit.log');
    for (const defName of defaultLogs) {
      if (!foundNames.has(defName)) {
        logs.push({
          name: defName,
          path: path.join(reportsDir, defName),
          sizeBytes: 0,
          sizeFormatted: '0 B',
          mtimeMs: 0,
          lastModified: 'Noch kein Lauf',
          linesCount: 0,
          errorCount: 0,
          warnCount: 0,
          hasErrors: false,
          exists: false
        });
      }
    }

    logs.sort((a, b) => {
      if (a.name === 'backup-sync.log') return -1;
      if (b.name === 'backup-sync.log') return 1;
      if (a.name === 'nightly-audit.log') return -1;
      if (b.name === 'nightly-audit.log') return 1;
      return a.name.localeCompare(b.name);
    });

    return logs;
  }

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatDate(ms) {
    if (!ms) return '-';
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  getLogContent(logName) {
    const reportsDir = this.getReportsDir();
    const safeName = path.basename(logName || 'backup-sync.log');
    const fullPath = path.join(reportsDir, safeName);

    if (!fs.existsSync(fullPath)) {
      return {
        name: safeName,
        content: `Log-Datei '${safeName}' existiert noch nicht auf der Festplatte. Sie wird beim ersten Task-Lauf automatisch angelegt.`,
        exists: false,
        sizeFormatted: '0 B',
        lastModified: '-'
      };
    }

    const stat = fs.statSync(fullPath);
    let content = fs.readFileSync(fullPath, 'utf8');
    content = this.fixUmlauts(content);

    let maxChars = 200000;
    if (vscode && vscode.workspace) {
      try {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.logs');
        const configured = cfg.get('maxCharacters');
        if (typeof configured === 'number' && configured > 0) {
          maxChars = configured;
        }
      } catch {}
    }
    let truncated = false;
    if (content.length > maxChars) {
      content = content.slice(-maxChars);
      truncated = true;
    }

    return {
      name: safeName,
      fullPath,
      content,
      truncated,
      sizeFormatted: this.formatBytes(stat.size),
      lastModified: this.formatDate(stat.mtimeMs),
      exists: true
    };
  }

  getOverview(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedOverview && (now - this.lastScanTime < 3000)) {
      return this.cachedOverview;
    }

    const knownTasks = this.getKnownTasks();
    const tasks = [];
    let failedTasksCount = 0;

    for (const t of knownTasks) {
      const info = this.getTaskInfo(t.taskName);
      const combined = Object.assign({}, t, info);
      if (combined.isFailed) {
        failedTasksCount++;
      }
      tasks.push(combined);
    }

    const logs = this.getLogFiles();

    let logErrorsCount = 0;
    for (const log of logs) {
      if (log.hasErrors) {
        logErrorsCount += log.errorCount;
      }
    }

    this.cachedOverview = {
      tasks,
      logs,
      failedTasksCount,
      logErrorsCount,
      hasFailure: failedTasksCount > 0,
      timestamp: Date.now()
    };
    this.lastScanTime = now;

    return this.cachedOverview;
  }

  runTask(taskName) {
    try {
      execSync(`schtasks.exe /Run /TN "${taskName}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 5000
      });
      if (vscode) {
        vscode.window.showInformationMessage(`[📜 Logs] Task '${taskName}' wurde manuell gestartet.`);
      }
      this.notifyChange();
      return true;
    } catch (err) {
      if (vscode) {
        vscode.window.showErrorMessage(`Fehler beim Starten von Task '${taskName}': ${err.message}`);
      }
      return false;
    }
  }

  openLogInEditor(logName) {
    if (!vscode) return;
    const safeName = path.basename(logName || 'backup-sync.log');
    const fullPath = path.join(this.getReportsDir(), safeName);
    if (fs.existsSync(fullPath)) {
      vscode.workspace.openTextDocument(vscode.Uri.file(fullPath)).then((doc) => {
        vscode.window.showTextDocument(doc);
      });
    } else {
      vscode.window.showWarningMessage(`Log-Datei existiert noch nicht: ${fullPath}`);
    }
  }

  clearLog(logName) {
    const safeName = path.basename(logName || 'backup-sync.log');
    const fullPath = path.join(this.getReportsDir(), safeName);
    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, '', 'utf8');
      if (vscode) {
        vscode.window.showInformationMessage(`[📜 Logs] Log-Datei '${safeName}' wurde geleert.`);
      }
      this.notifyChange();
      return true;
    }
    return false;
  }
}

module.exports = { TasksLogManager };
