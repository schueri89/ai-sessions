'use strict';

// "Meine Vorgänge": the developer's own JIRA issues grouped by status; read-only, same credentials as the Releases tab.

const vscode = require('vscode');
const { getReleasesConfig, readCredentials, requestJson, searchIssues, issueBucket, userNames } = require('./jiraReleases');

const CATEGORY_ORDER = { new: 0, indeterminate: 1, done: 2 };
const ACCOUNT_ID_RE = /^[A-Za-z0-9:_-]+$/;

let lastBaseUrl = '';
const accountCache = new Map();

function getMyIssuesConfig() {
  const cfg = vscode.workspace.getConfiguration('sessionDashboard.myIssues');
  const statusOrder = cfg.get('statusOrder', []);
  return {
    user: String(cfg.get('user', '') || '').trim(),
    jql: String(cfg.get('jql', '') || '').trim(),
    statusOrder: (Array.isArray(statusOrder) ? statusOrder : []).map((s) => String(s || '').trim()).filter(Boolean)
  };
}

function isMyIssuesUrl(url) {
  if (!lastBaseUrl) return false;
  try {
    return new URL(url).origin === new URL(lastBaseUrl).origin;
  } catch {
    return false;
  }
}

// JQL addresses custom fields as cf[12345], the REST API as customfield_12345.
function jqlFieldName(fieldId) {
  const m = /^customfield_(\d+)$/.exec(fieldId);
  if (!m) {
    throw new Error(`Das Entwickler-Feld '${fieldId}' muss die Form customfield_12345 haben ('sessionDashboard.releases.developerField').`);
  }
  return `cf[${m[1]}]`;
}

function buildJql(template, accountId, developerField) {
  if (!ACCOUNT_ID_RE.test(accountId)) throw new Error(`Ungültige JIRA-Account-ID: ${accountId}`);
  let jql = template.split('{user}').join(`"${accountId}"`);
  if (jql.includes('{developerField}')) jql = jql.split('{developerField}').join(jqlFieldName(developerField));
  return jql;
}

async function resolveAccount(baseUrl, authString, user) {
  const cacheKey = `${baseUrl}|${user.toLowerCase()}`;
  if (accountCache.has(cacheKey)) return accountCache.get(cacheKey);
  let found;
  if (user.includes('@')) {
    const qs = new URLSearchParams([['query', user], ['maxResults', '10']]);
    const users = [].concat(await requestJson(`${baseUrl}/rest/api/3/user/search?${qs}`, authString) || []).filter((u) => u && u.accountId);
    const exact = users.filter((u) => String(u.emailAddress || '').toLowerCase() === user.toLowerCase());
    const candidates = exact.length ? exact : users;
    if (candidates.length !== 1) {
      throw new Error(candidates.length
        ? `Mehrere JIRA-Benutzer passen zu '${user}' (${candidates.map((u) => u.displayName).join(', ')}). Bitte die Account-ID in 'sessionDashboard.myIssues.user' eintragen.`
        : `Kein JIRA-Benutzer zu '${user}' gefunden. Bitte E-Mail-Adresse oder Account-ID in 'sessionDashboard.myIssues.user' prüfen.`);
    }
    found = candidates[0];
  } else {
    if (!ACCOUNT_ID_RE.test(user)) throw new Error(`'${user}' ist weder eine E-Mail-Adresse noch eine JIRA-Account-ID ('sessionDashboard.myIssues.user').`);
    found = await requestJson(`${baseUrl}/rest/api/3/user?${new URLSearchParams([['accountId', user]])}`, authString);
  }
  const account = { accountId: String(found.accountId), displayName: String(found.displayName || user) };
  accountCache.set(cacheKey, account);
  return account;
}

