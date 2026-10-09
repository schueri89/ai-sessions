'use strict';

// Bookmarked / pinned sessions, kept in the extension's globalState so they survive reloads.
// A mark is removed when the user unpins or marks the session as done.

const KEY = 'sessionDashboard.bookmarks';

class BookmarkStore {
  constructor(memento) {
    this.memento = memento;
  }

  all() {
    return this.memento.get(KEY, {});
  }

  isBookmarked(sessionId) {
    return Boolean(this.all()[sessionId]);
  }

  async mark(sessionId) {
    const marks = { ...this.all() };
    marks[sessionId] = { bookmarkedAt: Date.now() };
    await this.memento.update(KEY, marks);
  }

  async unmark(sessionId) {
    const marks = { ...this.all() };
    delete marks[sessionId];
    await this.memento.update(KEY, marks);
  }

  async unmarkMany(sessionIds) {
    const marks = { ...this.all() };
    for (const id of sessionIds) delete marks[id];
    await this.memento.update(KEY, marks);
  }

  async toggle(sessionId) {
    if (this.isBookmarked(sessionId)) {
      await this.unmark(sessionId);
      return false;
    }
    await this.mark(sessionId);
    return true;
  }

  // Bookmarks are persistent user pins and are only removed explicitly
  // (via toggle/unmark, unmarkMany, or when marked done).
  // Reconcile is retained for interface compatibility.
  async reconcile() {
    return false;
  }
}

module.exports = { BookmarkStore };
