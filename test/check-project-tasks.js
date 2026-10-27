'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { stripJsonComments, parseTasksFile, scanProjectTasks } = require('../lib/projectTasks');

console.log('Testing lib/projectTasks.js (JSONC parser, task discovery & top-level heuristics)...');

// 1. JSONC comment stripper tests
const jsoncWithComments = `
{
  // This is a line comment
  "name": "test-project",
  /* Block comment
     spanning multiple lines */
  "url": "https://lucee.schueri.de/api", // Trailing line comment with URL
  "nested": {
    "key": "value /* not a comment */ // still inside string",
    "number": 42,
  },
}
`;

const cleaned = stripJsonComments(jsoncWithComments);
let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (e) {
  assert.fail(`stripJsonComments produced invalid JSON: ${e.message}\nOutput:\n${cleaned}`);
}

assert.strictEqual(parsed.name, 'test-project', 'Property "name" should be parsed correctly');
assert.strictEqual(parsed.url, 'https://lucee.schueri.de/api', 'URL with slashes should NOT be stripped');
assert.strictEqual(parsed.nested.key, 'value /* not a comment */ // still inside string', 'String containing comment tokens should be preserved');
assert.strictEqual(parsed.nested.number, 42, 'Trailing commas should be handled properly');
console.log('✓ stripJsonComments: successfully stripped comments while preserving strings & handled trailing commas');

// 2. Real projects task parsing
const rootDir = 'c:\\lucee\\tomcat\\webapps\\ROOT';
const autoHubTasksFile = path.join(rootDir, 'auto-hub', '.vscode', 'tasks.json');

if (fs.existsSync(autoHubTasksFile)) {
  const tasks = parseTasksFile(autoHubTasksFile, 'auto-hub');
  assert(Array.isArray(tasks) && tasks.length > 0, 'auto-hub should have parsed tasks');

  const wlanTask = tasks.find((t) => t.label === 'APK bauen (WLAN)');
  assert(wlanTask, 'Task "APK bauen (WLAN)" should be found');
  assert.strictEqual(wlanTask.isTopLevel, true, '"APK bauen (WLAN)" should be top-level');
  assert.strictEqual(wlanTask.isBuild, true, '"APK bauen (WLAN)" group.kind is build');
  assert.strictEqual(wlanTask.isDefault, true, '"APK bauen (WLAN)" is default build task');
  assert(wlanTask.dependsOn.length > 0, '"APK bauen (WLAN)" has dependsOn steps');

  const prodTask = tasks.find((t) => t.label === 'APK bauen (PROD)');
  assert(prodTask, 'Task "APK bauen (PROD)" should be found');
  assert.strictEqual(prodTask.isTopLevel, true, '"APK bauen (PROD)" should be top-level (has dependsOn)');

  const stepTask = tasks.find((t) => t.label === 'APK 1/5 – Web-Build (nativ, WLAN)');
  assert(stepTask, 'Step task "APK 1/5 – Web-Build (nativ, WLAN)" should be found');
  assert.strictEqual(stepTask.isTopLevel, false, 'Step task referenced in dependsOn should NOT be top-level');

  const iconTask = tasks.find((t) => t.label === 'App-Icons neu zeichnen');
  assert(iconTask, 'Standalone task "App-Icons neu zeichnen" should be found');
  assert.strictEqual(iconTask.isTopLevel, true, 'Standalone utility task should be top-level');

  console.log(`✓ auto-hub: parsed ${tasks.length} tasks successfully with correct isTopLevel classification`);
}

// 3. Scan all project tasks
const allTasks = scanProjectTasks(rootDir);
assert(Array.isArray(allTasks), 'scanProjectTasks should return an array');
assert(allTasks.length > 0, 'Should discover tasks across projects in ROOT');

const projectsWithTasks = new Set(allTasks.map((t) => t.project));
assert(projectsWithTasks.has('auto-hub'), 'Should include auto-hub');
assert(projectsWithTasks.has('smartwatch-app'), 'Should include smartwatch-app');

const topLevelCount = allTasks.filter((t) => t.isTopLevel).length;
const subtaskCount = allTasks.filter((t) => !t.isTopLevel).length;

console.log(`✓ scanProjectTasks: found ${allTasks.length} tasks across ${projectsWithTasks.size} projects (${topLevelCount} Top-Level, ${subtaskCount} Teilschritte)`);

// 4. ProjectTasksManager test with mocked VS Code globalState
const { ProjectTasksManager } = require('../lib/projectTasks');

const mockStorage = {};
const mockGlobalState = {
  get: (key, def) => (key in mockStorage ? mockStorage[key] : def),
  update: (key, val) => {
    mockStorage[key] = val;
    return Promise.resolve();
  }
};

const manager = new ProjectTasksManager({ globalState: mockGlobalState });
manager.refresh();

const tasksList = manager.getAllTasks();
assert(tasksList.length > 0, 'manager.getAllTasks should return parsed tasks');

const sampleTask = tasksList[0];
assert(sampleTask.id, 'Task must have an id');
assert.strictEqual(sampleTask.state.status, 'idle', 'Initial task state should be idle');

let changeFired = false;
manager.onDidChange((taskId, state) => {
  if (taskId === sampleTask.id && state.status === 'running') {
    changeFired = true;
  }
});

manager.updateTaskState(sampleTask.id, { status: 'running', lastRun: Date.now() });
assert.strictEqual(changeFired, true, 'onDidChange event must fire on updateTaskState');
assert.strictEqual(manager.getTask(sampleTask.id).state.status, 'running', 'getTask state should reflect update');
assert(mockStorage['sessionDashboard.projectTaskStates'][sampleTask.id], 'State should be persisted to globalState');

// 5. Favorites handling and persistence
assert.strictEqual(manager.isFavorite(sampleTask.id), false, 'Initially task should not be a favorite');
assert.strictEqual(sampleTask.isFavorite, false, 'Task in list initially isFavorite false');

const toggled = manager.toggleFavorite(sampleTask.id);
assert.strictEqual(toggled, true, 'toggleFavorite should return true when added');
assert.strictEqual(manager.isFavorite(sampleTask.id), true, 'isFavorite should return true');
assert.strictEqual(manager.getTask(sampleTask.id).isFavorite, true, 'getTask().isFavorite should be true');
assert(Array.isArray(mockStorage['sessionDashboard.favoriteTasks']), 'Favorites array should be in globalState');
assert(mockStorage['sessionDashboard.favoriteTasks'].includes(sampleTask.id), 'taskId should be persisted in favorites');

const untoggled = manager.toggleFavorite(sampleTask.id);
assert.strictEqual(untoggled, false, 'toggleFavorite should return false when removed');
assert.strictEqual(manager.isFavorite(sampleTask.id), false, 'isFavorite should return false after removal');
assert(!mockStorage['sessionDashboard.favoriteTasks'].includes(sampleTask.id), 'taskId should be removed from favorites');

console.log('✓ ProjectTasksManager: state tracking, persistence and change listeners verified');
console.log('✓ ProjectTasksManager: favorites toggling and globalState persistence verified');
console.log('All check-project-tasks tests passed successfully!');
