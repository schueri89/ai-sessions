'use strict';

// Manual project assignments per session, kept in the extension's globalState so they survive reloads.
// Overrides the heuristic project resolution (resolveProject) whenever present.

const KEY = 'sessionDashboard.projectOverrides';

class ProjectStore {
  constructor(memento) {
    this.memento = memento;
  }

  all() {
    return this.memento.get(KEY, {});
  }

  getOverride(sessionId) {
    if (!sessionId) return null;
    const entry = this.all()[sessionId];
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return typeof entry.project === 'string' ? entry.project : null;
  }

  async setOverride(sessionId, project) {
    if (!sessionId) return;
    const marks = { ...this.all() };
    const clean = typeof project === 'string' ? project.trim() : '';
    if (!clean) {
      delete marks[sessionId];
    } else {
      marks[sessionId] = {
        project: clean,
        assignedAt: Date.now()
      };
    }
    await this.memento.update(KEY, marks);
  }

  async removeOverride(sessionId) {
    if (!sessionId) return;
    const marks = { ...this.all() };
    if (marks[sessionId]) {
      delete marks[sessionId];
      await this.memento.update(KEY, marks);
    }
  }

  // Project overrides are user choices and remain persistent across session restarts.
  async reconcile() {
    return false;
  }
}

module.exports = {
  ProjectStore
};

