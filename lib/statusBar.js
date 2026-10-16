'use strict';

const vscode = require('vscode');
const { version } = require('../package.json');
const { formatTokens } = require('./format');

function applyThresholdBackground(item, percent, warnThresh, errThresh) {
  if (typeof percent === 'number' && percent >= errThresh) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
  } else if (typeof percent === 'number' && percent >= warnThresh) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
  } else {
    item.backgroundColor = undefined;
    item.color = undefined;
  }
}

class StatusBarWidget {
  constructor(model) {
    this.model = model;

    // 1. Sessions widget (Priority -1000 -> far right, leftmost of our AI trio)
    this.sessionItem = vscode.window.createStatusBarItem(
      'sessionDashboard.status',
      vscode.StatusBarAlignment.Right,
      -1000
    );
    this.sessionItem.name = 'AI Session Dashboard';
    this.sessionItem.command = 'sessionDashboard.statusBarClick';

    // 2. Claude Code Quota widget (Priority -1001 -> directly right of sessions)
    this.claudeItem = vscode.window.createStatusBarItem(
      'sessionDashboard.claude',
      vscode.StatusBarAlignment.Right,
      -1001
    );
    this.claudeItem.name = 'Claude Code Quota';
    this.claudeItem.command = 'sessionDashboard.claudeStatusClick';

    // 3. Google Antigravity Quota widget (Priority -1002 -> right of Claude)
    this.antigravityItem = vscode.window.createStatusBarItem(
      'sessionDashboard.antigravity',
      vscode.StatusBarAlignment.Right,
      -1002
    );
    this.antigravityItem.name = 'Google Antigravity Quota';
    this.antigravityItem.command = 'sessionDashboard.antigravityStatusClick';

    // 4. OpenAI Codex Quota widget (Priority -1003 -> right of Antigravity)
    this.codexItem = vscode.window.createStatusBarItem(
      'sessionDashboard.codex',
      vscode.StatusBarAlignment.Right,
      -1003
    );
    this.codexItem.name = 'OpenAI Codex Quota';
    this.codexItem.command = 'sessionDashboard.codexStatusClick';

    // 5. GitHub Copilot Quota widget (Priority -1004 -> right of Codex)
    this.copilotItem = vscode.window.createStatusBarItem(
      'sessionDashboard.copilot',
      vscode.StatusBarAlignment.Right,
      -1004
    );
    this.copilotItem.name = 'GitHub Copilot Quota';
    this.copilotItem.command = 'sessionDashboard.copilotStatusClick';
  }

  get item() {
    return this.sessionItem;
  }

  show() {
    this.sessionItem.show();
  }

  dispose() {
    this.sessionItem.dispose();
    this.claudeItem.dispose();
    this.antigravityItem.dispose();
    this.codexItem.dispose();
    this.copilotItem.dispose();
  }

  formatCodexText(format, codex) {
    const useIcons = format !== 'text';
    const prefix = useIcons ? '$(dashboard-codex) ' : 'Codex: ';
    const c5 = (codex.fiveHour && typeof codex.fiveHour.percent === 'number') ? codex.fiveHour.percent : null;
    const c7 = (codex.sevenDay && typeof codex.sevenDay.percent === 'number') ? codex.sevenDay.percent : null;

    if (c5 !== null) {
      if (format === 'both' && c7 !== null) {
        return `${prefix}${c5}%/${c7}%`;
      } else if (format === 'detailed' && c7 !== null) {
        return `${prefix}${c5}% (5h) · ${c7}% (7d)`;
      } else if (format === '5h') {
        return `${prefix}${c5}% (5h)`;
      } else {
        return `${prefix}${c5}%`;
      }
    } else if (c7 !== null) {
      return `${prefix}${c7}% (7d)`;
    }
    return '';
  }

