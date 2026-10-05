'use strict';

// Sound notification engine for AI Session Dashboard.
// Plays distinct sounds when:
// 1. A session finishes a task (taskCompleted)
// 2. A session needs user input / asks a question (needsInput)
// 3. A rate limit or quota becomes available again (limitAvailable)

const vscode = require('vscode');
const fs = require('fs');
const { exec, execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

const WIN_SOUNDS = {
  'tada': 'C:\\Windows\\Media\\tada.wav',
  'chimes': 'C:\\Windows\\Media\\chimes.wav',
  'notify': 'C:\\Windows\\Media\\notify.wav',
  'chord': 'C:\\Windows\\Media\\chord.wav',
  'ding': 'C:\\Windows\\Media\\ding.wav',
  'ringin': 'C:\\Windows\\Media\\ringin.wav',
  'Windows Notify': 'C:\\Windows\\Media\\Windows Notify.wav',
  'Windows Background': 'C:\\Windows\\Media\\Windows Background.wav'
};

const MACOS_SOUNDS = {
  'Hero': '/System/Library/Sounds/Hero.aiff',
  'Glass': '/System/Library/Sounds/Glass.aiff',
  'Basso': '/System/Library/Sounds/Basso.aiff',
  'Blow': '/System/Library/Sounds/Blow.aiff',
  'Bottle': '/System/Library/Sounds/Bottle.aiff',
  'Frog': '/System/Library/Sounds/Frog.aiff',
  'Funk': '/System/Library/Sounds/Funk.aiff',
  'Morse': '/System/Library/Sounds/Morse.aiff',
  'Ping': '/System/Library/Sounds/Ping.aiff',
  'Pop': '/System/Library/Sounds/Pop.aiff',
  'Purr': '/System/Library/Sounds/Purr.aiff',
  'Sosumi': '/System/Library/Sounds/Sosumi.aiff',
  'Submarine': '/System/Library/Sounds/Submarine.aiff',
  'Tink': '/System/Library/Sounds/Tink.aiff'
};

const LINUX_SOUNDS_DIR = '/usr/share/sounds/freedesktop/stereo';
const LINUX_SOUNDS = {
  'tada': `${LINUX_SOUNDS_DIR}/complete.oga`,
  'chimes': `${LINUX_SOUNDS_DIR}/bell.oga`,
  'notify': `${LINUX_SOUNDS_DIR}/message.oga`,
  'Hero': `${LINUX_SOUNDS_DIR}/complete.oga`,
  'Glass': `${LINUX_SOUNDS_DIR}/bell.oga`,
  'Ping': `${LINUX_SOUNDS_DIR}/message.oga`
};

function psSingleQuoteEscape(s) {
  return String(s).replace(/'/g, "''");
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function playSoundFile(soundPath) {
  if (!soundPath) return;
  try {
    if (IS_WIN) {
      const escaped = psSingleQuoteEscape(soundPath);
      const ps = `$s='${escaped}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
      const enc = Buffer.from(ps, 'utf16le').toString('base64');
      exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${enc}`, { timeout: 6000 }, () => {});
    } else if (IS_MAC) {
      execFile('afplay', [soundPath], { timeout: 6000 }, () => {});
    } else if (IS_LINUX) {
      const q = shQuote(soundPath);
      exec(`pw-play ${q} 2>/dev/null || paplay ${q} 2>/dev/null || aplay ${q} 2>/dev/null`, { timeout: 6000 }, () => {});
    }
  } catch (err) {
    console.error('[session-dashboard] playSoundFile error:', err);
  }
}

function resolveSoundPath(soundName, eventType) {
  if (soundName && (soundName.includes('/') || soundName.includes('\\')) && fs.existsSync(soundName)) {
    return soundName;
  }
  if (IS_WIN) {
    if (soundName && WIN_SOUNDS[soundName]) return WIN_SOUNDS[soundName];
    if (eventType === 'taskCompleted') return WIN_SOUNDS['tada'];
    return WIN_SOUNDS['chimes']; // needsInput & limitAvailable
  }
  if (IS_MAC) {
    if (soundName && MACOS_SOUNDS[soundName]) return MACOS_SOUNDS[soundName];
    if (eventType === 'taskCompleted') return MACOS_SOUNDS['Hero'];
    return MACOS_SOUNDS['Glass'];
  }
  if (IS_LINUX) {
    if (soundName && LINUX_SOUNDS[soundName]) return LINUX_SOUNDS[soundName];
    if (eventType === 'taskCompleted') return `${LINUX_SOUNDS_DIR}/complete.oga`;
    return `${LINUX_SOUNDS_DIR}/bell.oga`;
  }
  return null;
}

function getSoundConfig() {
  const cfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
  return {
    enabled: cfg.get('enabled', true),
    providers: {
      claude: cfg.get('providers.claude', true),
      antigravity: cfg.get('providers.antigravity', true),
      copilot: cfg.get('providers.copilot', true)
    },
    taskCompleted: {
      enabled: cfg.get('taskCompleted.enabled', true),
      sound: cfg.get('taskCompleted.sound', IS_WIN ? 'tada' : 'Hero')
    },
    needsInput: {
      enabled: cfg.get('needsInput.enabled', true),
      sound: cfg.get('needsInput.sound', IS_WIN ? 'chimes' : 'Glass')
    },
    limitAvailable: {
      enabled: cfg.get('limitAvailable.enabled', true),
      sound: cfg.get('limitAvailable.sound', IS_WIN ? 'chimes' : 'Glass')
    }
  };
}

class SoundNotifier {
  constructor(context) {
    this.context = context;
    this.isInitialRun = true;
    this.knownSessions = new Map();
    this.knownQuotaLimited = { claude: false, antigravity: false };
    this.lastSoundTime = {
      taskCompleted: 0,
      needsInput: 0,
      limitAvailable: 0
    };
  }

  isSoundEnabled() {
    return vscode.workspace.getConfiguration('sessionDashboard.sound').get('enabled', true);
  }

  async toggleSound() {
    const current = this.isSoundEnabled();
    const next = !current;
    await vscode.workspace.getConfiguration('sessionDashboard.sound').update('enabled', next, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(next ? 'AI Session Dashboard: Sounds aktiviert 🔊' : 'AI Session Dashboard: Sounds stummgeschaltet 🔇');
    return next;
  }

  previewSound(eventType) {
    const config = getSoundConfig();
    const soundSetting = config[eventType]?.sound;
    const soundPath = resolveSoundPath(soundSetting, eventType);
    playSoundFile(soundPath);
  }

  playSound(eventType, provider = '') {
    const config = getSoundConfig();
    if (!config.enabled) return;

    if (provider && provider !== 'quota') {
      const providerEnabled = config.providers[provider];
      if (providerEnabled === false) return;
    }

    const eventCfg = config[eventType];
    if (!eventCfg || !eventCfg.enabled) return;

    const now = Date.now();
    if (now - (this.lastSoundTime[eventType] || 0) < 2500) {
      return;
    }
    this.lastSoundTime[eventType] = now;

    const soundPath = resolveSoundPath(eventCfg.sound, eventType);
    playSoundFile(soundPath);
  }

  evaluate(sessions, quota) {
    if (!sessions || !Array.isArray(sessions)) return;

    if (this.isInitialRun) {
      for (const s of sessions) {
        this.knownSessions.set(s.sessionId, {
          displayState: s.displayState,
          waitingFor: s.waitingFor || '',
          rateLimitResetsAt: (s.rateLimit && s.rateLimit.resetsAt) || 0,
          provider: s.provider,
          statusUpdatedAt: s.statusUpdatedAt || 0,
          resetNotified: false
        });
      }
      if (quota) {
        const cLim = Boolean(quota.claude && quota.claude.fiveHour && quota.claude.fiveHour.percent >= 100);
        const aLim = Boolean((quota.antigravity && quota.antigravity.isRateLimited) ||
                             (quota.antigravity && quota.antigravity.gemini && quota.antigravity.gemini.fiveHour && quota.antigravity.gemini.fiveHour.percent >= 100));
        this.knownQuotaLimited = { claude: cLim, antigravity: aLim };
      }
      this.isInitialRun = false;
      return;
    }

    const now = Date.now();

    for (const s of sessions) {
      const prev = this.knownSessions.get(s.sessionId);
      const resetsAt = (s.rateLimit && s.rateLimit.resetsAt) || 0;

      // 1. Task Completed: was busy, now finished
      if (prev && prev.displayState === 'busy') {
        const isNowFinished = (s.displayState === 'idle' || s.displayState === 'done' || s.displayState === 'bookmarked') && !s.waitingFor;
        if (isNowFinished) {
          this.playSound('taskCompleted', s.provider);
        }
      }

      // 2. Needs Input (Rückfrage / Question / Permission Prompt)
      const isWaitingForInput = s.displayState === 'waiting' && (
        s.waitingFor === 'Rückfrage' ||
        s.waitingFor === 'permission' ||
        s.waitingFor === 'prompt' ||
        s.rawStatus === 'waiting' ||
        (Boolean(s.waitingFor) && s.waitingFor !== 'Limit abgelaufen')
      );

      if (isWaitingForInput) {
        const wasWaitingBefore = prev && prev.displayState === 'waiting' && prev.waitingFor === s.waitingFor;
        if (!wasWaitingBefore) {
          this.playSound('needsInput', s.provider);
        }
      }

      // 3. Limit Available (Rate Limit Reset)
      let resetNotified = prev ? prev.resetNotified : false;
      const hadFutureReset = prev && prev.rateLimitResetsAt > 0 && prev.rateLimitResetsAt > (prev.statusUpdatedAt || 0);

      if (hadFutureReset && !resetNotified) {
        const timePassed = now >= prev.rateLimitResetsAt;
        const limitCleared = !s.rateLimit || (s.waitingFor === 'Limit abgelaufen');
        if (timePassed || limitCleared) {
          this.playSound('limitAvailable', s.provider);
          resetNotified = true;
        }
      } else if (!s.rateLimit) {
        resetNotified = false;
      }

      this.knownSessions.set(s.sessionId, {
        displayState: s.displayState,
        waitingFor: s.waitingFor || '',
        rateLimitResetsAt: resetsAt,
        provider: s.provider,
        statusUpdatedAt: s.statusUpdatedAt || 0,
        resetNotified
      });
    }

    // Check Global Quotas
    if (quota) {
      const cLim = Boolean(quota.claude && quota.claude.fiveHour && quota.claude.fiveHour.percent >= 100);
      const aLim = Boolean((quota.antigravity && quota.antigravity.isRateLimited) ||
                           (quota.antigravity && quota.antigravity.gemini && quota.antigravity.gemini.fiveHour && quota.antigravity.gemini.fiveHour.percent >= 100));

      if (this.knownQuotaLimited.claude && !cLim) {
        this.playSound('limitAvailable', 'claude');
      }
      if (this.knownQuotaLimited.antigravity && !aLim) {
        this.playSound('limitAvailable', 'antigravity');
      }

      this.knownQuotaLimited = { claude: cLim, antigravity: aLim };
    }
  }
}

module.exports = {
  SoundNotifier,
  WIN_SOUNDS,
  MACOS_SOUNDS,
  LINUX_SOUNDS
};
