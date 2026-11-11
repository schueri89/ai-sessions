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
  assert.strictEqual(prodTask.isBuild, true, '"APK bauen (PROD)" should be classified as build task via label heuristic');
  assert.strictEqual(prodTask.isDefault, false, '"APK bauen (PROD)" is not default build task');

  const devWebTask = tasks.find((t) => t.label === 'Web-Build (DEV)');
  assert(devWebTask, 'Task "Web-Build (DEV)" should be found');
  assert.strictEqual(devWebTask.isBuild, true, '"Web-Build (DEV)" should be classified as build task via label heuristic');
  assert.strictEqual(devWebTask.isDefault, false, '"Web-Build (DEV)" is not default build task');

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

const manager = new ProjectTasksManager({ globalState: mockGlobalState }, { rootDir });
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

// 6. notifyTaskCompletion test (sound & notifications debouncing)
let playedSound = null;
const mockSoundNotifier = {
  playSound: (type) => { playedSound = type; }
};

const managerWithSound = new ProjectTasksManager(
  { globalState: mockGlobalState },
  { soundNotifier: mockSoundNotifier }
);
managerWithSound.refresh();

assert.strictEqual(typeof managerWithSound.notifyTaskCompletion, 'function', 'notifyTaskCompletion method must exist');
assert.strictEqual(typeof managerWithSound.showTerminal, 'function', 'showTerminal method must exist');

// Test success completion
managerWithSound.notifyTaskCompletion(sampleTask.id, { isSuccess: true, durationMs: 12500 });
assert.strictEqual(playedSound, 'taskCompleted', 'taskCompleted sound should be triggered on task success');

// Test failure completion (different taskId to avoid debounce)
playedSound = null;
managerWithSound.notifyTaskCompletion('fail-task-id', { isSuccess: false, exitCode: 1 });
assert.strictEqual(playedSound, 'taskFailed', 'taskFailed sound should be triggered on task failure');

// Test debounce
playedSound = null;
managerWithSound.notifyTaskCompletion(sampleTask.id, { isSuccess: true, durationMs: 13000 });
assert.strictEqual(playedSound, null, 'Rapid subsequent completion call should be debounced within 2000ms');

console.log('✓ ProjectTasksManager: notifyTaskCompletion sound triggering (success & fail) and debouncing verified');

// 7. Progress Notification & Cancellation Hook
let withProgressCalled = false;
let progressOpts = null;
let fakeToken = null;
let fakeProgressMessages = [];

const fakeVscode = {
  ProgressLocation: { Notification: 15 },
  workspace: {
    getConfiguration: () => ({
      get: (key, def) => def
    })
  },
  window: {
    withProgress: (opts, task) => {
      withProgressCalled = true;
      progressOpts = opts;
      const fakeProgress = {
        report: (msg) => fakeProgressMessages.push(msg)
      };
      fakeToken = {
        onCancellationRequested: (cb) => {
          fakeToken._onCancel = cb;
        }
      };
      return task(fakeProgress, fakeToken);
    }
  }
};

const progressTasksManager = new ProjectTasksManager(
  { globalState: mockGlobalState },
  { vscode: fakeVscode }
);

let terminateCalled = false;
const fakeExecution = {
  terminate: () => { terminateCalled = true; }
};

progressTasksManager.startTaskProgressNotification('test-task-1', { project: 'ai-sessions', label: 'Build APK' }, fakeExecution, null);

assert.strictEqual(withProgressCalled, true, 'withProgress must be called when task progress is enabled');
assert.strictEqual(progressOpts.cancellable, true, 'Task progress notification must be cancellable');
assert(progressOpts.title.includes('ai-sessions') && progressOpts.title.includes('Build APK'), 'Title must include project and task label');
assert(progressTasksManager.runningTaskProgress.has('test-task-1'), 'Task must be registered in runningTaskProgress');

// Test cancellation
fakeToken._onCancel();
assert.strictEqual(terminateCalled, true, 'Cancellation must call execution.terminate()');

// Test finish
progressTasksManager.startTaskProgressNotification('test-task-2', { project: 'ai-sessions', label: 'Compile' }, null, null);
assert(progressTasksManager.runningTaskProgress.has('test-task-2'), 'test-task-2 must be running');
progressTasksManager.finishTaskProgressNotification('test-task-2');
assert(!progressTasksManager.runningTaskProgress.has('test-task-2'), 'test-task-2 must be cleared on finish');
progressTasksManager.dispose();
console.log('✓ ProjectTasksManager: task progress notification & cancellation verified');

// 8. Migration of previously saved 'idle' states with lastRun to 'success'
const migrationStorage = {
  'sessionDashboard.projectTaskStates': {
    'ai-hub:APK bauen (PROD)': {
      status: 'idle',
      lastRun: Date.now() - 60000,
      lastDurationMs: 24000,
      lastExitCode: 0
    },
    'ai-hub:Failed Task': {
      status: 'idle',
      lastRun: Date.now() - 120000,
      lastDurationMs: 5000,
      lastExitCode: 1,
      error: 'Fehler'
    },
    'ai-hub:Never Run Task': {
      status: 'idle'
    }
  }
};
const migrationGlobalState = {
  get: (key, def) => (key in migrationStorage ? migrationStorage[key] : def),
  update: (key, val) => {
    migrationStorage[key] = val;
    return Promise.resolve();
  }
};