  formatClaudeText(format, claude) {
    const useIcons = format !== 'text';
    const prefix = useIcons ? '$(dashboard-claude) ' : 'Claude: ';
    const c5 = (claude.fiveHour && typeof claude.fiveHour.percent === 'number') ? claude.fiveHour.percent : null;
    const c7 = (claude.sevenDay && typeof claude.sevenDay.percent === 'number') ? claude.sevenDay.percent : null;

    if (c5 !== null) {
      if (format === 'both' && c7 !== null) {
        return `${prefix}${c5}%/${c7}%`;
      } else if (format === 'detailed' && c7 !== null) {
        return `${prefix}${c5}% (5h) · ${c7}% (7d)`;
      } else if (format === '5h') {
        return `${prefix}${c5}% (5h)`;
      } else {
        return `${prefix}${c5}%`;
      }
    } else if (c7 !== null) {
      return `${prefix}${c7}% (7d)`;
    }
    return '';
  }

  formatAntigravityText(format, antigravity) {
    const useIcons = format !== 'text';
    const prefix = useIcons ? '$(dashboard-antigravity) ' : 'AG: ';

    if (antigravity.isRateLimited) {
      return `${prefix}⚠️ Limit`;
    }

    if (antigravity.hasLiveQuota && (antigravity.gemini || antigravity.argon || antigravity.thirdParty)) {
      const bucket = antigravity.gemini || antigravity.thirdParty || antigravity.argon;
      const a5 = (bucket.fiveHour && typeof bucket.fiveHour.percent === 'number') ? bucket.fiveHour.percent : null;
      const a7 = (bucket.weekly && typeof bucket.weekly.percent === 'number') ? bucket.weekly.percent : null;
      const aArgon = (antigravity.argon?.weekly && typeof antigravity.argon.weekly.percent === 'number')
        ? antigravity.argon.weekly.percent
        : null;

      if (a5 !== null) {
        if (format === 'both' && a7 !== null) {
          return `${prefix}${a5}%/${a7}%`;
        } else if (format === 'detailed' && a7 !== null) {
          const argonPart = aArgon !== null ? ` · ${aArgon}% (Argon)` : '';
          return `${prefix}${a5}% (5h) · ${a7}% (7d)${argonPart}`;
        } else if (format === '5h') {
          return `${prefix}${a5}% (5h)`;
        } else {
          return `${prefix}${a5}%`;
        }
      } else if (a7 !== null) {
        return `${prefix}${a7}% (7d)`;
      } else if (aArgon !== null) {
        return `${prefix}${aArgon}% (Argon)`;
      } else if (typeof antigravity.tokens5h === 'number') {
        return `${prefix}~${formatTokens(antigravity.tokens5h)}`;
      }
    } else if (typeof antigravity.tokens5h === 'number') {
      return `${prefix}~${formatTokens(antigravity.tokens5h)}`;
    }
    return '';
  }

  formatCopilotText(format, cp) {
    if (!cp) return '';
    const useIcons = format !== 'text';
    const prefix = useIcons ? '$(copilot) ' : 'Copilot: ';

    if (cp.premium && cp.premium.unlimited) {
      return `${prefix}∞`;
    }

    const pPct = (cp.premium && typeof cp.premium.percent === 'number') ? cp.premium.percent : null;
    const bPct = (cp.budget && typeof cp.budget.percent === 'number') ? cp.budget.percent : null;

    if (pPct === null && bPct === null) {
      return '';
    }

    const quotaExhaustedWithBudget = pPct !== null && pPct >= 100 && bPct !== null;

    if (format === 'compact') {
      if (quotaExhaustedWithBudget) {
        return `${prefix}B ${bPct}%`;
      }
      return `${prefix}${pPct !== null ? pPct : bPct}%`;
    }

    if (format === 'text') {
      if (quotaExhaustedWithBudget) {
        return `${prefix}Budget ${bPct}%`;
      }
      return `${prefix}${pPct !== null ? pPct : bPct}%`;
    }

    if (format === '5h') {
      if (quotaExhaustedWithBudget) {
        return `${prefix}${bPct}% (Budget)`;
      }
      if (pPct !== null) {
        return `${prefix}${pPct}% (Monat)`;
      }
      return `${prefix}${bPct}% (Budget)`;
    }

    if (format === 'both') {
      if (pPct !== null && bPct !== null) {
        return `${prefix}${pPct}%/${bPct}%`;
      }
      if (pPct !== null) {
        return `${prefix}${pPct}%`;
      }
      return `${prefix}${bPct}%`;
    }

    if (format === 'detailed') {
      if (pPct !== null && bPct !== null) {
        return `${prefix}${pPct}% (Monat) · ${bPct}% (Budget)`;
      }
      if (pPct !== null) {
        return `${prefix}${pPct}% (Monat)`;
      }
      return `${prefix}${bPct}% (Budget)`;
    }

    if (quotaExhaustedWithBudget) {
      return `${prefix}B ${bPct}%`;
    }
    return `${prefix}${pPct !== null ? pPct : bPct}%`;
  }

