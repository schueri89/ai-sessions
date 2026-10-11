'use strict';

// Ticket assignments per session, kept in the extension's globalState so they survive reloads.
// Also provides helper methods to auto-detect Jira ticket patterns from titles/prompts
// and to construct complete Jira URLs based on settings.

const KEY = 'sessionDashboard.tickets';

const TICKET_REGEX = /\b([a-zA-Z]{2,10}-\d+)\b/;

function detectTicket(text) {
  if (!text || typeof text !== 'string') return null;
  const match = TICKET_REGEX.exec(text);
  return match ? match[1].toUpperCase() : null;
}

function buildJiraUrl(baseUrl, ticket) {
  if (!baseUrl || !ticket) return '';
  const trimmed = baseUrl.trim();
  const cleanKey = ticket.trim().toUpperCase();
  if (trimmed.includes('${ticket}')) {
    return trimmed.replace('${ticket}', encodeURIComponent(cleanKey));
  }
  if (trimmed.includes('{ticket}')) {
    return trimmed.replace('{ticket}', encodeURIComponent(cleanKey));
  }
  if (!trimmed.includes('/browse') && !trimmed.endsWith('/')) {
    return `${trimmed}/browse/${encodeURIComponent(cleanKey)}`;
  }
  const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  return `${base}${encodeURIComponent(cleanKey)}`;
}

class TicketStore {
  constructor(memento) {
    this.memento = memento;
  }

  all() {
    return this.memento.get(KEY, {});
  }

  getTicket(sessionId) {
    const entry = this.all()[sessionId];
    if (!entry) return null;
    return typeof entry === 'string' ? entry : (entry.ticket || null);
  }

  async setTicket(sessionId, ticket) {
    const marks = { ...this.all() };
    if (!ticket || !ticket.trim()) {
      delete marks[sessionId];
    } else {
      marks[sessionId] = {
        ticket: ticket.trim().toUpperCase(),
        assignedAt: Date.now()
      };
    }
    await this.memento.update(KEY, marks);
  }

  async removeTicket(sessionId) {
    const marks = { ...this.all() };
    delete marks[sessionId];
    await this.memento.update(KEY, marks);
  }

  async reconcile() {
    return false;
  }
}

module.exports = {
  TicketStore,
  detectTicket,
  buildJiraUrl
};
