'use strict';

// Jenkins access via the JSON API with user + API token (Basic Auth): jobs, pipeline runs, starting builds.

const https = require('https');
const vscode = require('vscode');

const SECRET_KEY = 'sessionDashboard.jenkins.apiToken';
const FOLDER_DEPTH = 3;
// Downstream builds carry an UpstreamCause; the starting user sits in its nested upstreamCauses.
const CAUSE_DEPTH = 4;
const JOB_FIELDS = `name,fullName,url,color,description,buildable,lastBuild[number,result,timestamp,duration,building,actions[causes[upstreamProject,${causesTree(CAUSE_DEPTH)}]]],upstreamProjects[url],downstreamProjects[url]`;
const VIEW_FIELDS = 'name,url,description,jobs[url]';
const VIEWS_TREE = `views[${VIEW_FIELDS},views[${VIEW_FIELDS}]]`;
// Default/personal views are no pipelines.
const SKIP_VIEW_CLASS = /\.(AllView|MyView)$/;
const RUN_LIMIT = 5;
// Shared downstream jobs (e.g. killapps) also run for other pipelines, so look further back.
const DOWNSTREAM_BUILD_LIMIT = 100;
const BUILD_FIELDS = 'number,url,result,building,timestamp,duration,estimatedDuration,actions[causes[userId,userName,upstreamProject,upstreamBuild],parameters[name,value]]';
const PARAM_DEF_TREE = 'property[parameterDefinitions[name,type,description,choices,defaultParameterValue[value]]]';

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

function causesTree(depth) {
  return depth <= 0 ? 'userId' : `userId,upstreamCauses[${causesTree(depth - 1)}]`;
}

function jobsTree(depth) {
  return depth <= 0 ? `jobs[${JOB_FIELDS}]` : `jobs[${JOB_FIELDS},${jobsTree(depth - 1)}]`;
}

function collectCauseUserIds(causes, out) {
  for (const c of causes || []) {
    if (c && c.userId) out.add(String(c.userId));
    if (c && Array.isArray(c.upstreamCauses)) collectCauseUserIds(c.upstreamCauses, out);
  }
  return out;
}

function buildUserIds(actions) {
  const out = new Set();
  for (const a of actions || []) {
    if (a && Array.isArray(a.causes)) collectCauseUserIds(a.causes, out);
  }
  return [...out];
}

function buildUpstreamProjects(actions) {
  const out = new Set();
  for (const a of actions || []) {
    for (const c of (a && a.causes) || []) {
      if (c && c.upstreamProject) out.add(String(c.upstreamProject));
    }
  }
  return [...out];
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

function httpRequest(url, user, token, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const allHeaders = {
      ...headers,
      Authorization: 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64')
    };
    if (body !== null) allHeaders['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(url, { method, headers: allHeaders, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung bei der Jenkins-Anfrage.')));
    req.on('error', (err) => {
      if (err && TLS_ERROR_CODES.has(err.code)) {
        reject(new Error(`TLS-Zertifikat von Jenkins wird nicht vertraut (${err.code}). Prüfen, ob 'http.systemCertificates' aktiv ist und das Firmen-Root-Zertifikat im Windows-Zertifikatsspeicher liegt.`));
        return;
      }
      reject(err);
    });
    if (body !== null) req.write(body);
    req.end();
  });
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// For actions a 403 usually means missing permission or crumb, not wrong credentials.
function assertOk(res, isAction) {
  if (res.statusCode === 401 || (res.statusCode === 403 && !isAction)) {
    const err = new Error(`Zugriff verweigert (HTTP ${res.statusCode}). Bitte Jenkins-Benutzer und API-Token prüfen.`);
    err.isAuthError = true;
    throw err;
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const hint = isAction ? stripHtml(res.body).slice(0, 300) : '';
    throw new Error(`Jenkins antwortete mit HTTP ${res.statusCode}.${hint ? ' ' + hint : ''}`);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Ungültige JSON-Antwort von Jenkins.');
  }
}

async function requestJson(url, user, token) {
  const res = await httpRequest(url, user, token, { headers: { Accept: 'application/json' } });
  assertOk(res, false);
  return parseJson(res.body);
}

async function getAuth(secrets) {
  const { baseUrl, user } = getJenkinsConfig();
  const token = secrets ? await secrets.get(SECRET_KEY) : undefined;
  if (!parseBaseUrl(baseUrl) || !user || !token) {
    throw new Error('Jenkins ist nicht vollständig eingerichtet (https-URL, Benutzer und API-Token).');
  }
  return { baseUrl, user, token };
}

// The token is sent along, so only URLs of the configured Jenkins are requested.
function itemApiUrl(itemUrl, suffix) {
  if (!isJenkinsUrl(itemUrl)) throw new Error(`Die URL ${itemUrl} gehört nicht zur konfigurierten Jenkins-Instanz.`);
  return String(itemUrl).replace(/\/?$/, '/') + suffix;
}

