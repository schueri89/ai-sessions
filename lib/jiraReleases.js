'use strict';

// Read-only Jira Cloud access to fix versions ("Lösungsversionen"); credentials come from a JSON file outside the repo.

const fs = require('fs');
const https = require('https');
const vscode = require('vscode');

const PAGE_SIZE = 50;
const PARALLEL_PROJECTS = 6;
const JQL_VERSION_CHUNK = 40;

let lastBaseUrl = '';

function getReleasesConfig() {
  const cfg = vscode.workspace.getConfiguration('sessionDashboard.releases');
  const projects = cfg.get('projects', []);
  const readyStatuses = cfg.get('readyStatuses', ['Ready for Live', 'Live']);
  return {
    credentialsFile: String(cfg.get('credentialsFile', '') || '').trim(),
    projects: (Array.isArray(projects) ? projects : []).map((p) => String(p || '').trim().toUpperCase()).filter(Boolean),
    readyStatuses: (Array.isArray(readyStatuses) ? readyStatuses : []).map((s) => String(s || '').trim()).filter(Boolean),
    developerField: String(cfg.get('developerField', '') || '').trim()
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

// ISO 8601 calendar week (Monday to Sunday) of a YYYY-MM-DD date.
function isoWeek(iso) {
  if (!iso) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const monday = new Date(day);
  monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / 604800000) + 1;
  const fmt = (x) => `${pad(x.getUTCDate())}.${pad(x.getUTCMonth() + 1)}.`;
  return {
    key: `${year}-W${pad(week)}`,
    label: `KW ${week}/${year} · ${fmt(monday)}–${fmt(sunday)}${sunday.getUTCFullYear()}`
  };
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
    week: isoWeek(v.releaseDate || ''),
    status: versionStatus(v, today),
    issues: { toDo: n(st.toDo) + n(st.unmapped), inProgress: n(st.inProgress), done: n(st.done) },
    url: `${baseUrl}/projects/${encodeURIComponent(project.key)}/versions/${encodeURIComponent(v.id)}`
  };
}

// Green = done category or one of the configured "ready" statuses (e.g. Ready for Live).
function issueBucket(status, readySet) {
  const category = status.statusCategory && status.statusCategory.key;
  if (category === 'done' || readySet.has(String(status.name || '').toLowerCase())) return 'done';
  if (category === 'indeterminate') return 'inProgress';
  return 'toDo';
}

function countIssueProgress(issues, versionIds, readyStatuses) {
  const ready = new Set(readyStatuses.map((s) => s.toLowerCase()));
  const counts = new Map(versionIds.map((id) => [id, { toDo: 0, inProgress: 0, done: 0 }]));
  for (const issue of issues) {
    const fields = issue.fields || {};
    const bucket = issueBucket(fields.status || {}, ready);
    for (const fv of fields.fixVersions || []) {
      const c = counts.get(String(fv.id));
      if (c) c[bucket]++;
    }
  }
  return counts;
}

async function searchIssues(baseUrl, authString, jql, fields) {
  const issues = [];
  let token = '';
  do {
    const qs = new URLSearchParams([['jql', jql], ['fields', fields], ['maxResults', '100']]);
    if (token) qs.set('nextPageToken', token);
    const page = await requestJson(`${baseUrl}/rest/api/3/search/jql?${qs}`, authString);
    issues.push(...(page.issues || []));
    token = page.isLast === true ? '' : String(page.nextPageToken || '');
  } while (token);
  return issues;
}

async function fetchVersionIssues(baseUrl, authString, versionIds) {
  const issues = [];
  for (let i = 0; i < versionIds.length; i += JQL_VERSION_CHUNK) {
    const jql = `fixVersion in (${versionIds.slice(i, i + JQL_VERSION_CHUNK).join(',')})`;
    issues.push(...await searchIssues(baseUrl, authString, jql, 'status,fixVersions'));
  }
  return issues;
}

function userNames(value) {
  return [].concat(value || []).map((u) => String((u && u.displayName) || '')).filter(Boolean);
}

function normalizeIssue(issue, baseUrl, readySet, developerField) {
  const f = issue.fields || {};
  const status = f.status || {};
  const key = String(issue.key || '');
  return {
    key,
    summary: String(f.summary || ''),
    type: f.issuetype ? String(f.issuetype.name || '') : '',
    developers: userNames(f[developerField]),
    status: String(status.name || ''),
    bucket: issueBucket(status, readySet),
    url: `${baseUrl}/browse/${encodeURIComponent(key)}`
  };
}

async function fetchReleaseIssues(versionId) {
  const { credentialsFile, readyStatuses, developerField } = getReleasesConfig();
  try {
    const id = String(versionId || '');
    if (!/^\d+$/.test(id)) throw new Error(`Ungültige Versions-ID: ${id}`);
    if (!credentialsFile) throw new Error("Keine JIRA-Zugangsdatei hinterlegt ('sessionDashboard.releases.credentialsFile').");
    if (!/^[\w.-]+$/.test(developerField)) throw new Error("Ungültiges Entwickler-Feld in 'sessionDashboard.releases.developerField' (z. B. customfield_10055).");
    const { baseUrl, authString } = readCredentials(credentialsFile);
    const ready = new Set(readyStatuses.map((s) => s.toLowerCase()));
    const issues = await searchIssues(baseUrl, authString, `fixVersion = ${id} ORDER BY key ASC`, `summary,status,issuetype,${developerField}`);
    lastBaseUrl = baseUrl;
    return { state: 'ok', issues: issues.map((i) => normalizeIssue(i, baseUrl, ready, developerField)) };
  } catch (err) {
    return { state: 'error', message: (err && err.message) || String(err) };
  }
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
  const { credentialsFile, projects, readyStatuses } = getReleasesConfig();
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
    const versions = perProject.flat();
    // Released versions keep Jira's category counts; only open ones are recounted per status.
    const open = versions.filter((v) => v.status !== 'released');
    if (open.length) {
      const ids = open.map((v) => v.id);
      const counts = countIssueProgress(await fetchVersionIssues(baseUrl, authString, ids), ids, readyStatuses);
      open.forEach((v) => { v.issues = counts.get(v.id); });
    }
    lastBaseUrl = baseUrl;
    return {
      state: 'ok',
      baseUrl,
      configuredProjects: projects,
      readyStatuses,
      currentWeek: isoWeek(today).key,
      projectCount: projectList.length,
      fetchedAt: Date.now(),
      ...splitReleases(versions)
    };
  } catch (err) {
    return {
      state: err && err.isAuthError ? 'noAuth' : 'error',
      message: (err && err.message) || String(err)
    };
  }
}

module.exports = { fetchReleases, fetchReleaseIssues, isJiraReleaseUrl, normalizeVersion, splitReleases, versionStatus, isoWeek, countIssueProgress };
