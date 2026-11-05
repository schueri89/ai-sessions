'use strict';

// Update check against the GitHub Releases of the public repo; the VSIX is attached as release asset.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const vscode = require('vscode');

const REPO = 'schueri89/ai-sessions';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Shorter than the check interval so timer drift never stretches it to two hours.
const TIMER_MS = 5 * 60 * 1000;
const STATE_LAST_CHECK = 'sessionDashboard.update.lastCheck';
const STATE_SKIPPED = 'sessionDashboard.update.skippedVersion';
const ASSET_NAME = /^ai-sessions-\d+\.\d+\.\d+\.vsix$/;
const MAX_REDIRECTS = 5;

function parseVersion(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!m) throw new Error(`Ungültige Versionsnummer „${version}“.`);
  return m.slice(1).map(Number);
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function pickVsixAsset(release) {
  const asset = (release.assets || []).find((a) => ASSET_NAME.test(a.name));
  if (!asset) throw new Error(`Release ${release.tag_name} enthält keine VSIX-Datei.`);
  return asset;
}

function releasePageUrl(tag) {
  return `https://github.com/${REPO}/releases/tag/${encodeURIComponent(tag)}`;
}

function httpError(res, url) {
  if (res.statusCode === 404 && url === LATEST_URL) return new Error('Auf GitHub ist noch kein Release veröffentlicht.');
  if (res.statusCode === 403 && res.headers['x-ratelimit-remaining'] === '0') {
    return new Error('GitHub-API-Limit erreicht, später erneut versuchen.');
  }
  return new Error(`GitHub antwortet mit HTTP ${res.statusCode}.`);
}

function download(url, accept, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (new URL(url).protocol !== 'https:') {
      reject(new Error(`Unsichere Download-Adresse: ${url}`));
      return;
    }
    const req = https.get(url, {
      headers: { Accept: accept, 'User-Agent': 'ai-sessions-update-check' },
      timeout: 30000
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error('Zu viele Weiterleitungen beim Download.'));
          return;
        }
        resolve(download(new URL(res.headers.location, url).toString(), accept, redirects + 1));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(httpError(res, url));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung bei der Verbindung zu GitHub.')));
    req.on('error', reject);
  });
}

async function fetchLatestRelease() {
  const body = await download(LATEST_URL, 'application/vnd.github+json');
  return JSON.parse(body.toString('utf8'));
}

async function downloadAsset(asset) {
  const data = await download(asset.browser_download_url, 'application/octet-stream');
  if (data.length !== asset.size) {
    throw new Error(`Download unvollständig (${data.length} von ${asset.size} Bytes).`);
  }
  const file = path.join(os.tmpdir(), asset.name);
  fs.writeFileSync(file, data);
  return file;
}

class UpdateChecker {
  constructor(context, log) {
    this.context = context;
    this.log = log;
    this.currentVersion = context.extension.packageJSON.version;
    this.timer = null;
    this.busy = false;
  }

  start() {
    this.checkIfDue();
    this.timer = setInterval(() => this.checkIfDue(), TIMER_MS);
  }

  dispose() {
    clearInterval(this.timer);
  }

  checkIfDue() {
    if (!vscode.workspace.getConfiguration('sessionDashboard.updateCheck').get('enabled', true)) return;
    const last = this.context.globalState.get(STATE_LAST_CHECK, 0);
    if (Date.now() - last < CHECK_INTERVAL_MS) return;
    this.check(false);
  }

  async check(manual) {
    if (this.busy) return;
    this.busy = true;
    let offer = null;
    try {
      // Stored up front so parallel windows (shared globalState) don't all check at once.
      await this.context.globalState.update(STATE_LAST_CHECK, Date.now());
      const release = await fetchLatestRelease();
      const latest = release.tag_name.replace(/^v/, '');
      this.log(`Update-Prüfung: installiert ${this.currentVersion}, neueste ${latest}`);
      if (compareVersions(latest, this.currentVersion) <= 0) {
        if (manual) vscode.window.showInformationMessage(`AI Sessions ist aktuell (${this.currentVersion}).`);
        return;
      }
      if (!manual && this.context.globalState.get(STATE_SKIPPED) === latest) return;
      offer = { tag: release.tag_name, latest, asset: pickVsixAsset(release) };
    } catch (err) {
      this.log(`Update-Prüfung fehlgeschlagen: ${err.message}`);
      vscode.window.showWarningMessage(`AI Sessions: Update-Prüfung fehlgeschlagen – ${err.message}`);
    } finally {
      this.busy = false;
    }
    if (offer) this.offer(offer);
  }

  async offer({ tag, latest, asset }) {
    const choice = await vscode.window.showInformationMessage(
      `AI Sessions ${latest} ist verfügbar (installiert: ${this.currentVersion}).`,
      'Installieren',
      'Changelog',
      'Überspringen'
    );
    if (choice === 'Changelog') {
      await vscode.env.openExternal(vscode.Uri.parse(releasePageUrl(tag)));
      this.offer({ tag, latest, asset });
      return;
    }
    if (choice === 'Überspringen') {
      await this.context.globalState.update(STATE_SKIPPED, latest);
      return;
    }
    if (choice !== 'Installieren') return;

    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `AI Sessions ${latest} wird installiert…` },
        async () => {
          const file = await downloadAsset(asset);
          await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
        }
      );
    } catch (err) {
      this.log(`Update-Installation fehlgeschlagen: ${err.message}`);
      vscode.window.showErrorMessage(`AI Sessions: Update-Installation fehlgeschlagen – ${err.message}`);
      return;
    }
    const reload = await vscode.window.showInformationMessage(
      `AI Sessions ${latest} ist installiert. Fenster neu laden, um die neue Version zu aktivieren.`,
      'Neu laden'
    );
    if (reload) vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

module.exports = { UpdateChecker, compareVersions, parseVersion, pickVsixAsset, releasePageUrl };
