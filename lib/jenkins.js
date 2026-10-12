'use strict';

// Read-only Jenkins access (job list) via the JSON API with user + API token (Basic Auth).

const https = require('https');
const vscode = require('vscode');

const SECRET_KEY = 'sessionDashboard.jenkins.apiToken';
const FOLDER_DEPTH = 3;
const JOB_FIELDS = 'name,fullName,url,color,description,buildable,lastBuild[number,result,timestamp,duration,building],upstreamProjects[url],downstreamProjects[url]';
const VIEW_FIELDS = 'name,url,description,jobs[url]';
const VIEWS_TREE = `views[${VIEW_FIELDS},views[${VIEW_FIELDS}]]`;
// Default/personal views are no pipelines.
const SKIP_VIEW_CLASS = /\.(AllView|MyView)$/;

const COLOR_STATUS = {
  blue: 'success',
  red: 'failed',
  yellow: 'unstable',
  aborted: 'aborted',
  disabled: 'disabled',
  notbuilt: 'notbuilt',
  grey: 'unknown'
};

const TLS_ERROR_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID'
]);

function jobsTree(depth) {
  return depth <= 0 ? `jobs[${JOB_FIELDS}]` : `jobs[${JOB_FIELDS},${jobsTree(depth - 1)}]`;
}

function getJenkinsConfig() {
  const cfg = vscode.workspace.getConfiguration('sessionDashboard.jenkins');
  return {
    baseUrl: String(cfg.get('baseUrl', '') || '').trim().replace(/\/+$/, ''),
    user: String(cfg.get('user', '') || '').trim(),
    jobFilter: String(cfg.get('jobFilter', 'deploy') || '')
  };
}

// Token is sent via Basic Auth, so only https is accepted.
function parseBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function isJenkinsUrl(url) {
  const base = parseBaseUrl(getJenkinsConfig().baseUrl);
  if (!base) return false;
  try {
    return new URL(url).origin === base.origin;
  } catch {
    return false;
  }
}