function normalizeMyIssue(issue, baseUrl, readySet, developerField, accountId) {
  const f = issue.fields || {};
  const status = f.status || {};
  const key = String(issue.key || '');
  const roles = [];
  if (f.assignee && f.assignee.accountId === accountId) roles.push('Bearbeiter');
  if ([].concat(f[developerField] || []).some((u) => u && u.accountId === accountId)) roles.push('Entwickler');
  return {
    key,
    summary: String(f.summary || ''),
    type: f.issuetype ? String(f.issuetype.name || '') : '',
    priority: f.priority ? String(f.priority.name || '') : '',
    projectKey: f.project ? String(f.project.key || '') : key.split('-')[0],
    projectName: f.project ? String(f.project.name || '') : '',
    status: String(status.name || ''),
    category: String((status.statusCategory && status.statusCategory.key) || 'new'),
    bucket: issueBucket(status, readySet),
    fixVersions: (f.fixVersions || []).map((v) => String((v && v.name) || '')).filter(Boolean),
    assignee: f.assignee ? String(f.assignee.displayName || '') : '',
    developers: userNames(f[developerField]),
    roles,
    updated: Date.parse(f.updated || '') || 0,
    url: `${baseUrl}/browse/${encodeURIComponent(key)}`
  };
}

// Configured statuses first (in their order), then To Do -> In Progress -> Done, then alphabetically.
function groupByStatus(issues, statusOrder) {
  const order = new Map(statusOrder.map((s, i) => [s.toLowerCase(), i]));
  const columns = new Map();
  for (const issue of issues) {
    const k = issue.status.toLowerCase();
    if (!columns.has(k)) columns.set(k, { status: issue.status, category: issue.category, bucket: issue.bucket, issues: [] });
    columns.get(k).issues.push(issue);
  }
  const rank = (c) => (order.has(c.status.toLowerCase()) ? order.get(c.status.toLowerCase()) : statusOrder.length);
  const cat = (c) => (c.category in CATEGORY_ORDER ? CATEGORY_ORDER[c.category] : 1);
  return [...columns.values()].sort((a, b) => rank(a) - rank(b) || cat(a) - cat(b) || a.status.localeCompare(b.status));
}

async function fetchMyIssues() {
  const { credentialsFile, developerField, readyStatuses } = getReleasesConfig();
  const { user, jql, statusOrder } = getMyIssuesConfig();
  if (!credentialsFile) {
    return { state: 'unconfigured', message: "Keine JIRA-Zugangsdatei hinterlegt. Bitte 'sessionDashboard.releases.credentialsFile' in den Einstellungen pflegen." };
  }
  if (!user) {
    return { state: 'unconfigured', message: "Kein JIRA-Benutzer hinterlegt. Bitte deine E-Mail-Adresse oder Account-ID in 'sessionDashboard.myIssues.user' eintragen." };
  }
  if (!jql) {
    return { state: 'unconfigured', message: "Keine JQL-Abfrage hinterlegt ('sessionDashboard.myIssues.jql')." };
  }
  try {
    if (!/^[\w.-]+$/.test(developerField)) throw new Error("Ungültiges Entwickler-Feld in 'sessionDashboard.releases.developerField' (z. B. customfield_10055).");
    const { baseUrl, authString } = readCredentials(credentialsFile);
    const account = await resolveAccount(baseUrl, authString, user);
    const query = buildJql(jql, account.accountId, developerField);
    const fields = `summary,status,issuetype,priority,project,fixVersions,updated,assignee,${developerField}`;
    const ready = new Set(readyStatuses.map((s) => s.toLowerCase()));
    const issues = (await searchIssues(baseUrl, authString, query, fields))
      .map((i) => normalizeMyIssue(i, baseUrl, ready, developerField, account.accountId));
    lastBaseUrl = baseUrl;
    return {
      state: 'ok',
      baseUrl,
      user: account.displayName,
      jql: query,
      total: issues.length,
      fetchedAt: Date.now(),
      columns: groupByStatus(issues, statusOrder)
    };
  } catch (err) {
    return {
      state: err && err.isAuthError ? 'noAuth' : 'error',
      message: (err && err.message) || String(err)
    };
  }
}

module.exports = { fetchMyIssues, isMyIssuesUrl, buildJql, groupByStatus, normalizeMyIssue };
