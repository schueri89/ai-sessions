'use strict';

// Sound notification engine for AI Session Dashboard.
// Plays distinct sounds when:
// 1. A session finishes a task (taskCompleted)
// 2. A session needs user input / asks a question (needsInput)
// 3. A rate limit or quota becomes available again (limitAvailable)

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execFile } = require('child_process');

const SHARED_SOUND_LOCK_FILE = path.join(os.tmpdir(), 'ai-sessions-sound.lock');

// Cross-window and cross-process sound debounce.
// Since each VS Code window runs its own extensionHost, all windows monitor the same
// global files (antigravity db, claude sessions). This shared lock prevents multiple windows
// from simultaneously playing the same notification sound.
function acquireSharedSoundLock(eventType, debounceMs = 2500, lockFile = SHARED_SOUND_LOCK_FILE) {
  const now = Date.now();
  try {
    let data = {};
    if (fs.existsSync(lockFile)) {
      try {
        data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      } catch {}
      const lastAny = Number(data.lastAny) || 0;
      const lastType = Number(data[eventType]) || 0;
      // Global cooldown: prevent any second sound from overlapping or trailing within 2500ms
      if (now - lastAny < 2500) {
        return false;
      }
      // Event-specific cooldown: prevent duplicate execution across windows
      if (now - lastType < debounceMs) {
        return false;
      }
    }
    data[eventType] = now;
    data.lastAny = now;
    fs.writeFileSync(lockFile, JSON.stringify(data), 'utf8');
    return true;
  } catch {
    // If temp file access fails (e.g. permission issues), fallback to allowing in-memory debounce
    return true;
  }
}

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

