'use strict';

const vscode = require('vscode');
const { formatTokens } = require('./format');

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

    const parts = [];
    if (busy > 0) parts.push(`${busy} arbeitet`);
    if (waiting > 0) parts.push(`${waiting} wartet`);
    if (idle > 0) parts.push(`${idle} fertig`);

    let text = '';
    if (parts.length > 0) {
      text = `🤖 ${parts.join(' · ')}`;
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
    if (busy === 0 && waiting === 0 && bookmarked === 0 && idle === 0) {
      md.appendMarkdown('*Keine aktiven Aufgaben*\n\n');
    }

    const q = this.model.quota;
    if (q) {
      if (q.claude && q.claude.available) {
        md.appendMarkdown('---\n**Claude Code Limits:**\n\n');
        if (q.claude.fiveHour && q.claude.fiveHour.percent !== null) {
          const r5 = q.claude.fiveHour.resetLabel ? ` (Reset ${q.claude.fiveHour.resetLabel})` : '';
          md.appendMarkdown(`⚡ **5-Std.-Limit:** ${q.claude.fiveHour.percent}%${r5}\n\n`);
        }
        if (q.claude.sevenDay && q.claude.sevenDay.percent !== null) {
          const r7 = q.claude.sevenDay.resetLabel ? ` (Reset ${q.claude.sevenDay.resetLabel})` : '';
          md.appendMarkdown(`📅 **7-Tage-Limit:** ${q.claude.sevenDay.percent}%${r7}\n\n`);
        }
      }
      if (q.antigravity && q.antigravity.available) {
        md.appendMarkdown('---\n**Google Antigravity:**\n\n');
        if (q.antigravity.isRateLimited) {
          md.appendMarkdown(`⚠️ **Status:** ${q.antigravity.rateLimitMessage || 'Rate-Limit aktiv (429)'}\n\n`);
        }
        if (q.antigravity.hasLiveQuota && q.antigravity.gemini) {
          if (q.antigravity.gemini.fiveHour && q.antigravity.gemini.fiveHour.percent !== null) {
            const r5 = q.antigravity.gemini.fiveHour.resetLabel ? ` (Reset ${q.antigravity.gemini.fiveHour.resetLabel})` : '';
            md.appendMarkdown(`⚡ **Gemini 5-Std.-Limit:** ${q.antigravity.gemini.fiveHour.percent}%${r5}\n\n`);
          }
          if (q.antigravity.gemini.weekly && q.antigravity.gemini.weekly.percent !== null) {
            const r7 = q.antigravity.gemini.weekly.resetLabel ? ` (Reset ${q.antigravity.gemini.weekly.resetLabel})` : '';
            md.appendMarkdown(`📅 **Gemini 7-Tage-Limit:** ${q.antigravity.gemini.weekly.percent}%${r7}\n\n`);
          }
          const t5 = formatTokens(q.antigravity.tokens5h);
          const t7 = formatTokens(q.antigravity.tokens7d);
          md.appendMarkdown(`*(Rolling Tokens: ~${t5} in 5h · ~${t7} in 7d)*\n\n`);
        } else {
          const t5 = formatTokens(q.antigravity.tokens5h);
          const t7 = formatTokens(q.antigravity.tokens7d);
          md.appendMarkdown(`⚡ **5-Std.-Verbrauch:** ~${t5} Tokens\n\n`);
          md.appendMarkdown(`📅 **7-Tage-Verbrauch:** ~${t7} Tokens\n\n`);
        }
      }
    }

    md.appendMarkdown('---\n*Klicken für Direktzugriff*');
    this.item.tooltip = md;
    this.item.show();
  }
}

module.exports = { StatusBarWidget };
