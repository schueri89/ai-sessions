'use strict';

// "Done" marks, kept in the extension's globalState so they survive reloads.
// A mark is cleared as soon as the session starts working again, and dropped
// once the session's transcript no longer exists.

const KEY = 'sessionDashboard.done';

class DoneStore {
  constructor(memento) {
    this.memento = memento;
  }

  all() {
    return this.memento.get(KEY, {});
  }

  isDone(sessionId) {
    return Boolean(this.all()[sessionId]);
  }

  async mark(sessionId) {
    await this.markMany([sessionId]);
  }

  async markMany(sessionIds) {
    const now = Date.now();
    const marks = { ...this.all() };
    for (const id of sessionIds) marks[id] = { markedAt: now };
    await this.memento.update(KEY, marks);
  }

  async unmark(sessionId) {
    const marks = { ...this.all() };
    delete marks[sessionId];
    await this.memento.update(KEY, marks);
  }

  // live: sessions currently read from providers.
  // A mark is cleared ONLY when a session becomes active again (busy or waiting
  // for input), never simply because a scan was incomplete or failed.
  // Returns true if a mark was removed.
  async reconcile(live) {
    const marks = { ...this.all() };
    const liveById = new Map(live.map((s) => [s.sessionId, s]));
    let changed = false;
    for (const [id, mark] of Object.entries(marks)) {
      const s = liveById.get(id);
      const reactivated = s && (s.state === 'busy' || s.state === 'waiting' || (s.startedAt && s.startedAt > mark.markedAt)) && s.statusUpdatedAt > mark.markedAt;
      if (reactivated) {
        delete marks[id];
        changed = true;
      }
    }
    if (changed) await this.memento.update(KEY, marks);
    return changed;
  }
}

module.exports = { DoneStore };