const migrationManager = new ProjectTasksManager({ globalState: migrationGlobalState });
assert.strictEqual(
  migrationManager.taskStates.get('ai-hub:APK bauen (PROD)').status,
  'success',
  'Successful task previously stored with status idle must be migrated to success'
);
assert.strictEqual(
  migrationManager.taskStates.get('ai-hub:Failed Task').status,
  'idle',
  'Failed task must not be migrated to success'
);
assert.strictEqual(
  migrationManager.taskStates.get('ai-hub:Never Run Task').status,
  'idle',
  'Never run task must remain idle'
);
assert.strictEqual(
  migrationStorage['sessionDashboard.projectTaskStates']['ai-hub:APK bauen (PROD)'].status,
  'success',
  'Migrated status must be persisted to globalState'
);
console.log('✓ ProjectTasksManager: state migration from idle (with successful lastRun) to success verified');

// 9. Composite task lifecycle & subtask error propagation
let startListener = null;
let endProcListener = null;
let endTaskListener = null;

const fakeVsWithEvents = {
  ProgressLocation: { Notification: 15 },
  workspace: {
    getConfiguration: () => ({
      get: (key, def) => def
    })
  },
  window: {
    withProgress: () => Promise.resolve(),
    showInformationMessage: () => Promise.resolve(),
    showErrorMessage: () => Promise.resolve()
  },
  tasks: {
    onDidStartTask: (cb) => { startListener = cb; return { dispose: () => {} }; },
    onDidEndTaskProcess: (cb) => { endProcListener = cb; return { dispose: () => {} }; },
    onDidEndTask: (cb) => { endTaskListener = cb; return { dispose: () => {} }; }
  }
};

const compositeStorage = {};
const compositeGlobalState = {
  get: (key, def) => (key in compositeStorage ? compositeStorage[key] : def),
  update: (key, val) => { compositeStorage[key] = val; return Promise.resolve(); }
};

const eventManager = new ProjectTasksManager(
  { globalState: compositeGlobalState, subscriptions: [] },
  { vscode: fakeVsWithEvents }
);
eventManager.init();

// Set up mock tasks: 1 composite parent task, 1 subtask
eventManager.tasks = [
  {
    id: 'test-hub:Composite Build',
    project: 'test-hub',
    label: 'Composite Build',
    dependsOn: ['Step 1'],
    isTopLevel: true
  },
  {
    id: 'test-hub:Step 1',
    project: 'test-hub',
    label: 'Step 1',
    isTopLevel: false
  }
];

// Test 9a: Successful composite task execution
const parentExec1 = { task: { name: 'Composite Build', scope: { name: 'test-hub' } } };
const subExec1 = { task: { name: 'Step 1', scope: { name: 'test-hub' } } };

// Start parent
startListener({ execution: parentExec1 });
assert.strictEqual(eventManager.taskStates.get('test-hub:Composite Build').status, 'running');

// Start subtask
startListener({ execution: subExec1 });
assert.strictEqual(eventManager.taskStates.get('test-hub:Step 1').status, 'running');

// Subtask finishes with exitCode 0
endProcListener({ execution: subExec1, exitCode: 0 });
assert.strictEqual(eventManager.taskStates.get('test-hub:Step 1').status, 'success');

// Parent finishes via onDidEndTask (no process event for composite task)
endTaskListener({ execution: parentExec1 });
assert.strictEqual(
  eventManager.taskStates.get('test-hub:Composite Build').status,
  'success',
  'Composite parent task must end with status success when subtasks succeed'
);
assert.strictEqual(
  eventManager.taskStates.get('test-hub:Composite Build').lastExitCode,
  0,
  'lastExitCode must be 0'
);
console.log('✓ ProjectTasksManager: composite task successfully completes with status success via onDidEndTask');

// Test 9b: Composite task with failing subtask
const parentExec2 = { task: { name: 'Composite Build', scope: { name: 'test-hub' } } };
const subExec2 = { task: { name: 'Step 1', scope: { name: 'test-hub' } } };

startListener({ execution: parentExec2 });
startListener({ execution: subExec2 });

// Subtask fails with exitCode 1
endProcListener({ execution: subExec2, exitCode: 1 });
assert.strictEqual(eventManager.taskStates.get('test-hub:Step 1').status, 'error');

// Parent finishes
endTaskListener({ execution: parentExec2 });
assert.strictEqual(
  eventManager.taskStates.get('test-hub:Composite Build').status,
  'error',
  'Composite parent task must end with status error when a subtask fails'
);
assert.strictEqual(
  eventManager.taskStates.get('test-hub:Composite Build').lastExitCode,
  1,
  'Composite task must have exitCode 1 on subtask failure'
);
assert(
  eventManager.taskStates.get('test-hub:Composite Build').error.includes('Step 1'),
  'Error message must reference failing subtask'
);
console.log('✓ ProjectTasksManager: composite task subtask failure propagation verified');

eventManager.dispose();

console.log('All check-project-tasks tests passed successfully!');
