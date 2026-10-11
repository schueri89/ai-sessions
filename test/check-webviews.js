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
testScriptSyntax('BoardPanel', boardPanel.html());

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

console.log('Alle Webview-Scripts erfolgreich validiert.');
