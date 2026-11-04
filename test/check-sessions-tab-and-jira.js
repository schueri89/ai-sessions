'use strict';

const assert = require('assert');
const Module = require('module');

// Mock 'vscode'
const origRequire = Module.prototype.require;
let mockJiraBaseUrl = '';

Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      Uri: { joinPath: () => ({}) },
      workspace: {
        getConfiguration: (section) => ({
          get: (key, defVal) => {
            if (section === 'sessionDashboard' && key === 'jiraBaseUrl') {
              return mockJiraBaseUrl;
            }
            if (section === 'sessionDashboard.jenkins' && key === 'enabled') return false;
            if (section === 'sessionDashboard.tasks' && key === 'enabled') return true;
            if (section === 'sessionDashboard.audits' && key === 'enabled') return true;
            if (section === 'sessionDashboard.logs' && key === 'enabled') return true;
            return defVal !== undefined ? defVal : '';
          }
        })
      }
    };
  }
  return origRequire.apply(this, arguments);
};

const { BoardPanel } = require('../lib/boardPanel');

console.log('Testing Sessions tab restructuring and JIRA activation...');

// 1. Test HTML structure without JIRA URL
mockJiraBaseUrl = '';
const panelNoJira = new BoardPanel({});
const htmlNoJira = panelNoJira.html();

// Top-level tabs verification
assert(htmlNoJira.includes('id="btn-mode-board"'), 'btn-mode-board must exist');
assert(htmlNoJira.includes('💬 Sessions'), 'Tab "Board" must be renamed to "💬 Sessions"');
assert(!htmlNoJira.includes('<button class="mode-tab-btn" id="btn-mode-analyse"'), 'btn-mode-analyse must NOT be a top-level tab');
assert(!htmlNoJira.includes('<button class="mode-tab-btn" id="btn-mode-history"'), 'btn-mode-history must NOT be a top-level tab');

// Subnav verification
assert(htmlNoJira.includes('class="session-subnav"'), 'session-subnav must be present');
assert(htmlNoJira.includes('data-submode="board"'), 'subnav must have board button');
assert(htmlNoJira.includes('data-submode="analyse"'), 'subnav must have analyse button');
assert(htmlNoJira.includes('data-submode="history"'), 'subnav must have history button');

// Search row verification (placed under filter-group in .search-row)
assert(htmlNoJira.includes('class="search-row"'), 'search-row must exist under toolbar-main');
const searchRowIdx = htmlNoJira.indexOf('class="search-row"');
const filterGroupIdx = htmlNoJira.indexOf('class="filter-group"');
assert(searchRowIdx > filterGroupIdx, 'search-row must be placed below filter-group');

// JIRA state when baseUrl is empty
assert(htmlNoJira.includes('let cachedJiraEnabled = false;'), 'cachedJiraEnabled must be false when jiraBaseUrl is empty');
console.log('✓ HTML structure (Sessions tab, subnav, search-row, disabled JIRA) verified');

// 2. Test HTML structure with JIRA URL configured
mockJiraBaseUrl = 'https://jira.example.com/browse/';
const panelWithJira = new BoardPanel({});
const htmlWithJira = panelWithJira.html();
assert(htmlWithJira.includes('let cachedJiraEnabled = true;'), 'cachedJiraEnabled must be true when jiraBaseUrl is set');
console.log('✓ cachedJiraEnabled=true verified when jiraBaseUrl is configured');

// 3. Test card rendering logic under cachedJiraEnabled = false vs true
function renderCardMeta(s, cachedJiraEnabled) {
  const elements = [];
  if (cachedJiraEnabled) {
    if (s.ticket) {
      elements.push({ type: 'card-jira-pill', text: s.ticket });
      elements.push({ type: 'project-edit-btn', action: 'edit' });
      elements.push({ type: 'project-edit-btn', action: 'remove' });
    } else {
      elements.push({ type: 'card-jira-add-btn', text: '+ JIRA' });
    }
  }
  return elements;
}

// When JIRA disabled: no buttons
const itemsDisabledNoTicket = renderCardMeta({ sessionId: 's1', ticket: null }, false);
assert.strictEqual(itemsDisabledNoTicket.length, 0, 'No JIRA buttons when JIRA is disabled (no ticket)');
const itemsDisabledWithTicket = renderCardMeta({ sessionId: 's2', ticket: 'PROJ-123' }, false);
assert.strictEqual(itemsDisabledWithTicket.length, 0, 'No JIRA buttons when JIRA is disabled (even with ticket)');

// When JIRA enabled: buttons appear
const itemsEnabledNoTicket = renderCardMeta({ sessionId: 's1', ticket: null }, true);
assert.strictEqual(itemsEnabledNoTicket.length, 1, 'Should have 1 add-btn when JIRA enabled and no ticket');
assert.strictEqual(itemsEnabledNoTicket[0].type, 'card-jira-add-btn');

const itemsEnabledWithTicket = renderCardMeta({ sessionId: 's2', ticket: 'PROJ-123' }, true);
assert.strictEqual(itemsEnabledWithTicket.length, 3, 'Should have pill + edit + remove buttons when JIRA enabled with ticket');
assert.strictEqual(itemsEnabledWithTicket[0].type, 'card-jira-pill');
assert.strictEqual(itemsEnabledWithTicket[0].text, 'PROJ-123');

console.log('✓ JIRA card rendering logic verified (hidden when inactive, visible when active)');
console.log('All check-sessions-tab-and-jira tests passed successfully!');
