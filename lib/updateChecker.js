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
// Shared via globalState so windows that skip the (shared) hourly check still show the dashboard alert.
const STATE_AVAILABLE = 'sessionDashboard.update.available';
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

function download(url, accept, redirects = 0, onProgress = null, cancelToken = null) {
  return new Promise((resolve, reject) => {
    if (new URL(url).protocol !== 'https:') {
      reject(new Error(`Unsichere Download-Adresse: ${url}`));
      return;
    }
    if (cancelToken && cancelToken.isCancellationRequested) {
      reject(new Error('Download abgebrochen.'));
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
        resolve(download(new URL(res.headers.location, url).toString(), accept, redirects + 1, onProgress, cancelToken));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(httpError(res, url));
        return;
      }
      const totalBytes = res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : 0;
      let receivedBytes = 0;
      const chunks = [];
      res.on('data', (c) => {
        chunks.push(c);
        receivedBytes += c.length;
        if (typeof onProgress === 'function') {
          onProgress(receivedBytes, totalBytes);
        }
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    if (cancelToken && typeof cancelToken.onCancellationRequested === 'function') {
      cancelToken.onCancellationRequested(() => {
        req.destroy(new Error('Download abgebrochen.'));
      });
    }
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung bei der Verbindung zu GitHub.')));
    req.on('error', reject);
  });
}

async function fetchLatestRelease() {
  const body = await download(LATEST_URL, 'application/vnd.github+json');
  return JSON.parse(body.toString('utf8'));
}

async function downloadAsset(asset, onProgress = null, cancelToken = null) {
  let lastPct = 0;
  const progressCallback = (received, headerTotal) => {
    const total = headerTotal || asset.size || 0;
    const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
    const inc = pct > lastPct ? pct - lastPct : 0;
    if (inc > 0) lastPct = pct;
    if (typeof onProgress === 'function') {
      const mbReceived = (received / (1024 * 1024)).toFixed(1);
      const mbTotal = total > 0 ? (total / (1024 * 1024)).toFixed(1) : '?';
      onProgress({
        increment: inc,
        message: `${mbReceived} / ${mbTotal} MB (${pct} %)`
      });
    }
  };

  const data = await download(asset.browser_download_url, 'application/octet-stream', 0, progressCallback, cancelToken);
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
    this.available = null;
    this.installed = false;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
  }

  start() {
    this.checkIfDue();
    this.timer = setInterval(() => this.checkIfDue(), TIMER_MS);
  }

  dispose() {
    clearInterval(this.timer);
    this._onDidChange.dispose();
  }

  // Info for the dashboard alert; null when nothing is pending.
  dashboardInfo() {
    if (!this.available) return null;
    return { latest: this.available.latest, current: this.currentVersion, installed: this.installed };
  }

  async setAvailable(offer) {
    await this.context.globalState.update(STATE_AVAILABLE, offer);
    this.applyAvailable(offer);
  }

  applyAvailable(offer) {
    const valid = offer && compareVersions(offer.latest, this.currentVersion) > 0
      && this.context.globalState.get(STATE_SKIPPED) !== offer.latest ? offer : null;
    if ((valid && valid.latest) === (this.available && this.available.latest)) return;
    this.available = valid;
    this.installed = false;
    this._onDidChange.fire();
  }

  openFromDashboard() {
    if (!this.available) return;
    if (this.installed) {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
      return;
    }
    this.offer(this.available);
  }

  checkIfDue() {
    if (!vscode.workspace.getConfiguration('sessionDashboard.updateCheck').get('enabled', true)) return;
    this.applyAvailable(this.context.globalState.get(STATE_AVAILABLE, null));
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
        await this.setAvailable(null);
        if (manual) vscode.window.showInformationMessage(`AI Sessions ist aktuell (${this.currentVersion}).`);
        return;
      }
      if (!manual && this.context.globalState.get(STATE_SKIPPED) === latest) return;
      if (manual) await this.context.globalState.update(STATE_SKIPPED, undefined);
      offer = { tag: release.tag_name, latest, asset: pickVsixAsset(release) };
      await this.setAvailable(offer);
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
      this.applyAvailable(null);
      return;
    }
    if (choice !== 'Installieren') return;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `AI Sessions ${latest} wird heruntergeladen & installiert…`,
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: 'Download startet…' });
          const file = await downloadAsset(
            asset,
            ({ increment, message }) => progress.report({ increment, message }),
            token
          );
          progress.report({ message: 'Installation läuft…' });
          await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
        }
      );
    } catch (err) {
      if (err.message === 'Download abgebrochen.') {
        this.log('Update-Download durch Benutzer abgebrochen.');
        vscode.window.showInformationMessage('AI Sessions: Update-Download abgebrochen.');
        return;
      }
      this.log(`Update-Installation fehlgeschlagen: ${err.message}`);
      vscode.window.showErrorMessage(`AI Sessions: Update-Installation fehlgeschlagen – ${err.message}`);
      return;
    }
    this.installed = true;
    this._onDidChange.fire();
    const reload = await vscode.window.showInformationMessage(
      `AI Sessions ${latest} ist installiert. Fenster neu laden, um die neue Version zu aktivieren.`,
      'Neu laden'
    );
    if (reload) vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

module.exports = { UpdateChecker, compareVersions, parseVersion, pickVsixAsset, releasePageUrl, downloadAsset };
