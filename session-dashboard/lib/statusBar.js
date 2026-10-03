'use strict';

const vscode = require('vscode');

class StatusBarWidget {
  constructor(model) {
    this.model = model;
    this.item = vscode.window.createStatusBarItem(
      'sessionDashboard.status',
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = 'AI Session Dashboard';
    this.item.command = 'sessionDashboard.statusBarClick';
  }

  show() {
    this.item.show();
  }

  dispose() {
    this.item.dispose();
  }

  update() {
    let busy = 0;
    let waiting = 0;
    let bookmarked = 0;
    let idle = 0;

    for (const s of this.model.sessions) {
      if (s.displayState === 'busy') busy++;
      else if (s.displayState === 'waiting') waiting++;
      else if (s.displayState === 'bookmarked') bookmarked++;
      else if (s.displayState === 'idle') idle++;
    }

    let text = '';
    if (busy > 0 && waiting > 0) {
      text = `🤖 ${busy} arbeitet · ${waiting} wartet`;
    } else if (busy > 0) {
      text = `🤖 ${busy} arbeitet`;
    } else if (waiting > 0) {
      text = `🤖 ${waiting} wartet`;
    } else if (bookmarked > 0) {
      text = `🤖 ${bookmarked} gemerkt`;
    } else {
      text = '🤖 KI bereit';
    }

    this.item.text = text;

    if (waiting > 0) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      this.item.backgroundColor = undefined;
      this.item.color = undefined;
    }

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.appendMarkdown('**AI Sessions Dashboard**\n\n');
    if (busy > 0) md.appendMarkdown(`$(loading~spin) **${busy}** arbeitet\n\n`);
    if (waiting > 0) md.appendMarkdown(`$(bell-dot) **${waiting}** wartet auf dich\n\n`);
    if (bookmarked > 0) md.appendMarkdown(`$(pinned) **${bookmarked}** gemerkt\n\n`);
    if (idle > 0) md.appendMarkdown(`$(pass) **${idle}** fertig / bereit\n\n`);
    if (busy === 0 && waiting === 0 && bookmarked === 0) {
      md.appendMarkdown('*Keine aktiven Aufgaben*\n\n');
    }
    md.appendMarkdown('---\n*Klicken für Direktzugriff*');
    this.item.tooltip = md;
    this.item.show();
  }
}

module.exports = { StatusBarWidget };