const WIN_SOUNDS = {
  'tada': 'C:\\Windows\\Media\\tada.wav',
  'chimes': 'C:\\Windows\\Media\\chimes.wav',
  'notify': 'C:\\Windows\\Media\\notify.wav',
  'chord': 'C:\\Windows\\Media\\chord.wav',
  'ding': 'C:\\Windows\\Media\\ding.wav',
  'ringin': 'C:\\Windows\\Media\\Windows Ringin.wav',
  'Windows Ringin': 'C:\\Windows\\Media\\Windows Ringin.wav',
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

const SOUND_ALIASES_WIN = {
  'Hero': 'tada',
  'Glass': 'chimes',
  'Ping': 'ding',
  'Pop': 'notify',
  'Submarine': 'chord',
  'Basso': 'chord',
  'Blow': 'ringin',
  'Bottle': 'chimes',
  'Funk': 'notify',
  'Morse': 'ding',
  'Purr': 'Windows Background',
  'Sosumi': 'chord',
  'Tink': 'Windows Background',
  'Frog': 'chord'
};

const SOUND_ALIASES_MAC = {
  'tada': 'Hero',
  'ding': 'Ping',
  'chimes': 'Glass',
  'notify': 'Pop',
  'chord': 'Submarine',
  'ringin': 'Blow',
  'Windows Ringin': 'Blow',
  'Windows Notify': 'Glass',
  'Windows Background': 'Tink'
};

const SOUND_ALIASES_LINUX = {
  'tada': `${LINUX_SOUNDS_DIR}/complete.oga`,
  'Hero': `${LINUX_SOUNDS_DIR}/complete.oga`,
  'chimes': `${LINUX_SOUNDS_DIR}/bell.oga`,
  'Glass': `${LINUX_SOUNDS_DIR}/bell.oga`,
  'ding': `${LINUX_SOUNDS_DIR}/message.oga`,
  'Ping': `${LINUX_SOUNDS_DIR}/message.oga`,
  'notify': `${LINUX_SOUNDS_DIR}/message.oga`,
  'Pop': `${LINUX_SOUNDS_DIR}/message.oga`,
  'chord': `${LINUX_SOUNDS_DIR}/bell.oga`,
  'Submarine': `${LINUX_SOUNDS_DIR}/bell.oga`,
  'ringin': `${LINUX_SOUNDS_DIR}/message.oga`,
  'Windows Ringin': `${LINUX_SOUNDS_DIR}/message.oga`,
  'Windows Notify': `${LINUX_SOUNDS_DIR}/message.oga`,
  'Windows Background': `${LINUX_SOUNDS_DIR}/bell.oga`
};

const SOUND_OPTIONS = [
  { id: 'tada', label: 'Tada (Fanfare / Erfolg)', description: 'Standard beim Beenden einer Aufgabe (taskCompleted)' },
  { id: 'ding', label: 'Ding (Dezenter Ping)', description: 'Standard für Leerlauf-Reminder (idleReminder)' },
  { id: 'chimes', label: 'Chimes (Harmonische Glocken)', description: 'Standard bei Rückfragen und Limit-Reset' },
  { id: 'notify', label: 'Notify (Moderne Benachrichtigung)', description: 'Subtiler Hinweiston' },
  { id: 'chord', label: 'Chord (Klassischer Akkord)', description: 'Prägnanter System-Akkord' },
  { id: 'ringin', label: 'Ringin (Rufsignal / Klingelton)', description: 'Auffälliger Signalton' },
  { id: 'Windows Notify', label: 'Windows Notify', description: 'Windows Standard-Benachrichtigung' },
  { id: 'Windows Background', label: 'Windows Background', description: 'Sehr sanfter Hintergrundton' },
  { id: 'Hero', label: 'Hero (macOS Fanfare)', description: 'macOS Erfolgs-Signal' },
  { id: 'Glass', label: 'Glass (macOS Glockenton)', description: 'macOS Glasklarer Hinweis' },
  { id: 'Ping', label: 'Ping (macOS Sonar-Ping)', description: 'macOS Dezenter Ping' },
  { id: 'Pop', label: 'Pop (macOS Blase / Klick)', description: 'macOS Kurzer Pop-Laut' },
  { id: 'none', label: 'Kein Sound (Stumm)', description: 'Diesen Benachrichtigungston stummschalten' }
];

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
  if (!soundName || soundName === 'none' || soundName === 'off') {
    return null;
  }
  if ((soundName.includes('/') || soundName.includes('\\')) && fs.existsSync(soundName)) {
    return soundName;
  }
  if (IS_WIN) {
    if (WIN_SOUNDS[soundName]) return WIN_SOUNDS[soundName];
    const mapped = SOUND_ALIASES_WIN[soundName];
    if (mapped && WIN_SOUNDS[mapped]) return WIN_SOUNDS[mapped];
    if (eventType === 'taskCompleted') return WIN_SOUNDS['tada'];
    if (eventType === 'idleReminder') return WIN_SOUNDS['ding'];
    return WIN_SOUNDS['chimes']; // needsInput & limitAvailable
  }
  if (IS_MAC) {
    if (MACOS_SOUNDS[soundName]) return MACOS_SOUNDS[soundName];
    const mapped = SOUND_ALIASES_MAC[soundName];
    if (mapped && MACOS_SOUNDS[mapped]) return MACOS_SOUNDS[mapped];
    if (eventType === 'taskCompleted') return MACOS_SOUNDS['Hero'];
    if (eventType === 'idleReminder') return MACOS_SOUNDS['Ping'];
    return MACOS_SOUNDS['Glass'];
  }
  if (IS_LINUX) {
    if (LINUX_SOUNDS[soundName]) return LINUX_SOUNDS[soundName];
    const mapped = SOUND_ALIASES_LINUX[soundName];
    if (mapped) return mapped;
    if (eventType === 'taskCompleted') return `${LINUX_SOUNDS_DIR}/complete.oga`;
    if (eventType === 'idleReminder') return `${LINUX_SOUNDS_DIR}/message.oga`;
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
      copilot: cfg.get('providers.copilot', true),
      codex: cfg.get('providers.codex', true)
    },
    taskCompleted: {
      enabled: cfg.get('taskCompleted.enabled', true),
      sound: cfg.get('taskCompleted.sound', IS_WIN ? 'tada' : 'Hero')
    },
    idleReminder: {
      enabled: cfg.get('idleReminder.enabled', true),
      sound: cfg.get('idleReminder.sound', IS_WIN ? 'ding' : 'Ping'),
      delaySeconds: cfg.get('idleReminder.delaySeconds', 60)
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
      idleReminder: 0,
      needsInput: 0,
      limitAvailable: 0
    };
    this.idleTimers = new Map();
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

  previewSound(eventTypeOrSoundName) {
    if (!eventTypeOrSoundName || eventTypeOrSoundName === 'none' || eventTypeOrSoundName === 'off') {
      return;
    }
    const config = getSoundConfig();
    let soundSetting;
    let eventType;
    if (config[eventTypeOrSoundName]) {
      eventType = eventTypeOrSoundName;
      soundSetting = config[eventType]?.sound;
    } else {
      soundSetting = eventTypeOrSoundName;
      eventType = 'taskCompleted';
    }
    const soundPath = resolveSoundPath(soundSetting, eventType);
    if (soundPath) {
      playSoundFile(soundPath);
    }
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
    // 1. In-memory debounce for this window
    if (now - (this.lastSoundTime[eventType] || 0) < 2500) {
      return;
    }

    // 2. Cross-window / cross-process lock across all open VS Code windows
    if (!acquireSharedSoundLock(eventType, 2500)) {
      this.lastSoundTime[eventType] = now;
      return;
    }

    this.lastSoundTime[eventType] = now;

    const soundPath = resolveSoundPath(eventCfg.sound, eventType);
    if (!soundPath) return;
    playSoundFile(soundPath);
  }

  evaluate(sessions, quota) {
    if (!sessions || !Array.isArray(sessions)) return { completedSessionIds: [] };

    if (this.isInitialRun) {
      for (const s of sessions) {
        this.knownSessions.set(s.sessionId, {
          displayState: s.displayState,
          waitingFor: s.waitingFor || '',
          rateLimitResetsAt: (s.rateLimit && s.rateLimit.resetsAt) || 0,
          provider: s.provider,
          statusUpdatedAt: s.statusUpdatedAt || 0,
          resetNotified: false,
          becameIdleAt: 0,
          idleReminderSent: true
        });
      }
      if (quota) {
        const cLim = Boolean(quota.claude && quota.claude.fiveHour && quota.claude.fiveHour.percent >= 100);
        const aLim = Boolean((quota.antigravity && quota.antigravity.isRateLimited) ||
                             (quota.antigravity && quota.antigravity.gemini && quota.antigravity.gemini.fiveHour && quota.antigravity.gemini.fiveHour.percent >= 100) ||
                             (quota.antigravity && quota.antigravity.argon && quota.antigravity.argon.weekly && quota.antigravity.argon.weekly.percent >= 100));
        this.knownQuotaLimited = { claude: cLim, antigravity: aLim };
      }
      this.isInitialRun = false;
      return { completedSessionIds: [] };
    }

    const config = getSoundConfig();
    const now = Date.now();
    const completedSessionIds = [];

    for (const s of sessions) {
      const prev = this.knownSessions.get(s.sessionId);
      const resetsAt = (s.rateLimit && s.rateLimit.resetsAt) || 0;
      let becameIdleAt = prev ? (prev.becameIdleAt || 0) : 0;
      let idleReminderSent = prev ? Boolean(prev.idleReminderSent) : true;

      // 1. Task Completed: was busy, now finished
      if (prev && prev.displayState === 'busy') {
        const isNowFinished = (s.displayState === 'idle' || s.displayState === 'done' || s.displayState === 'bookmarked') && !s.waitingFor;
        if (isNowFinished) {
          completedSessionIds.push(s.sessionId);
          this.playSound('taskCompleted', s.provider);
          becameIdleAt = now;
          idleReminderSent = false;
          this.scheduleIdleReminder(s.sessionId, s.provider, (config.idleReminder?.delaySeconds || 60) * 1000);
        }
      }

      // If session transitions back to busy or done or closed: cancel idle timer
      if (s.displayState === 'busy' || s.displayState === 'done' || s.rawStatus === 'closed') {
        this.cancelIdleTimer(s.sessionId);
        becameIdleAt = 0;
        idleReminderSent = true;
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

      // 4. Idle Reminder (z. B. Claudes idle_prompt nach 60s Leerlauf)
      const isLiveIdle = (s.displayState === 'idle' || s.state === 'idle') && s.rawStatus !== 'closed' && !s.waitingFor;
      const isExplicitIdlePrompt = s.waitingFor === 'idle_prompt' || s.rawStatus === 'idle_prompt';
      if (isLiveIdle && !idleReminderSent) {
        const delayMs = (config.idleReminder?.delaySeconds || 60) * 1000;
        if (isExplicitIdlePrompt || (becameIdleAt > 0 && now - becameIdleAt >= delayMs)) {
          this.playSound('idleReminder', s.provider);
          idleReminderSent = true;
          this.cancelIdleTimer(s.sessionId);
        }
      }

      this.knownSessions.set(s.sessionId, {
        displayState: s.displayState,
        waitingFor: s.waitingFor || '',
        rateLimitResetsAt: resetsAt,
        provider: s.provider,
        statusUpdatedAt: s.statusUpdatedAt || 0,
        resetNotified,
        becameIdleAt,
        idleReminderSent
      });
    }

    // Cancel timers for sessions that are no longer present
    const currentSessionIds = new Set(sessions.map((s) => s.sessionId));
    for (const sid of this.idleTimers.keys()) {
      if (!currentSessionIds.has(sid)) {
        this.cancelIdleTimer(sid);
      }
    }

    // Check Global Quotas
    if (quota) {
      const cLim = Boolean(quota.claude && quota.claude.fiveHour && quota.claude.fiveHour.percent >= 100);
      const aLim = Boolean((quota.antigravity && quota.antigravity.isRateLimited) ||
                           (quota.antigravity && quota.antigravity.gemini && quota.antigravity.gemini.fiveHour && quota.antigravity.gemini.fiveHour.percent >= 100) ||
                           (quota.antigravity && quota.antigravity.argon && quota.antigravity.argon.weekly && quota.antigravity.argon.weekly.percent >= 100));

      if (this.knownQuotaLimited.claude && !cLim) {
        this.playSound('limitAvailable', 'claude');
      }
      if (this.knownQuotaLimited.antigravity && !aLim) {
        this.playSound('limitAvailable', 'antigravity');
      }

      this.knownQuotaLimited = { claude: cLim, antigravity: aLim };
    }

    return { completedSessionIds };
  }

  scheduleIdleReminder(sessionId, provider, delayMs) {
    this.cancelIdleTimer(sessionId);
    const cfg = getSoundConfig();
    if (!cfg.enabled || !cfg.idleReminder?.enabled) return;
    if (provider && provider !== 'quota' && cfg.providers[provider] === false) return;
    const ms = Math.max(1000, Number(delayMs) || 60000);
    const timer = setTimeout(() => {
      this.idleTimers.delete(sessionId);
      const s = this.knownSessions.get(sessionId);
      if (s && (s.displayState === 'idle' || s.state === 'idle') && !s.idleReminderSent && !s.waitingFor) {
        this.playSound('idleReminder', provider);
        s.idleReminderSent = true;
      }
    }, ms);
    this.idleTimers.set(sessionId, timer);
  }

  cancelIdleTimer(sessionId) {
    if (this.idleTimers.has(sessionId)) {
      clearTimeout(this.idleTimers.get(sessionId));
      this.idleTimers.delete(sessionId);
    }
  }

  dispose() {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
  }
}

module.exports = {
  SoundNotifier,
  WIN_SOUNDS,
  MACOS_SOUNDS,
  LINUX_SOUNDS,
  SOUND_OPTIONS,
  SHARED_SOUND_LOCK_FILE,
  acquireSharedSoundLock,
  resolveSoundPath
};
