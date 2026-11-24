'use strict';

const vm = require('vm');
const Module = require('module');

// Mock 'vscode'
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      Uri: { joinPath: () => ({}) },
      workspace: { getConfiguration: () => ({ get: () => '' }) }
    };
  }
  return origRequire.apply(this, arguments);
};

function testScriptSyntax(name, html) {
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) {
    throw new Error(`[${name}] Kein <script> Tag in HTML gefunden.`);
  }
  const scriptContent = m[1];
  try {
    new vm.Script(scriptContent);
    console.log(`✓ [${name}] Webview-Script Syntax OK (${scriptContent.length} Zeichen)`);
  } catch (err) {
    console.error(`✗ [${name}] Webview-Script Syntaxfehler:`, err.message);
    throw err;
  }
}

// 1. BoardPanel
const { BoardPanel } = require('../lib/boardPanel');
const boardPanel = new BoardPanel({});
const boardHtml = boardPanel.html();
testScriptSyntax('BoardPanel', boardHtml);

const assert = require('assert');
assert(!/let auditsSelectedModel\s*=\s*['"]gemma4:e4b['"]/.test(boardHtml), 'auditsSelectedModel must not hardcode gemma4:e4b on init');
assert(/<option value="qwen3-coder:30b" selected>/.test(boardHtml), 'audits-model-select initial option must default to qwen3-coder:30b');
console.log('✓ [BoardPanel] Audits-Modellauswahl startet ohne gemma4:e4b-Vorbelegung');

// 2. TranscriptViewerPanel
const { TranscriptViewerPanel } = require('../lib/transcriptViewerPanel');
const dummyViewer = Object.create(TranscriptViewerPanel.prototype);
dummyViewer.transcript = {
  sessionId: 'test',
  provider: 'claude',
  title: 'Test Session',
  turns: []
};
testScriptSyntax('TranscriptViewerPanel', dummyViewer.getHtml());

// 3. OfficePanel
const { OfficePanel } = require('../lib/officePanel');
const officePanel = new OfficePanel({});
testScriptSyntax('OfficePanel', officePanel.html());

console.log('Alle Webview-Scripts erfolgreich validiert.');