// The crumb is bound to the session, so its cookie goes along with the POST.
async function postAction(auth, url, body, contentType) {
  const crumbRes = await httpRequest(`${auth.baseUrl}/crumbIssuer/api/json`, auth.user, auth.token, { headers: { Accept: 'application/json' } });
  const headers = { 'Content-Type': contentType, Accept: 'application/json' };
  if (crumbRes.statusCode !== 404) {
    assertOk(crumbRes, false);
    const crumb = parseJson(crumbRes.body);
    headers[crumb.crumbRequestField || 'Jenkins-Crumb'] = crumb.crumb;
    // Stapler @JavaScriptMethod calls validate the plain "Crumb" header.
    headers.Crumb = crumb.crumb;
    const cookies = [].concat(crumbRes.headers['set-cookie'] || []).map((c) => String(c).split(';')[0]).filter(Boolean);
    if (cookies.length) headers.Cookie = cookies.join('; ');
  }
  const res = await httpRequest(url, auth.user, auth.token, { method: 'POST', headers, body });
  assertOk(res, true);
  return res;
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
        duration: lb.duration || 0,
        building: Boolean(lb.building),
        userIds: buildUserIds(lb.actions),
        upstreamProjects: buildUpstreamProjects(lb.actions)
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

// Tree like the Build Pipeline view: first child continues the row, further children open a new row.
function layoutPipeline(jobUrls, byUrl) {
  const order = jobUrls.filter((u) => byUrl.has(u));
  const inSet = new Set(order);
  const rank = new Map(order.map((u, i) => [u, i]));
  const hasParent = new Set();
  for (const u of order) {
    for (const d of byUrl.get(u).downstream) {
      if (inSet.has(d) && d !== u) hasParent.add(d);
    }
  }
  const nodes = [];
  const seen = new Set();
  let rows = 0;
  const visit = (url, parent, col, row, ancestors) => {
    const id = nodes.length;
    nodes.push({ id, url, parent, col, row });
    seen.add(url);
    const kids = byUrl.get(url).downstream
      .filter((d) => inSet.has(d) && !ancestors.has(d))
      .sort((a, b) => rank.get(a) - rank.get(b));
    kids.forEach((k, i) => visit(k, id, col + 1, i === 0 ? row : rows++, new Set([...ancestors, k])));
  };
  for (const u of order) {
    if (!hasParent.has(u) && !seen.has(u)) visit(u, -1, 0, rows++, new Set([u]));
  }
  // Cycles without an entry point.
  for (const u of order) {
    if (!seen.has(u)) visit(u, -1, 0, rows++, new Set([u]));
  }
  return { nodes, rows };
}

function buildCauses(build) {
  const out = [];
  for (const a of (build && build.actions) || []) {
    if (a && Array.isArray(a.causes)) out.push(...a.causes.filter(Boolean));
  }
  return out;
}

function buildParams(build) {
  const out = [];
  for (const a of (build && build.actions) || []) {
    for (const p of (a && a.parameters) || []) {
      if (p && p.name) out.push({ name: String(p.name), value: p.value === undefined || p.value === null ? '' : String(p.value) });
    }
  }
  return out;
}

const RESULT_STATE = { SUCCESS: 'success', FAILURE: 'failed', UNSTABLE: 'unstable', ABORTED: 'aborted', NOT_BUILT: 'notbuilt' };

function compactBuild(b) {
  const userCause = buildCauses(b).find((c) => c.userId || c.userName);
  return {
    number: b.number,
    url: b.url || '',
    result: b.result || null,
    building: Boolean(b.building),
    timestamp: b.timestamp || 0,
    duration: b.duration || 0,
    estimatedDuration: b.estimatedDuration > 0 ? b.estimatedDuration : 0,
    user: userCause ? String(userCause.userName || userCause.userId) : ''
  };
}

function buildCell(b) {
  return { state: b.building ? 'running' : (RESULT_STATE[b.result] || 'unknown'), build: compactBuild(b) };
}

function isTriggeredBy(build, upstreamFullName, upstreamNumber) {
  return buildCauses(build).some((c) => c.upstreamProject === upstreamFullName && Number(c.upstreamBuild) === upstreamNumber);
}

// Runs = latest builds of the first job; downstream builds are matched via their UpstreamCause.
// infoByUrl: url -> { inQueue, builds (newest first), truncated }
function matchPipelineRuns(nodes, byUrl, infoByUrl, runLimit) {
  if (!nodes.length) return [];
  const rootInfo = infoByUrl.get(nodes[0].url) || { builds: [] };
  const runs = [];
  if (rootInfo.inQueue) {
    runs.push({
      number: null, url: '', timestamp: 0, queued: true, params: [],
      cells: nodes.map((n) => ({ state: n.id === 0 ? 'queued' : (n.parent === -1 ? 'none' : 'pending') }))
    });
  }
  rootInfo.builds.slice(0, runLimit).forEach((rootBuild, runIndex) => {
    const cells = [];
    for (const n of nodes) {
      if (n.parent === -1) {
        cells.push(n.id === 0 ? buildCell(rootBuild) : { state: 'none' });
        continue;
      }
      const parentCell = cells[n.parent];
      if (!parentCell.build) {
        const s = parentCell.state;
        cells.push({ state: s === 'none' || s === 'skipped' || s === 'unknown' ? s : 'pending' });
        continue;
      }
      const parent = parentCell.build;
      const info = infoByUrl.get(n.url) || { builds: [] };
      const own = info.builds.find((b) => isTriggeredBy(b, byUrl.get(nodes[n.parent].url).fullName, parent.number));
      if (own) {
        cells.push(buildCell(own));
      } else if (parent.building) {
        cells.push({ state: 'pending' });
      } else if (parent.result !== 'SUCCESS' && parent.result !== 'UNSTABLE') {
        cells.push({ state: 'skipped' });
      } else if (runIndex === 0 && info.inQueue) {
        cells.push({ state: 'queued' });
      } else if (info.truncated && info.builds.length && info.builds[info.builds.length - 1].timestamp > parent.timestamp) {
        cells.push({ state: 'unknown' });
      } else {
        cells.push({ state: 'manual' });
      }
    }
    runs.push({
      number: rootBuild.number,
      url: rootBuild.url || '',
      timestamp: rootBuild.timestamp || 0,
      queued: false,
      params: buildParams(rootBuild),
      cells
    });
  });
  return runs;
}

async function fetchPipelineRuns(secrets, pipeline, jobs) {
  const auth = await getAuth(secrets);
  const byUrl = new Map(jobs.map((j) => [j.url, j]));
  const { nodes, rows } = layoutPipeline(pipeline.jobUrls, byUrl);
  const rootUrl = nodes.length ? nodes[0].url : '';
  const urls = [...new Set(nodes.map((n) => n.url))];
  const infos = await Promise.all(urls.map(async (u) => {
    const limit = u === rootUrl ? RUN_LIMIT : DOWNSTREAM_BUILD_LIMIT;
    const tree = `inQueue,builds[${BUILD_FIELDS}]{0,${limit}}`;
    const data = await requestJson(itemApiUrl(u, `api/json?tree=${encodeURIComponent(tree)}`), auth.user, auth.token);
    const builds = Array.isArray(data && data.builds) ? data.builds : [];
    return [u, { inQueue: Boolean(data && data.inQueue), builds, truncated: builds.length >= limit }];
  }));
  return {
    fetchedAt: Date.now(),
    rows,
    manualTrigger: pipeline.source === 'view' && Boolean(pipeline.url),
    nodes: nodes.map((n) => {
      const j = byUrl.get(n.url);
      return {
        ...n,
        name: j.name,
        fullName: j.fullName,
        description: j.description,
        status: j.status,
        running: j.running,
        lastBuildNumber: j.lastBuild ? j.lastBuild.number : null
      };
    }),
    runs: matchPipelineRuns(nodes, byUrl, new Map(infos), RUN_LIMIT)
  };
}

async function fetchParameterDefinitions(auth, jobUrl) {
  const data = await requestJson(itemApiUrl(jobUrl, `api/json?tree=${encodeURIComponent(PARAM_DEF_TREE)}`), auth.user, auth.token);
  const defs = [];
  for (const prop of (data && data.property) || []) {
    for (const d of (prop && prop.parameterDefinitions) || []) {
      if (!d || !d.name) continue;
      const type = String(d.type || d._class || '');
      const password = /Password/i.test(type);
      const dv = d.defaultParameterValue ? d.defaultParameterValue.value : undefined;
      defs.push({
        name: String(d.name),
        type,
        description: stripHtml(d.description),
        choices: Array.isArray(d.choices) ? d.choices.map(String) : [],
        boolean: /Boolean/i.test(type),
        password,
        defaultValue: password || dv === undefined || dv === null ? undefined : String(dv)
      });
    }
  }
  return defs;
}

async function promptParameter(def, current, step) {
  const title = `Parameter ${step}: ${def.name}`;
  if (def.boolean || def.choices.length) {
    const options = def.choices.length ? def.choices : ['true', 'false'];
    const items = options.map((o) => ({ label: o, description: o === current ? 'aktuell' : '' }));
    const pick = await vscode.window.showQuickPick(items, { title, placeHolder: def.description || def.name, ignoreFocusOut: true });
    return pick ? pick.label : undefined;
  }
  return vscode.window.showInputBox({
    title,
    prompt: def.password ? `${def.description || def.name} (leer = Standardwert)` : (def.description || def.name),
    value: def.password ? '' : (current || ''),
    password: def.password,
    ignoreFocusOut: true
  });
}

function pipelineJobs(pipeline, jobs) {
  const byUrl = new Map(jobs.map((j) => [j.url, j]));
  return { byUrl, nodes: layoutPipeline(pipeline.jobUrls, byUrl).nodes };
}

// Starts the first job of the pipeline (with parameter dialog); returns false if cancelled.
async function startPipeline(secrets, pipeline, jobs) {
  const auth = await getAuth(secrets);
  const { byUrl, nodes } = pipelineJobs(pipeline, jobs);
  if (!nodes.length) throw new Error(`Pipeline „${pipeline.name}“ enthält keine Jobs.`);
  const job = byUrl.get(nodes[0].url);
  if (!job.buildable) throw new Error(`Der erste Job „${job.fullName}“ ist in Jenkins deaktiviert.`);
  const defs = await fetchParameterDefinitions(auth, job.url);
  const values = new Map(defs.map((d) => [d.name, d.defaultValue]));
  const START = 'Starten';
  const EDIT = 'Parameter anpassen…';
  for (;;) {
    const lines = defs.map((d) => `${d.name}: ${values.get(d.name) === undefined ? (d.password ? '(Standardwert)' : '–') : (d.password ? '••••' : values.get(d.name))}`);
    const detail = [`Erster Job: ${job.fullName}`, ...lines].join('\n');
    const choice = await vscode.window.showWarningMessage(`Pipeline „${pipeline.name}“ starten?`, { modal: true, detail }, ...(defs.length ? [START, EDIT] : [START]));
    if (choice === START) break;
    if (choice !== EDIT) return false;
    for (const [i, d] of defs.entries()) {
      const v = await promptParameter(d, values.get(d.name), `${i + 1}/${defs.length}`);
      if (v === undefined) break;
      values.set(d.name, d.password && v === '' ? undefined : v);
    }
  }
  if (defs.length) {
    const form = new URLSearchParams();
    for (const [name, value] of values) {
      if (value !== undefined) form.append(name, value);
    }
    await postAction(auth, itemApiUrl(job.url, 'buildWithParameters'), form.toString(), 'application/x-www-form-urlencoded');
  } else {
    await postAction(auth, itemApiUrl(job.url, 'build'), '', 'application/x-www-form-urlencoded');
  }
  vscode.window.showInformationMessage(`▶️ [🚀 Jenkins] ${job.fullName} gestartet – Pipeline „${pipeline.name}“ läuft an.`);
  return true;
}

// Manual downstream step like the ▷ button of the Build Pipeline view (BuildPipelineView#triggerManualBuild).
async function triggerPipelineStep(secrets, pipeline, jobs, { jobUrl, parentUrl, parentNumber }) {
  if (pipeline.source !== 'view' || !pipeline.url) {
    throw new Error('Manuelle Schritte lassen sich nur in Pipelines auslösen, die als Jenkins-View angelegt sind.');
  }
  const auth = await getAuth(secrets);
  const { byUrl } = pipelineJobs(pipeline, jobs);
  const job = byUrl.get(jobUrl);
  const parent = byUrl.get(parentUrl);
  const number = Number(parentNumber);
  if (!job || !parent || !pipeline.jobUrls.includes(jobUrl) || !pipeline.jobUrls.includes(parentUrl)
    || !parent.downstream.includes(jobUrl) || !Number.isInteger(number) || number <= 0) {
    throw new Error('Ungültiger Pipeline-Schritt – bitte Deploys aktualisieren.');
  }
  const choice = await vscode.window.showWarningMessage(
    `„${job.fullName}“ manuell auslösen?`,
    { modal: true, detail: `Pipeline: ${pipeline.name}\nVorgänger: ${parent.fullName} #${number}\nEntspricht dem ▷-Button in der Jenkins-Pipeline-Ansicht.` },
    'Auslösen'
  );
  if (choice !== 'Auslösen') return false;
  await postAction(
    auth,
    itemApiUrl(pipeline.url, 'triggerManualBuild'),
    JSON.stringify([number, job.fullName, parent.fullName]),
    'application/x-stapler-method-invocation;charset=UTF-8'
  );
  vscode.window.showInformationMessage(`▶️ [🚀 Jenkins] ${job.fullName} ausgelöst (nach ${parent.fullName} #${number}).`);
  return true;
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

module.exports = {
  fetchJenkinsJobs,
  fetchPipelineRuns,
  startPipeline,
  triggerPipelineStep,
  setJenkinsCredentials,
  isJenkinsUrl,
  getJenkinsConfig,
  flattenJobs,
  layoutPipeline,
  matchPipelineRuns
};