  updateSession(busy, waiting, bookmarked, idle, showFullTooltip, claudeEnabled = true, antigravityEnabled = true, codexEnabled = true, copilotEnabled = true) {
    const parts = [];
    if (busy > 0) parts.push(`${busy} arbeitet`);
    if (waiting > 0) parts.push(`${waiting} wartet`);
    if (idle > 0) parts.push(`${idle} fertig`);

    if (parts.length > 0) {
      this.sessionItem.text = `🤖 ${parts.join(' · ')}`;
    } else if (bookmarked > 0) {
      this.sessionItem.text = `🤖 ${bookmarked} gemerkt`;
    } else {
      this.sessionItem.text = '🤖 KI bereit';
    }

    if (waiting > 0) {
      this.sessionItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.sessionItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      this.sessionItem.backgroundColor = undefined;
      this.sessionItem.color = undefined;
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

    if (showFullTooltip && this.model.quota) {
      const q = this.model.quota;
      if (claudeEnabled && q.claude && q.claude.available) {
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
      if (antigravityEnabled && q.antigravity && q.antigravity.available) {
        md.appendMarkdown('---\n$(dashboard-antigravity) **Google Antigravity:**\n\n');
        if (q.antigravity.isRateLimited) {
          md.appendMarkdown(`⚠️ **Status:** ${q.antigravity.rateLimitMessage || 'Rate-Limit aktiv (429)'}\n\n`);
        }
        if (q.antigravity.hasLiveQuota && (q.antigravity.gemini || q.antigravity.argon)) {
          if (q.antigravity.gemini?.fiveHour && q.antigravity.gemini.fiveHour.percent !== null) {
            const r5 = q.antigravity.gemini.fiveHour.resetLabel ? ` (Reset ${q.antigravity.gemini.fiveHour.resetLabel})` : '';
            md.appendMarkdown(`⚡ **Gemini 5-Std.-Limit:** ${q.antigravity.gemini.fiveHour.percent}%${r5}\n\n`);
          }
          if (q.antigravity.gemini?.weekly && q.antigravity.gemini.weekly.percent !== null) {
            const r7 = q.antigravity.gemini.weekly.resetLabel ? ` (Reset ${q.antigravity.gemini.weekly.resetLabel})` : '';
            md.appendMarkdown(`📅 **Gemini 7-Tage-Limit:** ${q.antigravity.gemini.weekly.percent}%${r7}\n\n`);
          }
          if (q.antigravity.argon?.weekly && q.antigravity.argon.weekly.percent !== null) {
            const rArgon = q.antigravity.argon.weekly.resetLabel ? ` (Reset ${q.antigravity.argon.weekly.resetLabel})` : '';
            md.appendMarkdown(`📅 **Gemini 4 Argon 7-Tage-Limit:** ${q.antigravity.argon.weekly.percent}%${rArgon}\n\n`);
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
      if (codexEnabled && q.codex && q.codex.available) {
        md.appendMarkdown('---\n$(dashboard-codex) **OpenAI Codex Limits:**\n\n');
        if (q.codex.fiveHour && q.codex.fiveHour.percent !== null) {
          const r5 = q.codex.fiveHour.resetLabel ? ` (Reset ${q.codex.fiveHour.resetLabel})` : '';
          md.appendMarkdown(`⚡ **5-Std.-Limit:** ${q.codex.fiveHour.percent}%${r5}\n\n`);
        }
        if (q.codex.sevenDay && q.codex.sevenDay.percent !== null) {
          const r7 = q.codex.sevenDay.resetLabel ? ` (Reset ${q.codex.sevenDay.resetLabel})` : '';
          md.appendMarkdown(`📅 **7-Tage-Limit:** ${q.codex.sevenDay.percent}%${r7}\n\n`);
        }
      }
      if (copilotEnabled && q.copilot && q.copilot.available) {
        md.appendMarkdown('---\n$(copilot) **GitHub Copilot Limits:**\n\n');
        const cp = q.copilot;
        const prem = cp.premium;
        const unit = cp.tokenBasedBilling ? 'Credits' : 'Requests';
        if (prem) {
          if (prem.unlimited) {
            md.appendMarkdown('⚡ **Monatskontingent:** Unbegrenzt\n\n');
          } else {
            const rLabel = cp.resetLabel ? ` (Reset ${cp.resetLabel})` : '';
            if (typeof prem.entitlement === 'number') {
              const usedFormatted = (prem.used || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
              const entFormatted = prem.entitlement.toLocaleString('de-DE');
              const pctStr = typeof prem.percent === 'number' ? ` (${prem.percent}%)` : '';
              md.appendMarkdown(`⚡ **Monatskontingent:** ${usedFormatted} / ${entFormatted} ${unit}${pctStr}${rLabel}\n\n`);
            } else if (typeof prem.percent === 'number') {
              md.appendMarkdown(`⚡ **Monatskontingent:** ${prem.percent}%${rLabel}\n\n`);
            }
          }
        }
        if (cp.budget) {
          const usedBFormatted = (cp.budget.used || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
          const entBFormatted = (cp.budget.entitlement || 0).toLocaleString('de-DE');
          const pctBStr = typeof cp.budget.percent === 'number' ? ` (${cp.budget.percent}%)` : '';
          md.appendMarkdown(`💳 **Zusatzbudget:** ${usedBFormatted} / ${entBFormatted} ${unit}${pctBStr}\n\n`);
        }
      }
    }

    md.appendMarkdown(`---\n*AI Sessions v${version} · tools@schüri*\n\n*Klicken für Dashboard-Übersicht*`);
    this.sessionItem.tooltip = md;
    this.sessionItem.show();
  }

  updateClaude(format, warnThresh, errThresh, isEnabled = true) {
    const q = this.model.quota;
    if (!isEnabled || format === 'off' || !q || !q.claude || !q.claude.available) {
      this.claudeItem.hide();
      return;
    }

    const text = this.formatClaudeText(format, q.claude);
    if (!text) {
      this.claudeItem.hide();
      return;
    }

    this.claudeItem.text = text;

    const c5 = (q.claude.fiveHour && typeof q.claude.fiveHour.percent === 'number') ? q.claude.fiveHour.percent : null;
    const c7 = (q.claude.sevenDay && typeof q.claude.sevenDay.percent === 'number') ? q.claude.sevenDay.percent : null;
    const percents = [c5, c7].filter((p) => p !== null);
    const maxPercent = percents.length > 0 ? Math.max(...percents) : null;

    applyThresholdBackground(this.claudeItem, maxPercent, warnThresh, errThresh);

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.appendMarkdown('$(dashboard-claude) **Claude Code Limits**\n\n');
    if (c5 !== null) {
      const r5 = q.claude.fiveHour.resetLabel ? ` (Reset ${q.claude.fiveHour.resetLabel})` : '';
      md.appendMarkdown(`⚡ **5-Std.-Limit:** ${c5}%${r5}\n\n`);
    }
    if (c7 !== null) {
      const r7 = q.claude.sevenDay.resetLabel ? ` (Reset ${q.claude.sevenDay.resetLabel})` : '';
      md.appendMarkdown(`📅 **7-Tage-Limit:** ${c7}%${r7}\n\n`);
    }
    md.appendMarkdown('---\n*Klicken, um Claude-Code-Sessions anzuzeigen*');
    this.claudeItem.tooltip = md;
    this.claudeItem.show();
  }

  updateAntigravity(format, warnThresh, errThresh, isEnabled = true) {
    const q = this.model.quota;
    if (!isEnabled || format === 'off' || !q || !q.antigravity || !q.antigravity.available) {
      this.antigravityItem.hide();
      return;
    }

    const text = this.formatAntigravityText(format, q.antigravity);
    if (!text) {
      this.antigravityItem.hide();
      return;
    }

    this.antigravityItem.text = text;

    if (q.antigravity.isRateLimited) {
      this.antigravityItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.antigravityItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    } else {
      let maxPercent = null;
      if (q.antigravity.hasLiveQuota && (q.antigravity.gemini || q.antigravity.argon || q.antigravity.thirdParty)) {
        const bucket = q.antigravity.gemini || q.antigravity.thirdParty;
        const a5 = (bucket?.fiveHour && typeof bucket.fiveHour.percent === 'number') ? bucket.fiveHour.percent : null;
        const a7 = (bucket?.weekly && typeof bucket.weekly.percent === 'number') ? bucket.weekly.percent : null;
        const aArgon = (q.antigravity.argon?.weekly && typeof q.antigravity.argon.weekly.percent === 'number')
          ? q.antigravity.argon.weekly.percent
          : null;
        const percents = [a5, a7, aArgon].filter((p) => p !== null);
        if (percents.length > 0) {
          maxPercent = Math.max(...percents);
        }
      }
      applyThresholdBackground(this.antigravityItem, maxPercent, warnThresh, errThresh);
    }

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.appendMarkdown('$(dashboard-antigravity) **Google Antigravity Limits**\n\n');
    if (q.antigravity.isRateLimited) {
      md.appendMarkdown(`⚠️ **Status:** ${q.antigravity.rateLimitMessage || 'Rate-Limit aktiv (429)'}\n\n`);
    }
    if (q.antigravity.hasLiveQuota && (q.antigravity.gemini || q.antigravity.argon)) {
      if (q.antigravity.gemini?.fiveHour && q.antigravity.gemini.fiveHour.percent !== null) {
        const r5 = q.antigravity.gemini.fiveHour.resetLabel ? ` (Reset ${q.antigravity.gemini.fiveHour.resetLabel})` : '';
        md.appendMarkdown(`⚡ **Gemini 5-Std.-Limit:** ${q.antigravity.gemini.fiveHour.percent}%${r5}\n\n`);
      }
      if (q.antigravity.gemini?.weekly && q.antigravity.gemini.weekly.percent !== null) {
        const r7 = q.antigravity.gemini.weekly.resetLabel ? ` (Reset ${q.antigravity.gemini.weekly.resetLabel})` : '';
        md.appendMarkdown(`📅 **Gemini 7-Tage-Limit:** ${q.antigravity.gemini.weekly.percent}%${r7}\n\n`);
      }
      if (q.antigravity.argon?.weekly && q.antigravity.argon.weekly.percent !== null) {
        const rArgon = q.antigravity.argon.weekly.resetLabel ? ` (Reset ${q.antigravity.argon.weekly.resetLabel})` : '';
        md.appendMarkdown(`📅 **Gemini 4 Argon 7-Tage-Limit:** ${q.antigravity.argon.weekly.percent}%${rArgon}\n\n`);
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
    md.appendMarkdown('---\n*Klicken, um Antigravity-Sessions anzuzeigen*');
    this.antigravityItem.tooltip = md;
    this.antigravityItem.show();
  }

  updateCodex(format, warnThresh, errThresh, isEnabled = true) {
    const q = this.model.quota;
    if (!isEnabled || format === 'off' || !q || !q.codex || !q.codex.available) {
      this.codexItem.hide();
      return;
    }

    const text = this.formatCodexText(format, q.codex);
    if (!text) {
      this.codexItem.hide();
      return;
    }

    this.codexItem.text = text;

    const c5 = (q.codex.fiveHour && typeof q.codex.fiveHour.percent === 'number') ? q.codex.fiveHour.percent : null;
    const c7 = (q.codex.sevenDay && typeof q.codex.sevenDay.percent === 'number') ? q.codex.sevenDay.percent : null;
    const percents = [c5, c7].filter((p) => p !== null);
    const maxPercent = percents.length > 0 ? Math.max(...percents) : null;

    applyThresholdBackground(this.codexItem, maxPercent, warnThresh, errThresh);

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.appendMarkdown('$(dashboard-codex) **OpenAI Codex Limits**\n\n');
    if (c5 !== null) {
      const r5 = q.codex.fiveHour.resetLabel ? ` (Reset ${q.codex.fiveHour.resetLabel})` : '';
      md.appendMarkdown(`⚡ **5-Std.-Limit:** ${c5}%${r5}\n\n`);
    }
    if (c7 !== null) {
      const r7 = q.codex.sevenDay.resetLabel ? ` (Reset ${q.codex.sevenDay.resetLabel})` : '';
      md.appendMarkdown(`📅 **7-Tage-Limit:** ${c7}%${r7}\n\n`);
    }
    if (q.codex.credits && q.codex.credits.hasCredits) {
      md.appendMarkdown(`💳 **Credits:** ${q.codex.credits.balance}\n\n`);
    }
    if (q.codex.plan) {
      md.appendMarkdown(`✨ **Plan:** ${q.codex.plan}\n\n`);
    }
    md.appendMarkdown('---\n*Klicken, um OpenAI-Codex-Sessions anzuzeigen*');
    this.codexItem.tooltip = md;
    this.codexItem.show();
  }

  updateCopilot(format, warnThresh, errThresh, isEnabled = true) {
    const q = this.model.quota;
    if (!isEnabled || format === 'off' || !q || !q.copilot) {
      this.copilotItem.hide();
      return;
    }

    if (!q.copilot.available) {
      if (q.copilot.needsAuth) {
        this.copilotItem.text = '$(copilot) $(key)';
        this.copilotItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.copilotItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        this.copilotItem.command = 'sessionDashboard.copilotSignIn';
        const md = new vscode.MarkdownString(undefined, true);
        md.isTrusted = true;
        md.supportThemeIcons = true;
        md.appendMarkdown('$(copilot) **GitHub Copilot Limits**\n\n');
        md.appendMarkdown('GitHub-Zugriff für Quota-Abfrage freigeben\n\n---\n*Klicken zum Anmelden*');
        this.copilotItem.tooltip = md;
        this.copilotItem.show();
        return;
      }
      this.copilotItem.hide();
      return;
    }

    this.copilotItem.command = 'sessionDashboard.copilotStatusClick';

    const text = this.formatCopilotText(format, q.copilot);
    if (!text) {
      this.copilotItem.hide();
      return;
    }

    this.copilotItem.text = text;

    const prem = q.copilot.premium;
    const budget = q.copilot.budget;
    const pPrem = prem ? (typeof prem.percent === 'number' ? prem.percent : null) : null;
    const pBud = budget ? (typeof budget.percent === 'number' ? budget.percent : null) : null;

    let colorPct = null;
    if (prem && prem.unlimited) {
      colorPct = null;
    } else if (pPrem !== null && pPrem >= 100 && pBud !== null) {
      colorPct = pBud;
    } else if (pPrem !== null && pPrem >= 100 && !budget) {
      colorPct = 100;
    } else {
      colorPct = pPrem;
    }

    applyThresholdBackground(this.copilotItem, colorPct, warnThresh, errThresh);

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.appendMarkdown('$(copilot) **GitHub Copilot Limits**\n\n');

    const planParts = [];
    if (q.copilot.plan) {
      planParts.push(q.copilot.plan + (q.copilot.tokenBasedBilling ? ' (tokenbasiert)' : ''));
    }
    if (q.copilot.account) {
      planParts.push(q.copilot.account);
    }
    if (planParts.length > 0) {
      md.appendMarkdown(`✨ **Plan:** ${planParts.join(' · ')}\n\n`);
    }

    const unit = q.copilot.tokenBasedBilling ? 'Credits' : 'Requests';
    if (prem) {
      if (prem.unlimited) {
        md.appendMarkdown('⚡ **Monatskontingent:** Unbegrenzt\n\n');
      } else {
        const rLabel = q.copilot.resetLabel ? ` (Reset ${q.copilot.resetLabel})` : '';
        if (typeof prem.entitlement === 'number') {
          const usedFormatted = (prem.used || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
          const entFormatted = prem.entitlement.toLocaleString('de-DE');
          const pctStr = typeof prem.percent === 'number' ? ` (${prem.percent}%)` : '';
          md.appendMarkdown(`⚡ **Monatskontingent:** ${usedFormatted} / ${entFormatted} ${unit}${pctStr}${rLabel}\n\n`);
        } else if (typeof prem.percent === 'number') {
          md.appendMarkdown(`⚡ **Monatskontingent:** ${prem.percent}%${rLabel}\n\n`);
        }
      }
    }

    if (budget) {
      const usedBFormatted = (budget.used || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
      const entBFormatted = (budget.entitlement || 0).toLocaleString('de-DE');
      const pctBStr = typeof budget.percent === 'number' ? ` (${budget.percent}%)` : '';
      md.appendMarkdown(`💳 **Zusatzbudget:** ${usedBFormatted} / ${entBFormatted} ${unit}${pctBStr}\n\n`);
    }

    if (q.copilot.chat && !q.copilot.chat.unlimited && typeof q.copilot.chat.percent === 'number') {
      md.appendMarkdown(`💬 **Chat:** ${q.copilot.chat.percent}%\n\n`);
    }
    if (q.copilot.completions && !q.copilot.completions.unlimited && typeof q.copilot.completions.percent === 'number') {
      md.appendMarkdown(`⌨️ **Completions:** ${q.copilot.completions.percent}%\n\n`);
    }

    md.appendMarkdown('---\n*Klicken, um Copilot-Sessions anzuzeigen*');
    this.copilotItem.tooltip = md;
    this.copilotItem.show();
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

    const config = vscode.workspace.getConfiguration('sessionDashboard');
    const format = config.get('statusBarUsage', 'compact');
    const warnThresh = config.get('quotaWarningThreshold', 75);
    const errThresh = config.get('quotaErrorThreshold', 95);

    const pConfig = vscode.workspace.getConfiguration('sessionDashboard.providers');
    const claudeEnabled = pConfig.get('claude', true);
    const antigravityEnabled = pConfig.get('antigravity', true);
    const codexEnabled = pConfig.get('codex', true);
    const copilotEnabled = pConfig.get('copilot', true);

    this.updateSession(busy, waiting, bookmarked, idle, format === 'off', claudeEnabled, antigravityEnabled, codexEnabled, copilotEnabled);
    this.updateClaude(format, warnThresh, errThresh, claudeEnabled);
    this.updateAntigravity(format, warnThresh, errThresh, antigravityEnabled);
    this.updateCodex(format, warnThresh, errThresh, codexEnabled);
    this.updateCopilot(format, warnThresh, errThresh, copilotEnabled);
  }
}

module.exports = { StatusBarWidget };
