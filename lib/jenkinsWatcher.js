'use strict';

// Background polling of Jenkins: keeps the Deploys tab current and notifies when a build
// started by the configured user (directly or via an upstream build) has finished.

const vscode = require('vscode');
const { fetchJenkinsJobs } = require('./jenkins');
const { acquireSharedToastLock } = require('./toastNotifier');

const POLL_IDLE_MS = 60000;
const POLL_ACTIVE_MS = 15000;
// Every VS Code window polls on its own; the shared lock lets only one of them notify per build.
const NOTIFY_LOCK_MS = 30 * 60 * 1000;

const RESULT_TOASTS = {
  SUCCESS: { icon: '✅', text: 'erfolgreich beendet', level: 'info' },
  UNSTABLE: { icon: '⚠️', text: 'instabil beendet', level: 'warning' },
  ABORTED: { icon: '⏹️', text: 'abgebrochen', level: 'warning' }
};

function formatDuration(ms) {
  const sec = Math.round((Number(ms) || 0) / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function isOwnBuild(lastBuild, user) {
  const u = String(user || '').toLowerCase();
  return Boolean(u && lastBuild && (lastBuild.userIds || []).some((id) => String(id).toLowerCase() === u));
}

function snapshot(jobs) {
  return new Map(jobs.map((j) => [j.url, {
    number: j.lastBuild ? j.lastBuild.number : 0,
    building: Boolean(j.lastBuild && j.lastBuild.building)
  }]));
}

// A build counts as finished if it was seen running, or if a newer build already completed between two polls.
function findFinishedBuilds(prevByUrl, jobs, user) {
  const finished = [];
  for (const j of jobs) {
    const lb = j.lastBuild;
    const prev = prevByUrl.get(j.url);
    if (!lb || lb.building || !prev || !isOwnBuild(lb, user)) continue;
    if (lb.number === prev.number ? prev.building : lb.number > prev.number) finished.push(j);
  }
  return finished;
}

class JenkinsWatcher {
  constructor(secrets, { soundNotifier, onData } = {}) {
    this.secrets = secrets;
    this.soundNotifier = soundNotifier;
    this.onData = onData;
    this.known = null;
    this.notified = new Set();
    this.timer = null;
    this.disposed = false;
  }

  isEnabled() {
    return Boolean(vscode.workspace.getConfiguration('sessionDashboard.jenkins').get('enabled', false));
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
    // Missing URL/credentials: wait for the next config or credential change (restart()).
    if (data.state === 'unconfigured' || data.state === 'noAuth' || !this.isEnabled()) return;
    if (this.timer) return;
    const ownRunning = data.state === 'ok'
      && data.jobs.some((j) => j.lastBuild && j.lastBuild.building && isOwnBuild(j.lastBuild, data.user));
    this.schedule(ownRunning ? POLL_ACTIVE_MS : POLL_IDLE_MS);
  }

  async refresh() {
    const data = await fetchJenkinsJobs(this.secrets);
    this.evaluate(data);
    return data;
  }

  evaluate(data) {
    if (!data || data.state !== 'ok') return;
    if (this.known) {
      for (const job of findFinishedBuilds(this.known, data.jobs, data.user)) this.notify(job);
    }
    this.known = snapshot(data.jobs);
  }

  notify(job) {
    const lb = job.lastBuild;
    const key = `jenkins:${job.url}#${lb.number}`;
    if (this.notified.has(key)) return;
    this.notified.add(key);
    if (!acquireSharedToastLock(key, NOTIFY_LOCK_MS)) return;

    const notifCfg = vscode.workspace.getConfiguration('sessionDashboard.notifications');
    if (notifCfg.get('enabled', true) && notifCfg.get('jenkins', true)) {
      const name = `[🚀 Jenkins] ${job.fullName} #${lb.number}`;
      const dur = formatDuration(lb.duration);
      const t = RESULT_TOASTS[lb.result];
      if (!t) {
        vscode.window.showErrorMessage(`❌ ${name} fehlgeschlagen (${lb.result || 'ohne Ergebnis'}, ${dur})`);
      } else if (t.level === 'warning') {
        vscode.window.showWarningMessage(`${t.icon} ${name} ${t.text} (${dur})`);
      } else {
        vscode.window.showInformationMessage(`${t.icon} ${name} ${t.text} (${dur})`);
      }
    }

    const soundCfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
    if (this.soundNotifier && soundCfg.get('enabled', true) && soundCfg.get('jenkins.enabled', true)) {
      this.soundNotifier.playSound('taskCompleted');
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { JenkinsWatcher, findFinishedBuilds, isOwnBuild };
