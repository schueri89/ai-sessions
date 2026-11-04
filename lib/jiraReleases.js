'use strict';

// Read-only Jira Cloud access to fix versions ("Lösungsversionen"); credentials come from a JSON file outside the repo.

const fs = require('fs');
const https = require('https');
const vscode = require('vscode');

const PAGE_SIZE = 50;
const PARALLEL_PROJECTS = 6;

let lastBaseUrl = '';

function getReleasesConfig() {
  const cfg = vscode.workspace.getConfiguration('sessionDashboard.releases');
  const projects = cfg.get('projects', []);
  return {
    credentialsFile: String(cfg.get('credentialsFile', '') || '').trim(),
    projects: (Array.isArray(projects) ? projects : []).map((p) => String(p || '').trim().toUpperCase()).filter(Boolean)
  };
}

function isHttpsUrl(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function readCredentials(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const baseUrl = String(data.baseUrl || '').trim().replace(/\/+$/, '');
  const authString = String(data.authString || '').trim();
  if (!isHttpsUrl(baseUrl)) {
    throw new Error(`'baseUrl' fehlt in ${file} oder beginnt nicht mit https://.`);
  }
  if (!authString) {
    throw new Error(`'authString' (Base64 von "E-Mail:API-Token") fehlt in ${file}.`);
  }
  return { baseUrl, authString };
}

function isJiraReleaseUrl(url) {
  if (!lastBaseUrl) return false;
  try {
    return new URL(url).origin === new URL(lastBaseUrl).origin;
  } catch {
    return false;
  }
}

function jiraErrorText(body) {
  try {
    const data = JSON.parse(body);
    return [].concat(data.errorMessages || [], Object.values(data.errors || {})).join(' ');
  } catch {
    return '';
  }
}

function requestJson(url, authString) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Basic ${authString}` },
      timeout: 20000
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 401 || res.statusCode === 403) {
          const err = new Error(`JIRA verweigert den Zugriff (HTTP ${res.statusCode}). Bitte den Auth-String in der Zugangsdatei prüfen.`);
          err.isAuthError = true;
          reject(err);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const detail = jiraErrorText(body);
          reject(new Error(`JIRA antwortete mit HTTP ${res.statusCode} (${new URL(url).pathname})${detail ? ': ' + detail : '.'}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Ungültige JSON-Antwort von JIRA.'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung bei der JIRA-Anfrage.')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchPaged(baseUrl, authString, path, query) {
  const values = [];
  for (;;) {
    const qs = new URLSearchParams(query);
    qs.set('startAt', String(values.length));
    qs.set('maxResults', String(PAGE_SIZE));
    const page = await requestJson(`${baseUrl}${path}?${qs}`, authString);
    const batch = Array.isArray(page.values) ? page.values : [];
    values.push(...batch);
    if (page.isLast !== false || batch.length === 0) return values;
  }
}

async function fetchProjects(baseUrl, authString, keys) {
  const query = [['orderBy', 'key']].concat(keys.map((k) => ['keys', k]));
  const projects = (await fetchPaged(baseUrl, authString, '/rest/api/3/project/search', query))
    .map((p) => ({ key: String(p.key), name: String(p.name || p.key) }));
  const found = new Set(projects.map((p) => p.key));
  const missing = keys.filter((k) => !found.has(k));
  if (missing.length) {
    throw new Error(`JIRA-Projekt(e) nicht gefunden oder ohne Leserecht: ${missing.join(', ')}. Bitte 'sessionDashboard.releases.projects' prüfen.`);
  }
  return projects;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function localIsoDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function versionStatus(v, today) {
  if (v.released) return 'released';
  if (v.overdue || (v.releaseDate && v.releaseDate < today)) return 'overdue';
  if (v.startDate && v.startDate <= today) return 'running';
  return 'planned';
}

function normalizeVersion(v, project, baseUrl, today) {
  const st = v.issuesStatusForFixVersion || {};
  const n = (x) => Number(x) || 0;
  return {
    id: String(v.id),
    name: String(v.name || ''),
    projectKey: project.key,
    projectName: project.name,
    startDate: v.startDate || '',
    releaseDate: v.releaseDate || '',
    status: versionStatus(v, today),
    issues: { toDo: n(st.toDo) + n(st.unmapped), inProgress: n(st.inProgress), done: n(st.done) },
    url: `${baseUrl}/projects/${encodeURIComponent(project.key)}/versions/${encodeURIComponent(v.id)}`
  };
}

// Upcoming: next release first, undated last. Released: newest first, undated last.
function splitReleases(versions) {
  const byDate = (dir) => (a, b) => {
    if (a.releaseDate !== b.releaseDate) {
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return dir * a.releaseDate.localeCompare(b.releaseDate);
    }
    return a.projectKey.localeCompare(b.projectKey) || a.name.localeCompare(b.name);
  };
  return {
    upcoming: versions.filter((v) => v.status !== 'released').sort(byDate(1)),
    released: versions.filter((v) => v.status === 'released').sort(byDate(-1))
  };
}

async function fetchReleases() {
  const { credentialsFile, projects } = getReleasesConfig();
  if (!credentialsFile) {
    return { state: 'unconfigured', message: "Keine JIRA-Zugangsdatei hinterlegt. Bitte 'sessionDashboard.releases.credentialsFile' in den Einstellungen pflegen." };
  }
  try {
    const { baseUrl, authString } = readCredentials(credentialsFile);
    const projectList = await fetchProjects(baseUrl, authString, projects);
    const today = localIsoDate(new Date());
    const perProject = await mapLimit(projectList, PARALLEL_PROJECTS, async (p) => {
      const path = `/rest/api/3/project/${encodeURIComponent(p.key)}/version`;
      const values = await fetchPaged(baseUrl, authString, path, [['expand', 'issuesstatus'], ['status', 'released,unreleased']]);
      return values.filter((v) => !v.archived).map((v) => normalizeVersion(v, p, baseUrl, today));
    });
    lastBaseUrl = baseUrl;
    return {
      state: 'ok',
      baseUrl,
      configuredProjects: projects,
      projectCount: projectList.length,
      fetchedAt: Date.now(),
      ...splitReleases(perProject.flat())
    };
  } catch (err) {
    return {
      state: err && err.isAuthError ? 'noAuth' : 'error',
      message: (err && err.message) || String(err)
    };
  }
}

module.exports = { fetchReleases, isJiraReleaseUrl, normalizeVersion, splitReleases, versionStatus };
