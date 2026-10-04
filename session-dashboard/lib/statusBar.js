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

  formatUsage(format) {
    if (format === 'off') return '';
    const q = this.model.quota;
    if (!q) return '';

    const parts = [];
    const useIcons = format !== 'text';
    const claudePrefix = useIcons ? '$(dashboard-claude) ' : 'Claude: ';
    const agPrefix = useIcons ? '$(dashboard-antigravity) ' : 'AG: ';

    // 1. Claude Code
    if (q.claude && q.claude.available) {
      const c5 = (q.claude.fiveHour && typeof q.claude.fiveHour.percent === 'number') ? q.claude.fiveHour.percent : null;
      const c7 = (q.claude.sevenDay && typeof q.claude.sevenDay.percent === 'number') ? q.claude.sevenDay.percent : null;

      if (c5 !== null) {
        if (format === 'both' && c7 !== null) {
          parts.push(`${claudePrefix}${c5}%/${c7}%`);
        } else if (format === 'detailed' && c7 !== null) {
          parts.push(`${claudePrefix}${c5}% (5h) · ${c7}% (7d)`);
        } else if (format === '5h') {
          parts.push(`${claudePrefix}${c5}% (5h)`);
        } else {
          // 'compact' (default) or 'text'
          parts.push(`${claudePrefix}${c5}%`);
        }
      } else if (c7 !== null) {
        parts.push(`${claudePrefix}${c7}% (7d)`);
      }
    }

    // 2. Google Antigravity
    if (q.antigravity && q.antigravity.available) {
      if (q.antigravity.isRateLimited) {
        parts.push(`${agPrefix}⚠️ Limit`);
      } else if (q.antigravity.hasLiveQuota && (q.antigravity.gemini || q.antigravity.thirdParty)) {
        const bucket = q.antigravity.gemini || q.antigravity.thirdParty;
        const a5 = (bucket.fiveHour && typeof bucket.fiveHour.percent === 'number') ? bucket.fiveHour.percent : null;
        const a7 = (bucket.weekly && typeof bucket.weekly.percent === 'number') ? bucket.weekly.percent : null;

        if (a5 !== null) {
          if (format === 'both' && a7 !== null) {
            parts.push(`${agPrefix}${a5}%/${a7}%`);
          } else if (format === 'detailed' && a7 !== null) {
            parts.push(`${agPrefix}${a5}% (5h) · ${a7}% (7d)`);
          } else if (format === '5h') {
            parts.push(`${agPrefix}${a5}% (5h)`);
          } else {
            // 'compact' (default) or 'text'
            parts.push(`${agPrefix}${a5}%`);
          }
        } else if (a7 !== null) {
          parts.push(`${agPrefix}${a7}% (7d)`);
        } else if (typeof q.antigravity.tokens5h === 'number') {
          parts.push(`${agPrefix}~${formatTokens(q.antigravity.tokens5h)}`);
        }
      } else if (typeof q.antigravity.tokens5h === 'number') {
        parts.push(`${agPrefix}~${formatTokens(q.antigravity.tokens5h)}`);
      }
    }

    return parts.join(' · ');
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

    let sessionText = '';
    if (parts.length > 0) {
      sessionText = `🤖 ${parts.join(' · ')}`;
    } else if (bookmarked > 0) {
      sessionText = `🤖 ${bookmarked} gemerkt`;
    } else {
      sessionText = '🤖 KI bereit';
    }

    const config = vscode.workspace.getConfiguration('sessionDashboard');
    const format = config.get('statusBarUsage', 'compact');
    const usageText = this.formatUsage(format);

    if (usageText) {
      this.item.text = `${sessionText} | ${usageText}`;
    } else {
      this.item.text = sessionText;
    }

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
        md.appendMarkdown('---\n$(dashboard-claude) **Claude Code Limits:**\n\n');
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
        md.appendMarkdown('---\n$(dashboard-antigravity) **Google Antigravity:**\n\n');
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
