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
    this.runningProjects = new Map(); // projectName -> { mode, startTime, process }
    this.changeListeners = new Set();
    this.cachedReports = null;
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
      // Matches YYYY-MM-DD_<project>_audit.md
      const filePattern = /^(\d{4}-\d{2}-\d{2})_(.+)_audit\.md$/i;

      for (const f of files) {
        const m = f.match(filePattern);
        if (!m) continue;

        const [, dateStr, project] = m;
        const filePath = path.join(reportsDir, f);
        let stat;
        try {
          stat = fs.statSync(filePath);
        } catch {
          continue;
        }

        const existing = reportsByProject.get(project);
        if (!existing || stat.mtimeMs > existing.mtimeMs) {
          const content = fs.readFileSync(filePath, 'utf8');
          const status = this.parseReportStatus(content, stat.mtimeMs);

          reportsByProject.set(project, {
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
          });
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

    const hasCritical = /CRITICAL|KRITISCH/i.test(content);
    const hasHigh = /HIGH|HOCH/i.test(content);
    const hasWarn = /WARN|WARNUNG|CHANGES_REQUESTED/i.test(content);
    const guardsFailed = /## ❌ 1\. Guards & Tests/i.test(content);

    if (hasCritical || guardsFailed) {
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

    return {
      status,
      summary,
      lastRun,
      filePath,
      isRunning: this.runningProjects.has('__workspace_guards__')
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

    this.runningProjects.set(key, { mode: 'guards', startTime, process: proc });
    this.notifyChange();

    proc.on('close', (code) => {
      this.runningProjects.delete(key);
      this.notifyChange();
      if (code === 0 && vscode) {
        vscode.window.showInformationMessage('Workspace-Guards erfolgreich geprüft.');
      }
    });

    proc.on('error', (err) => {
      this.runningProjects.delete(key);
      this.notifyChange();
      if (vscode) {
        vscode.window.showErrorMessage(`Konnte Guards nicht prüfen: ${err.message}`);
      }
    });
  }

  getAuditOverview() {
    const projects = this.getProjects();
    const reports = this.getReports();
    const overview = [];

    for (const p of projects) {
      const rep = reports.get(p) || null;
      const running = this.runningProjects.get(p) || null;
      const runningMode = running
        ? (running.diff === 'full' ? `${running.mode} (Komplett)` : running.mode)
        : null;

      overview.push({
        project: p,
        isRunning: Boolean(running),
        runningMode,
        durationMs: running ? Date.now() - running.startTime : null,
        lastRun: rep ? rep.lastRun : null,
        status: rep ? rep.status : 'never',
        summary: rep ? rep.summary : 'Noch kein Bericht vorhanden',
        mode: rep ? rep.mode : null,
        model: rep ? rep.model : null,
        reportPath: rep ? rep.filePath : null
      });
    }

    return {
      workspaceGuards: this.getWorkspaceGuards(),
      scheduledTask: this.getScheduledTask(),
      projects: overview
    };
  }

  runAudit(projectName, mode = 'all', diff = 'unstaged') {
    if (this.runningProjects.has(projectName)) {
      if (vscode) vscode.window.showWarningMessage(`Audit für ${projectName} läuft bereits.`);
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
      '--diff', diff
    ];

    const startTime = Date.now();
    const proc = spawn('python', args, {
      cwd: this.getRoot(),
      shell: false
    });

    this.runningProjects.set(projectName, { mode, diff, startTime, process: proc });
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
      this.runningProjects.delete(projectName);
      this.getReports(true);
      this.notifyChange();

      if (code === 0) {
        if (vscode) {
          const scopeLabel = diff === 'full' ? 'Komplett' : 'Diff';
          vscode.window.showInformationMessage(`Audit (${scopeLabel}) für ${projectName} erfolgreich abgeschlossen.`);
        }
      } else {
        const errMsg = stderr || stdout || `Beendet mit Code ${code}`;
        console.error(`[AuditManager] Audit failed for ${projectName}:`, errMsg);
        if (vscode) {
          vscode.window.showErrorMessage(`Audit für ${projectName} fehlgeschlagen: ${errMsg.slice(0, 150)}`);
        }
      }
    });

    proc.on('error', (err) => {
      this.runningProjects.delete(projectName);
      this.notifyChange();
      console.error(`[AuditManager] Spawn error for ${projectName}:`, err);
      if (vscode) {
        vscode.window.showErrorMessage(`Konnte Python für ${projectName} nicht starten: ${err.message}`);
      }
    });
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

  buildPrompt(project, reportPath) {
    const normPath = reportPath ? String(reportPath).replace(/\\/g, '/') : '';
    const isWorkspace = !project || project === 'workspace';
    const projectRef = isWorkspace ? 'Workspace Guards' : `das Projekt ${project}`;
    const projectRule = isWorkspace
      ? ''
      : ` sowie die jeweiligen Projekt-Konventionen (${project}/.agents/project-context.md)`;

    return `Bitte analysiere die Ergebnisse des lokalen KI-Audits für ${projectRef}:
Berichtsdatei: ${normPath}

Aufgabenstellung:
1. Lies den Bericht und prüfe alle gemeldeten Befunde (Schweregrade: Kritisch / Hoch / Mittel).
2. Verifiziere im Quellcode, ob es sich um echte Schwachstellen handelt (False-Positive-Ausschluss).
3. Erstelle bei Bedarf einen Implementierungsplan unter .agents/plans/ und setze die Korrekturen defensiv und schrittweise um.
4. Halte dich dabei strikt an das globale Regelwerk (.agents/global-core.md)${projectRule}.`;
  }

  async dispatchAuditPrompt(provider, project, reportPath) {
    if (!reportPath || !fs.existsSync(reportPath)) {
      if (vscode) vscode.window.showWarningMessage('Berichtsdatei existiert nicht.');
      return;
    }

    const prompt = this.buildPrompt(project, reportPath);

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
    for (const [, run] of this.runningProjects) {
      if (run.process) {
        try {
          run.process.kill();
        } catch {}
      }
    }
    this.runningProjects.clear();
    this.changeListeners.clear();
  }
}

module.exports = { AuditManager };