function requestJson(url, user, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64')
      },
      timeout: 15000
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          const err = new Error(`Zugriff verweigert (HTTP ${res.statusCode}). Bitte Jenkins-Benutzer und API-Token prüfen.`);
          err.isAuthError = true;
          reject(err);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Jenkins antwortete mit HTTP ${res.statusCode}.`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Ungültige JSON-Antwort von Jenkins.'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung bei der Jenkins-Anfrage.')));
    req.on('error', (err) => {
      if (err && TLS_ERROR_CODES.has(err.code)) {
        reject(new Error(`TLS-Zertifikat von Jenkins wird nicht vertraut (${err.code}). Prüfen, ob 'http.systemCertificates' aktiv ist und das Firmen-Root-Zertifikat im Windows-Zertifikatsspeicher liegt.`));
        return;
      }
      reject(err);
    });
    req.end();
  });
}

function mapStatus(color) {
  const c = String(color || 'grey');
  const running = c.endsWith('_anime');
  const base = running ? c.slice(0, -'_anime'.length) : c;
  return { status: COLOR_STATUS[base] || 'unknown', running };
}

// Folders / multibranch projects contain "jobs" and are flattened into their leaf jobs.
function flattenJobs(jobs, parentPath, out) {
  for (const j of jobs || []) {
    const fullName = j.fullName || (parentPath ? `${parentPath}/${j.name}` : j.name);
    if (Array.isArray(j.jobs)) {
      flattenJobs(j.jobs, fullName, out);
      continue;
    }
    const { status, running } = mapStatus(j.color);
    const lb = j.lastBuild || null;
    out.push({
      name: j.name || '',
      fullName: fullName || '',
      folder: parentPath || '',
      url: j.url || '',
      description: String(j.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      type: String(j._class || '').split('.').pop(),
      buildable: j.buildable !== false,
      status,
      running: running || Boolean(lb && lb.building),
      upstream: (j.upstreamProjects || []).map((p) => p.url).filter(Boolean),
      downstream: (j.downstreamProjects || []).map((p) => p.url).filter(Boolean),
      lastBuild: lb ? {
        number: lb.number,
        result: lb.result || null,
        timestamp: lb.timestamp || 0,
        duration: lb.duration || 0
      } : null
    });
  }
  return out;
}

function flattenViews(views, parentName, out) {
  for (const v of views || []) {
    const name = parentName ? `${parentName} / ${v.name}` : v.name;
    if (Array.isArray(v.views) && v.views.length) {
      flattenViews(v.views, name, out);
    }
    if (!SKIP_VIEW_CLASS.test(String(v._class || ''))) {
      out.push({ ...v, name });
    }
  }
  return out;
}

// Topological order along downstream triggers inside the given set, ties/cycles alphabetically.
function orderByChain(urls, byUrl) {
  const inSet = new Set(urls);
  const indegree = new Map(urls.map((u) => [u, 0]));
  for (const u of urls) {
    for (const d of byUrl.get(u).downstream) {
      if (inSet.has(d) && d !== u) indegree.set(d, indegree.get(d) + 1);
    }
  }
  const byName = (a, b) => byUrl.get(a).fullName.localeCompare(byUrl.get(b).fullName);
  const ready = urls.filter((u) => indegree.get(u) === 0).sort(byName);
  const ordered = [];
  const done = new Set();
  while (ready.length) {
    const u = ready.shift();
    ordered.push(u);
    done.add(u);
    const next = byUrl.get(u).downstream.filter((d) => inSet.has(d) && !done.has(d));
    for (const d of next) {
      indegree.set(d, indegree.get(d) - 1);
      if (indegree.get(d) === 0) ready.push(d);
    }
    ready.sort(byName);
  }
  return ordered.concat(urls.filter((u) => !done.has(u)).sort(byName));
}

// Pipelines = Jenkins views (e.g. Build/Delivery Pipeline View) + downstream chains not covered by a view.
function buildPipelines(jobs, views) {
  const byUrl = new Map(jobs.map((j) => [j.url, j]));
  const pipelines = [];
  const covered = new Set();
  for (const v of views) {
    const urls = [...new Set((v.jobs || []).map((x) => x.url))].filter((u) => byUrl.has(u));
    if (urls.length === 0 || (urls.length === jobs.length && jobs.length > 1)) continue;
    urls.forEach((u) => covered.add(u));
    pipelines.push({
      name: v.name || '',
      url: v.url || '',
      source: 'view',
      viewType: String(v._class || '').split('.').pop(),
      description: String(v.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      jobUrls: orderByChain(urls, byUrl)
    });
  }

  const parent = new Map(jobs.map((j) => [j.url, j.url]));
  const find = (u) => {
    while (parent.get(u) !== u) {
      parent.set(u, parent.get(parent.get(u)));
      u = parent.get(u);
    }
    return u;
  };
  for (const j of jobs) {
    for (const d of j.downstream.concat(j.upstream)) {
      if (byUrl.has(d)) parent.set(find(j.url), find(d));
    }
  }
  const groups = new Map();
  for (const j of jobs) {
    const root = find(j.url);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(j.url);
  }
  for (const urls of groups.values()) {
    if (urls.length < 2 || urls.every((u) => covered.has(u))) continue;
    const ordered = orderByChain(urls, byUrl);
    pipelines.push({
      name: byUrl.get(ordered[0]).fullName,
      url: '',
      source: 'chain',
      viewType: '',
      description: '',
      jobUrls: ordered
    });
  }
  return pipelines.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchJenkinsJobs(secrets) {
  const { baseUrl, user, jobFilter } = getJenkinsConfig();
  if (!baseUrl) {
    return { state: 'unconfigured', message: "Keine Jenkins-URL hinterlegt. Bitte 'sessionDashboard.jenkins.baseUrl' in den Einstellungen pflegen." };
  }
  if (!parseBaseUrl(baseUrl)) {
    return { state: 'unconfigured', baseUrl, message: 'Die Jenkins-URL muss mit https:// beginnen.' };
  }
  const token = secrets ? await secrets.get(SECRET_KEY) : undefined;
  if (!user || !token) {
    return { state: 'noAuth', baseUrl, message: 'Für Jenkins werden Benutzername und persönlicher API-Token benötigt (Jenkins > Benutzer > Security > API Token).' };
  }
  try {
    const tree = `${jobsTree(FOLDER_DEPTH)},${VIEWS_TREE}`;
    const data = await requestJson(`${baseUrl}/api/json?tree=${encodeURIComponent(tree)}`, user, token);
    const jobs = flattenJobs(data && data.jobs, '', []);
    return {
      state: 'ok',
      baseUrl,
      user,
      jobFilter,
      fetchedAt: Date.now(),
      jobs,
      pipelines: buildPipelines(jobs, flattenViews(data && data.views, '', []))
    };
  } catch (err) {
    return {
      state: err && err.isAuthError ? 'noAuth' : 'error',
      baseUrl,
      message: (err && err.message) || String(err)
    };
  }
}

async function setJenkinsCredentials(secrets) {
  const cfg = vscode.workspace.getConfiguration('sessionDashboard.jenkins');
  const user = await vscode.window.showInputBox({
    title: 'Jenkins-Zugangsdaten (1/2)',
    prompt: 'Jenkins-Benutzername',
    value: String(cfg.get('user', '') || ''),
    ignoreFocusOut: true
  });
  if (user === undefined) return false;
  const token = await vscode.window.showInputBox({
    title: 'Jenkins-Zugangsdaten (2/2)',
    prompt: 'Persönlicher Jenkins API-Token (leer lassen = gespeicherten Token löschen)',
    password: true,
    ignoreFocusOut: true
  });
  if (token === undefined) return false;
  await cfg.update('user', user.trim(), vscode.ConfigurationTarget.Global);
  if (token.trim()) {
    await secrets.store(SECRET_KEY, token.trim());
    vscode.window.showInformationMessage('Jenkins-Zugangsdaten gespeichert.');
  } else {
    await secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage('Jenkins API-Token gelöscht.');
  }
  return true;
}

module.exports = { fetchJenkinsJobs, setJenkinsCredentials, isJenkinsUrl, getJenkinsConfig };
