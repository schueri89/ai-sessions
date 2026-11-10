'use strict';

// Background polling of JIRA fix versions: keeps the Releases tab current and notifies when an open release turns fully green.

const vscode = require('vscode');
const { fetchReleases } = require('./jiraReleases');
const { acquireSharedToastLock } = require('./toastNotifier');

const POLL_MS = 5 * 60 * 1000;
// Every VS Code window polls on its own; the shared lock lets only one of them notify per release.
const NOTIFY_LOCK_MS = 30 * 60 * 1000;

function isGreen(v) {
  const i = v.issues || {};
  return v.status !== 'released' && (Number(i.toDo) || 0) + (Number(i.inProgress) || 0) === 0 && (Number(i.done) || 0) > 0;
}

function snapshot(upcoming) {
  return new Map(upcoming.map((v) => [v.id, isGreen(v)]));
}

// Only releases already known and not green before count; unknown ones are just seeded.
function findTurnedGreen(prevById, upcoming) {
  return upcoming.filter((v) => prevById.has(v.id) && !prevById.get(v.id) && isGreen(v));
}

class ReleasesWatcher {
  constructor({ soundNotifier, onData } = {}) {
    this.soundNotifier = soundNotifier;
    this.onData = onData;
    this.known = null;
    this.timer = null;
    this.disposed = false;
  }

  isEnabled() {
    return Boolean(vscode.workspace.getConfiguration('sessionDashboard.releases').get('enabled', false));
  }

  restart() {
    clearTimeout(this.timer);
    this.timer = null;
    this.known = null;
    if (this.isEnabled()) this.schedule(0);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), ms);
  }

  async poll() {
    this.timer = null;
    const data = await this.refresh();
    if (this.disposed) return;
    if (this.onData) this.onData(data);
    // Missing credentials file or rejected login: wait for the next config change (restart()).
    if (data.state === 'unconfigured' || data.state === 'noAuth' || !this.isEnabled()) return;
    if (!this.timer) this.schedule(POLL_MS);
  }

  async refresh() {
    const data = await fetchReleases();
    this.evaluate(data);
    return data;
  }

  evaluate(data) {
    if (!data || data.state !== 'ok') return;
    if (this.known) {
      for (const v of findTurnedGreen(this.known, data.upcoming)) this.notify(v);
    }
    this.known = snapshot(data.upcoming);
  }

  notify(v) {
    if (!acquireSharedToastLock(`release:${v.id}`, NOTIFY_LOCK_MS)) return;

    const notifCfg = vscode.workspace.getConfiguration('sessionDashboard.notifications');
    if (notifCfg.get('enabled', true) && notifCfg.get('releases', true)) {
      const n = v.issues.done;
      const date = v.releaseDate ? `, Termin ${v.releaseDate.split('-').reverse().join('.')}` : '';
      const message = `✅ [🏷️ ${v.projectKey}] Release ${v.name} komplett grün (${n}/${n} Vorgänge${date})`;
      vscode.window.showInformationMessage(message, 'In JIRA öffnen').then((action) => {
        if (action === 'In JIRA öffnen') vscode.env.openExternal(vscode.Uri.parse(v.url));
      });
    }

    const soundCfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
    if (this.soundNotifier && soundCfg.get('enabled', true) && soundCfg.get('releases.enabled', true)) {
      this.soundNotifier.playSound('taskCompleted', '', soundCfg.get('releases.sound', 'tada'));
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { ReleasesWatcher, findTurnedGreen, isGreen };
