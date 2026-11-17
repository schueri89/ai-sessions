'use strict';

// Shared HTML5 Canvas office floor view used by both BoardPanel (sub-tab) and OfficePanel (popout).

const OFFICE_ACTIVE_STATES = ['waiting', 'busy', 'bookmarked', 'idle'];

const CARD_ICONS = {
  claude: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>',
  antigravity: '<svg viewBox="0 0 113 113" width="14" height="14" fill="currentColor"><path d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z"/></svg>',
  copilot: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
  codex: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13.795 23.856q-1.188 0-2.256-.448a6.1 6.1 0 0 1-1.9-1.247 5.8 5.8 0 0 1-1.875.306 5.8 5.8 0 0 1-2.944-.777 6.1 6.1 0 0 1-2.184-2.12q-.807-1.34-.808-2.99 0-.682.19-1.482a6.3 6.3 0 0 1-1.472-2.002 5.76 5.76 0 0 1 .024-4.85q.546-1.177 1.52-2.024a5.5 5.5 0 0 1 2.303-1.2A5.55 5.55 0 0 1 5.485 2.62 6.06 6.06 0 0 1 7.575.925 5.85 5.85 0 0 1 10.21.313q1.187 0 2.255.447a6.1 6.1 0 0 1 1.9 1.248 5.8 5.8 0 0 1 1.875-.306q1.59 0 2.944.776a5.9 5.9 0 0 1 2.16 2.12q.832 1.34.832 2.99 0 .682-.19 1.483a6.2 6.2 0 0 1 1.472 2.024q.522 1.13.522 2.378 0 1.272-.546 2.449a6.1 6.1 0 0 1-1.543 2.048 5.45 5.45 0 0 1-2.28 1.177 5.4 5.4 0 0 1-1.115 2.402 5.8 5.8 0 0 1-2.066 1.695 5.85 5.85 0 0 1-2.635.612M7.93 20.913q1.188 0 2.066-.495l4.463-2.542a.52.52 0 0 0 .238-.448v-2.024L8.95 18.676a.97.97 0 0 1-1.044 0L3.419 16.11a.7.7 0 0 1-.024.165v.282q0 1.201.57 2.213.594.99 1.639 1.554 1.044.59 2.326.589m.238-3.838q.143.07.26.07a.46.46 0 0 0 .238-.07l1.781-1.012-5.722-3.296q-.522-.306-.522-.918v-5.11a4.27 4.27 0 0 0-1.9 1.602 4.13 4.13 0 0 0-.712 2.354q0 1.155.594 2.213.593 1.06 1.543 1.601zm5.627 5.227q1.258 0 2.279-.565a4.25 4.25 0 0 0 1.614-1.554q.594-.99.594-2.213v-5.085q0-.283-.237-.424l-1.805-1.036v6.568q0 .613-.522.919l-4.487 2.566q1.163.825 2.564.824m.902-8.617v-3.202l-2.683-1.507-2.707 1.507v3.202l2.707 1.507zm-6.933-7.51q0-.612.522-.918l4.488-2.567a4.34 4.34 0 0 0-2.564-.824q-1.26 0-2.28.565a4.25 4.25 0 0 0-1.614 1.554q-.57.99-.57 2.213v5.062q0 .283.237.447l1.781 1.036zm12.061 11.253a4.13 4.13 0 0 0 1.876-1.6 4.2 4.2 0 0 0 .712-2.355q0-1.154-.593-2.213-.594-1.06-1.544-1.6l-4.44-2.543q-.142-.095-.26-.071a.46.46 0 0 0-.238.07l-1.78.99 5.745 3.319q.26.141.38.377a.9.9 0 0 1 .142.518zm-4.772-11.96q.522-.33 1.045 0l4.51 2.614v-.424q0-1.13-.57-2.142a4.1 4.1 0 0 0-1.59-1.648q-1.02-.613-2.374-.613-1.187 0-2.066.495L9.545 6.292a.52.52 0 0 0-.238.448v2.025z"/></svg>',
  cline: '<svg viewBox="0 0 113 113" width="14" height="14" fill="currentColor"><path d="M56.4998 8.99805L56.4999 5.29805H56.4998V8.99805ZM68.4998 20.708L72.1998 20.7081V20.708H68.4998ZM67.9929 25L64.3662 24.2671L63.4704 28.7H67.9929V25ZM84.4998 25L84.4998 21.3H84.4998V25ZM95.7 49.7998H92V51.2066L92.9346 52.258L95.7 49.7998ZM108.027 63.667L110.793 61.2088L110.792 61.2088L108.027 63.667ZM108.027 64.7305L110.792 67.1887L110.793 67.1883L108.027 64.7305ZM95.7 78.5977L92.9346 76.1394L92 77.1909V78.5977H95.7ZM95.7 92.2002L99.3999 92.2002V92.2002H95.7ZM84.4998 103.4V107.1H84.4998L84.4998 103.4ZM17.2996 92.2002H13.5996V92.2002L17.2996 92.2002ZM17.2996 78.5986H20.9996V77.1918L20.0649 76.1404L17.2996 78.5986ZM4.97144 64.7305L2.20602 67.1886L2.20611 67.1887L4.97144 64.7305ZM4.97144 63.667L7.73685 66.1251L7.73685 66.1251L4.97144 63.667ZM17.2996 49.7979L20.065 52.256L20.9996 51.2046V49.7979H17.2996ZM45.0066 25V28.7H49.5292L48.6333 24.267L45.0066 25ZM44.4998 20.708H40.7998V20.7081L44.4998 20.708ZM56.4998 8.99805L56.4996 12.698C61.1812 12.6982 64.7998 16.3247 64.7998 20.708H68.4998H72.1998C72.1998 12.0452 65.0728 5.29829 56.4999 5.29805L56.4998 8.99805ZM68.4998 20.708L64.7998 20.7079C64.7997 21.6154 64.6614 22.8066 64.3662 24.2671L67.9929 25L71.6196 25.7329C71.969 24.004 72.1997 22.2864 72.1998 20.7081L68.4998 20.708ZM67.9929 25V28.7H84.4998V25V21.3H67.9929V25ZM84.4998 25L84.4997 28.7C88.6419 28.7001 92 32.0582 92 36.2002H95.7H99.3999C99.3999 27.9712 92.7287 21.3001 84.4998 21.3L84.4998 25ZM95.7 36.2002H92V49.7998H95.7H99.3999V36.2002H95.7ZM95.7 49.7998L92.9346 52.258L105.262 66.1252L108.027 63.667L110.792 61.2088L98.4653 47.3416L95.7 49.7998ZM108.027 63.667L105.262 66.1251C104.285 65.026 104.285 63.371 105.261 62.2727L108.027 64.7305L110.793 67.1883C112.308 65.4837 112.308 62.9141 110.793 61.2088L108.027 63.667ZM108.027 64.7305L105.262 62.2722L92.9346 76.1394L95.7 78.5977L98.4653 81.0559L110.792 67.1887L108.027 64.7305ZM95.7 78.5977H92V92.2002H95.7H99.3999V78.5977H95.7ZM95.7 92.2002L92 92.2002C91.9999 96.3422 88.6418 99.7003 84.4997 99.7004L84.4998 103.4L84.4998 107.1C92.7287 107.1 99.3999 100.429 99.3999 92.2002L95.7 92.2002ZM84.4998 103.4V99.7004H28.4998V103.4V107.1H84.4998V103.4ZM28.4998 103.4V99.7004C24.3577 99.7004 20.9996 96.3423 20.9996 92.2002L17.2996 92.2002L13.5996 92.2002C13.5996 100.429 20.2707 107.1 28.4998 107.1V103.4ZM17.2996 92.2002H20.9996V78.5986H17.2996H13.5996V92.2002H17.2996ZM17.2996 78.5986L20.0649 76.1404L7.73676 62.2722L4.97144 64.7305L2.20611 67.1887L14.5342 81.0569L17.2996 78.5986ZM4.97144 64.7305L7.73685 62.2723C8.71353 63.3711 8.71353 65.0264 7.73685 66.1251L4.97144 63.667L2.20602 61.2088C0.690476 62.9138 0.690476 65.4836 2.20602 67.1886L4.97144 64.7305ZM4.97144 63.667L7.73685 66.1251L20.065 52.256L17.2996 49.7979L14.5341 47.3397L2.20602 61.2088L4.97144 63.667ZM17.2996 49.7979H20.9996V36.2002H17.2996H13.5996V49.7979H17.2996ZM17.2996 36.2002H20.9996C20.9996 32.0581 24.3576 28.7 28.4998 28.7V25V21.3C20.2707 21.3 13.5996 27.9712 13.5996 36.2002H17.2996ZM28.4998 25V28.7H45.0066V25V21.3H28.4998V25ZM45.0066 25L48.6333 24.267C48.3381 22.8066 48.1998 21.6154 48.1998 20.7079L44.4998 20.708L40.7998 20.7081C40.7998 22.2864 41.0305 24.0039 41.3799 25.733L45.0066 25ZM44.4998 20.708H48.1998C48.1998 16.3244 51.8182 12.698 56.4998 12.698V8.99805V5.29805C47.9264 5.29805 40.7998 12.0451 40.7998 20.708H44.4998Z"/><rect x="66.1001" y="49.8008" width="9.6" height="28.8" rx="4.8"/><rect x="37.3" y="49.8008" width="9.6" height="28.8" rx="4.8"/></svg>',
  pin: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.923-1.414.728-.195-.195.533-1.22.728-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>',
  jira: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84zM6.77 6.8a4.36 4.36 0 0 0 4.34 4.34h1.8v1.72a4.36 4.36 0 0 0 4.34 4.34V7.63a.84.84 0 0 0-.84-.83zM2 11.6a4.35 4.35 0 0 0 4.35 4.34h1.78v1.72a4.35 4.35 0 0 0 4.34 4.34v-9.56a.84.84 0 0 0-.84-.84z"/></svg>'
};

const PROVIDER_PALETTE = {
  claude: { label: 'Claude Code', color: '#E87040', shirt: '#D96336', hair: '#3B281E' },
  antigravity: { label: 'Antigravity', color: '#4B8BF4', shirt: '#3B78DB', hair: '#1E293B' },
  copilot: { label: 'GitHub Copilot', color: '#9D6BFF', shirt: '#7C4DFF', hair: '#4A3728' },
  codex: { label: 'OpenAI Codex', color: '#2FA87E', shirt: '#238A66', hair: '#2D2D2D' },
  cline: { label: 'Cline', color: '#06B6D4', shirt: '#0891B2', hair: '#1F2937' }
};

function buildOfficeLayout(columns, previousSlots, options = {}) {
  const colsPerRow = Math.max(2, Number(options.colsPerRow) || 4);
  const maxDesks = options && options.maxDesks !== undefined && options.maxDesks !== null
    ? Math.max(4, Number(options.maxDesks))
    : Infinity;
  const activeSet = new Set(Array.isArray(options.activeStates) ? options.activeStates : OFFICE_ACTIVE_STATES);

  const flatSessions = [];
  const colList = Array.isArray(columns) ? columns : [];
  for (const col of colList) {
    if (!col || !activeSet.has(col.state) || !Array.isArray(col.sessions)) continue;
    for (const s of col.sessions) {
      if (!s || !s.sessionId) continue;
      flatSessions.push({
        ...s,
        state: col.state,
        stateLabel: col.label || col.state
      });
    }
  }

  // Sort desks by date (newest first).
  flatSessions.sort((a, b) => (Number(b.statusUpdatedAt) || 0) - (Number(a.statusUpdatedAt) || 0));

  const bounded = Number.isFinite(maxDesks) ? flatSessions.slice(0, maxDesks) : flatSessions;
  const nextSlots = new Map();
  bounded.forEach((s, idx) => {
    nextSlots.set(s.sessionId, idx);
  });

  const maxSlot = bounded.length > 0 ? bounded.length - 1 : 0;
  const rows = Math.max(2, Math.ceil(Math.max(bounded.length, maxSlot + 1) / colsPerRow));
  const deskWidth = 100;
  const deskStepX = 148;
  const deskStepY = 108;
  const originX = 48;
  const originY = 58;
  const loungeWidth = 156;
  const canvasWidth = originX + colsPerRow * deskStepX + loungeWidth;
  const canvasHeight = Math.max(408, originY + rows * deskStepY + 24);

  const items = bounded.map((s) => {
    const slot = nextSlots.get(s.sessionId) || 0;
    const colIdx = slot % colsPerRow;
    const rowIdx = Math.floor(slot / colsPerRow);
    return {
      ...s,
      slot,
      desk: {
        x: originX + colIdx * deskStepX,
        y: originY + rowIdx * deskStepY,
        w: deskWidth
      }
    };
  });

  return {
    items,
    slots: nextSlots,
    rows,
    colsPerRow,
    canvasWidth,
    canvasHeight,
    totalActive: flatSessions.length,
    truncated: flatSessions.length > bounded.length
  };
}

function getOfficeStyles() {
  return `
  .office-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }
  .office-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.08));
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
  }
  .office-toolbar-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .office-toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .office-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .office-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .office-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .office-popout-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .office-popout-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .office-canvas-wrap {
    position: relative;
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-editor-background);
  }
  .office-canvas {
    display: block;
    width: 100%;
    height: auto;
    image-rendering: pixelated;
    cursor: default;
  }
  .office-tooltip {
    position: absolute;
    pointer-events: none;
    z-index: 20;
    max-width: 280px;
    padding: 6px 9px;
    border-radius: 5px;
    font-size: 11.5px;
    line-height: 1.35;
    background: var(--vscode-editorHoverWidget-background, #1e293b);
    color: var(--vscode-editorHoverWidget-foreground, #f8fafc);
    border: 1px solid var(--vscode-editorHoverWidget-border, rgba(148, 163, 184, 0.35));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    display: none;
  }
  .office-inspector {
    position: sticky;
    top: 6px;
    z-index: 15;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 6px;
    min-height: 38px;
    font-size: 12.5px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background, #1e1e1e));
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
  }
  .office-inspector-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
    min-width: 0;
  }
  .office-inspector-title {
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .office-inspector-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .office-act-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .office-act-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .office-act-btn.primary {
    border-color: transparent;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-weight: 500;
  }
  .office-act-btn.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .office-provider-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    line-height: 1;
  }
  .office-provider-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  .office-provider-icon.claude { color: #ff9e79; background: rgba(242, 101, 34, 0.18); border: 1px solid rgba(255, 158, 121, 0.35); }
  .office-provider-icon.antigravity { color: #70a9ff; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(112, 169, 255, 0.35); }
  .office-provider-icon.copilot { color: #34d399; background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(52, 211, 153, 0.35); }
  .office-provider-icon.codex { color: #10a37f; background: rgba(16, 163, 127, 0.18); border: 1px solid rgba(16, 163, 127, 0.35); }
  .office-provider-icon.cline { color: #388bfd; background: rgba(56, 139, 253, 0.18); border: 1px solid rgba(56, 139, 253, 0.35); }
  .office-project-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
    line-height: 1.35;
    background: var(--vscode-badge-background, rgba(128, 128, 128, 0.2));
    color: var(--vscode-badge-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .office-project-badge:hover {
    filter: brightness(1.2);
    border-color: var(--vscode-focusBorder, #007acc);
  }
  .office-project-badge.unassigned {
    border-style: dashed;
    opacity: 0.9;
  }
  .office-pin-btn {
    background: transparent;
    border: 1px solid transparent;
    padding: 3px 5px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    color: var(--vscode-descriptionForeground);
    opacity: 0.65;
    transition: all 0.15s ease;
  }
  .office-pin-btn:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
  }
  .office-pin-btn.active {
    opacity: 1;
    color: var(--vscode-charts-yellow, #e5c07b);
  }
  .office-pin-btn svg {
    width: 14px;
    height: 14px;
    display: block;
    pointer-events: none;
  }
  .office-jira-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 3px;
    background: rgba(38, 132, 255, 0.15);
    color: #4c9aff;
    border: 1px solid rgba(38, 132, 255, 0.3);
    cursor: pointer;
    line-height: 1.3;
    transition: background 0.15s, border-color 0.15s;
  }
  .office-jira-pill:hover {
    background: rgba(38, 132, 255, 0.25);
    border-color: rgba(38, 132, 255, 0.5);
  }
  .office-jira-pill svg {
    width: 12px;
    height: 12px;
    display: block;
    pointer-events: none;
  }
  .office-jira-remove-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
    opacity: 0.6;
    transition: opacity 0.15s, background-color 0.15s;
    line-height: 1;
    display: inline-flex;
    align-items: center;
  }
  .office-jira-remove-btn:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
  }
  .office-jira-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 3px;
    background: transparent;
    color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.8));
    border: 1px dashed var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    cursor: pointer;
    transition: all 0.15s ease;
    line-height: 1.3;
    opacity: 0.8;
  }
  .office-jira-add-btn:hover {
    opacity: 1;
    background: rgba(38, 132, 255, 0.15);
    color: #4c9aff;
    border-color: rgba(38, 132, 255, 0.4);
    border-style: solid;
  }
  .office-jira-add-btn svg {
    width: 12px;
    height: 12px;
    display: block;
    pointer-events: none;
  }
  .office-popout-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .office-popout-select {
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.3)));
  }
  .office-popout-hint {
    font-size: 11.5px;
    color: var(--vscode-descriptionForeground);
  }`;
}

function getOfficeHtml(options = {}) {
  const isPopout = Boolean(options.isPopout);
  const popoutFilters = isPopout
    ? `<div class="office-popout-filters">
        <select id="office-provider-select" class="office-popout-select" title="Nach Provider filtern">
          <option value="all">Alle Provider</option>
          <option value="claude">Claude Code</option>
          <option value="antigravity">Antigravity</option>
          <option value="copilot">Copilot</option>
          <option value="codex">Codex</option>
          <option value="cline">Cline</option>
        </select>
        <select id="office-project-select" class="office-popout-select" title="Nach Projekt filtern">
          <option value="all">Alle Projekte</option>
        </select>
      </div>`
    : '';
  const rightAction = isPopout
    ? '<span class="office-popout-hint" title="Tab per Rechtsklick in ein neues Fenster verschieben, um es dauerhaft auf einem zweiten Monitor anzuzeigen.">Tipp: Rechtsklick auf Tab → „In neues Fenster verschieben“</span>'
    : '<button type="button" class="office-popout-btn" id="btn-office-popout" title="Büro-Ansicht im eigenen Tab öffnen (ideal für Zweitmonitor)">↗ Popout</button>';

  return `
  <div class="office-toolbar">
    <div class="office-toolbar-left">
      ${popoutFilters}
      <div class="office-legend" id="office-legend"></div>
    </div>
    <div class="office-toolbar-right">
      <button type="button" class="office-popout-btn" id="office-sim-pill" style="display: none;" title="Klick zum Zurücksetzen auf die echte Tageszeit"></button>
      <span id="office-truncation-note" class="office-popout-hint" style="display: none;"></span>
      ${rightAction}
    </div>
  </div>
  <div class="office-inspector" id="office-inspector">
    <div class="office-inspector-info" id="office-inspector-info">
      Klicke auf einen Schreibtisch im Büro, um Details zu sehen; Doppelklick öffnet direkt den Chat.
    </div>
    <div class="office-inspector-actions" id="office-inspector-actions"></div>
  </div>
  <div class="office-canvas-wrap">
    <canvas class="office-canvas" id="office-canvas" width="796" height="408"></canvas>
    <div class="office-tooltip" id="office-tooltip"></div>
  </div>`;
}

function getOfficeClientScript(options = {}) {
  const isPopout = Boolean(options.isPopout);
  return `
  (function () {
    const IS_POPOUT = ${isPopout ? 'true' : 'false'};
    const OFFICE_ACTIVE_STATES = ${JSON.stringify(OFFICE_ACTIVE_STATES)};
    const PROVIDER_PALETTE = ${JSON.stringify(PROVIDER_PALETTE)};
    const CARD_ICONS = ${JSON.stringify(CARD_ICONS)};
    const STATE_META = {
      waiting: { label: 'Wartet auf dich', color: '#F59E0B' },
      busy: { label: 'Arbeitet', color: '#3B82F6' },
      bookmarked: { label: 'Gemerkt', color: '#A855F7' },
      idle: { label: 'Fertig', color: '#22C55E' }
    };

    const buildOfficeLayout = ${buildOfficeLayout.toString()};

    const canvas = document.getElementById('office-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const legendEl = document.getElementById('office-legend');
    const simPillEl = document.getElementById('office-sim-pill');
    const truncEl = document.getElementById('office-truncation-note');
    const tooltipEl = document.getElementById('office-tooltip');
    const infoEl = document.getElementById('office-inspector-info');
    const actionsEl = document.getElementById('office-inspector-actions');
    const popoutBtn = document.getElementById('btn-office-popout');
    const providerSelect = document.getElementById('office-provider-select');
    const projectSelect = document.getElementById('office-project-select');

    const TOD_CYCLE = [null, 'dawn', 'day', 'evening', 'night'];
    const TOD_LABELS = {
      dawn: '🌅 Sonnenaufgang',
      day: '☀️ Tag',
      evening: '🌇 Sonnenuntergang',
      night: '🌙 Nacht'
    };

    const MAX_COFFEE_QUEUE = 3;
    const MAX_PLAY_SLOTS = 2;
    const MAX_CHAT_SLOTS = 2;
    const BAR_OPEN_HOUR = 16;
    const IDLE_COLD_COFFEE_MS = 30 * 60 * 1000;
    const LEISURE_DELAY_MIN_MS = 45000;
    const LEISURE_DELAY_MAX_MS = 180000;
    const LEISURE_RETRY_MIN_MS = 60000;
    const LEISURE_RETRY_MAX_MS = 150000;
    const LEISURE_DEPART_CHANCE = 0.35;
    const LEISURE_JOIN_CHANCE = 0.65;
    const LEISURE_GLOBAL_COOLDOWN_MS = 24000;
    const PLAY_DURATION_MIN_MS = 60000;
    const PLAY_DURATION_MAX_MS = 150000;
    const CHAT_DURATION_MIN_MS = 45000;
    const CHAT_DURATION_MAX_MS = 110000;
    const CELEBRATE_DURATION_MS = 2200;
    const BREW_DURATION_MS = 2600;
    const MAX_AT_COFFEE_MS = 12000;

    let deskSlots = new Map();
    let layout = { items: [], rows: 2, colsPerRow: 4, canvasWidth: 796, canvasHeight: 408, totalActive: 0, truncated: false };
    let jiraEnabled = false;
    let simulatedTod = null;
    let lastLeisureDepartureAt = 0;
    let selectedId = null;
    let hoveredId = null;
    let hoveredGhost = false;
    let tick = 0;
    let lastFrameAt = Date.now();
    let rafId = null;
    let isActive = IS_POPOUT;
    let hasInitializedActors = false;
    const celebrationUntil = new Map();
    const actors = new Map();
    const handledCompletionAt = new Map();
    let confetti = [];
    const vacuum = { x: 46, dir: 1 };
    const ghost = {
      active: false,
      x: 340,
      y: 160,
      targetX: 340,
      targetY: 160,
      facing: 'right',
      mode: 'roam',
      targetType: null,
      targetId: null,
      hauntUntil: 0,
      nextActionAt: 0,
      fridgeUntil: 0,
      coffeeUntil: 0
    };

    if (popoutBtn) {
      popoutBtn.addEventListener('click', () => {
        vscode.postMessage({ action: 'openOfficePopout' });
      });
    }
    if (providerSelect) {
      providerSelect.addEventListener('change', () => {
        vscode.postMessage({ action: 'setFilter', filter: providerSelect.value });
      });
    }
    if (projectSelect) {
      projectSelect.addEventListener('change', () => {
        vscode.postMessage({ action: 'setProjectFilter', filter: projectSelect.value });
      });
    }

    function escapeHtml(val) {
      return String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function parseRgbColor(str) {
      if (!str) return null;
      const s = str.trim();
      if (s.startsWith('#') && s.length >= 7) {
        return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      }
      const m = s.match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
      return null;
    }

    function isLightTheme() {
      if (document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light')) {
        return true;
      }
      const bg = getComputedStyle(document.body).backgroundColor;
      const rgb = parseRgbColor(bg);
      if (rgb) {
        return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 140;
      }
      return false;
    }

    function getThemePalette() {
      const style = getComputedStyle(document.body);
      const focusBorder = style.getPropertyValue('--vscode-focusBorder').trim() || '#3B82F6';
      if (isLightTheme()) {
        return {
          floorA: '#EAE7DC',
          floorB: '#E2DFD3',
          wall: '#D3CFC2',
          carpet: '#DCE3EB',
          carpetBorder: '#B9C7D6',
          deskTop: '#C99B6B',
          deskEdge: '#9E7247',
          monitorFrame: '#334155',
          chair: '#475569',
          text: '#1E293B',
          muted: '#475569',
          badgeBg: 'rgba(255, 255, 255, 0.92)',
          selectRing: focusBorder
        };
      }
      return {
        floorA: '#1A1D24',
        floorB: '#1E222B',
        wall: '#272C37',
        carpet: '#222836',
        carpetBorder: '#344055',
        deskTop: '#8C6239',
        deskEdge: '#634222',
        monitorFrame: '#0F172A',
        chair: '#475569',
        text: '#E2E8F0',
        muted: '#94A3B8',
        badgeBg: 'rgba(15, 23, 42, 0.88)',
        selectRing: focusBorder
      };
    }

    function px(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }

    function hashId(str) {
      const s = String(str || '');
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    const TZ_COORDS = {
      'Europe/Berlin': [52.52, 13.40],
      'Europe/Vienna': [48.21, 16.37],
      'Europe/Zurich': [47.37, 8.54],
      'Europe/London': [51.51, -0.13],
      'Europe/Dublin': [53.35, -6.26],
      'Europe/Paris': [48.86, 2.35],
      'Europe/Brussels': [50.85, 4.35],
      'Europe/Amsterdam': [52.37, 4.90],
      'Europe/Madrid': [40.42, -3.70],
      'Europe/Lisbon': [38.72, -9.14],
      'Europe/Rome': [41.90, 12.50],
      'Europe/Stockholm': [59.33, 18.07],
      'Europe/Oslo': [59.91, 10.75],
      'Europe/Copenhagen': [55.68, 12.57],
      'Europe/Helsinki': [60.17, 24.94],
      'Europe/Warsaw': [52.23, 21.01],
      'Europe/Prague': [50.08, 14.44],
      'Europe/Budapest': [47.50, 19.04],
      'Europe/Athens': [37.98, 23.73],
      'Europe/Bucharest': [44.43, 26.10],
      'Europe/Istanbul': [41.01, 28.98],
      'Europe/Moscow': [55.75, 37.62],
      'Europe/Kiev': [50.45, 30.52],
      'Europe/Kyiv': [50.45, 30.52],
      'America/New_York': [40.71, -74.01],
      'America/Toronto': [43.65, -79.38],
      'America/Chicago': [41.88, -87.63],
      'America/Denver': [39.74, -104.99],
      'America/Phoenix': [33.45, -112.07],
      'America/Los_Angeles': [34.05, -118.24],
      'America/Vancouver': [49.28, -123.12],
      'America/Anchorage': [61.22, -149.90],
      'Pacific/Honolulu': [21.31, -157.86],
      'America/Mexico_City': [19.43, -99.13],
      'America/Bogota': [4.71, -74.07],
      'America/Lima': [-12.05, -77.04],
      'America/Santiago': [-33.45, -70.67],
      'America/Sao_Paulo': [-23.55, -46.63],
      'America/Argentina/Buenos_Aires': [-34.60, -58.38],
      'Asia/Dubai': [25.20, 55.27],
      'Asia/Riyadh': [24.71, 46.68],
      'Asia/Jerusalem': [31.77, 35.21],
      'Asia/Tehran': [35.69, 51.39],
      'Asia/Kolkata': [22.57, 88.36],
      'Asia/Calcutta': [22.57, 88.36],
      'Asia/Bangkok': [13.76, 100.50],
      'Asia/Singapore': [1.35, 103.82],
      'Asia/Shanghai': [31.23, 121.47],
      'Asia/Hong_Kong': [22.32, 114.17],
      'Asia/Taipei': [25.03, 121.57],
      'Asia/Seoul': [37.57, 126.98],
      'Asia/Tokyo': [35.68, 139.69],
      'Australia/Perth': [-31.95, 115.86],
      'Australia/Adelaide': [-34.93, 138.60],
      'Australia/Sydney': [-33.87, 151.21],
      'Australia/Melbourne': [-37.81, 144.96],
      'Pacific/Auckland': [-36.85, 174.76],
      'Africa/Cairo': [30.04, 31.24],
      'Africa/Lagos': [6.52, 3.38],
      'Africa/Nairobi': [-1.29, 36.82],
      'Africa/Johannesburg': [-26.20, 28.05]
    };

    function getUserTimezone() {
      try {
        if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        }
      } catch (_) {}
      return '';
    }

    function resolveLocationFromTimezone(now, tzOverride) {
      const tz = tzOverride || getUserTimezone();
      if (tz && TZ_COORDS[tz]) {
        return { lat: TZ_COORDS[tz][0], lon: TZ_COORDS[tz][1], tz };
      }
      const d = new Date(now);
      const offsetHours = -d.getTimezoneOffset() / 60;
      const approxLon = offsetHours * 15;
      let approxLat = 48;
      if (tz.startsWith('Europe/')) approxLat = 50;
      else if (tz.startsWith('America/')) approxLat = 39;
      else if (tz.startsWith('Asia/')) approxLat = 34;
      else if (tz.startsWith('Australia/')) approxLat = -33;
      else if (tz.startsWith('Africa/')) approxLat = 5;
      else if (tz.startsWith('Pacific/')) approxLat = -15;
      return { lat: approxLat, lon: approxLon, tz };
    }

    function computeSunTimes(now, tzOverride) {
      const d = new Date(now);
      const { lat, lon, tz } = resolveLocationFromTimezone(now, tzOverride);
      const dayOfYear = Math.max(1, Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000));
      const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);
      const eqtime = 229.18 * (
        0.000075 +
        0.001868 * Math.cos(gamma) -
        0.032077 * Math.sin(gamma) -
        0.014615 * Math.cos(2 * gamma) -
        0.040849 * Math.sin(2 * gamma)
      );
      const decl =
        0.006918 -
        0.399912 * Math.cos(gamma) +
        0.070257 * Math.sin(gamma) -
        0.006758 * Math.cos(2 * gamma) +
        0.000907 * Math.sin(2 * gamma) -
        0.002697 * Math.cos(3 * gamma) +
        0.00148 * Math.sin(3 * gamma);
      const latRad = (Math.max(-89.9, Math.min(89.9, lat)) * Math.PI) / 180;
      const zenithRad = (90.833 * Math.PI) / 180;
      const cosHa = (Math.cos(zenithRad) / (Math.cos(latRad) * Math.cos(decl))) - Math.tan(latRad) * Math.tan(decl);
      if (cosHa > 1) return { sunriseMin: null, sunsetMin: null, polarNight: true, polarDay: false, tz, lat, lon };
      if (cosHa < -1) return { sunriseMin: null, sunsetMin: null, polarNight: false, polarDay: true, tz, lat, lon };
      const haDeg = (Math.acos(cosHa) * 180) / Math.PI;
      const tzOffsetMin = -d.getTimezoneOffset();
      const wrap = (m) => ((m % 1440) + 1440) % 1440;
      return {
        sunriseMin: wrap(720 - 4 * (lon + haDeg) - eqtime + tzOffsetMin),
        sunsetMin: wrap(720 - 4 * (lon - haDeg) - eqtime + tzOffsetMin),
        polarNight: false,
        polarDay: false,
        tz,
        lat,
        lon
      };
    }

    function inMinRange(min, start, end) {
      const m = ((min % 1440) + 1440) % 1440;
      const s = ((start % 1440) + 1440) % 1440;
      const e = ((end % 1440) + 1440) % 1440;
      if (s <= e) return m >= s && m < e;
      return m >= s || m < e;
    }

    function getTimeOfDay(now, tzOverride) {
      const sun = computeSunTimes(now, tzOverride);
      if (sun.polarDay) return 'day';
      if (sun.polarNight) return 'night';
      const d = new Date(now);
      const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
      if (inMinRange(nowMin, sun.sunriseMin - 30, sun.sunriseMin + 30)) return 'dawn';
      if (inMinRange(nowMin, sun.sunsetMin - 45, sun.sunsetMin)) return 'evening';
      if (inMinRange(nowMin, sun.sunriseMin + 30, sun.sunsetMin - 45)) return 'day';
      return 'night';
    }

    function getEffectiveTimeOfDay(now) {
      return simulatedTod || getTimeOfDay(now);
    }

    function getCelestialWindowIndex(tod, now) {
      if (tod === 'dawn') return 0;
      if (tod === 'evening') return 2;
      if (simulatedTod === 'day' || simulatedTod === 'night') return 1;
      const sun = computeSunTimes(now);
      const d = new Date(now);
      const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
      if (tod === 'day' && sun.sunriseMin !== null && sun.sunsetMin !== null) {
        const span = ((sun.sunsetMin - sun.sunriseMin) + 1440) % 1440 || 720;
        const elapsed = ((nowMin - sun.sunriseMin) + 1440) % 1440;
        const frac = Math.min(0.99, Math.max(0, elapsed / span));
        return frac < 0.34 ? 0 : (frac < 0.67 ? 1 : 2);
      }
      if (tod === 'night' && sun.sunriseMin !== null && sun.sunsetMin !== null) {
        const span = ((sun.sunriseMin - sun.sunsetMin) + 1440) % 1440 || 720;
        const elapsed = ((nowMin - sun.sunsetMin) + 1440) % 1440;
        const frac = Math.min(0.99, Math.max(0, elapsed / span));
        return frac < 0.34 ? 0 : (frac < 0.67 ? 1 : 2);
      }
      return 1;
    }

    function formatMinutesHM(min) {
      if (typeof min !== 'number' || !Number.isFinite(min)) return '--:--';
      const total = Math.round(((min % 1440) + 1440) % 1440);
      const h = String(Math.floor(total / 60)).padStart(2, '0');
      const m = String(total % 60).padStart(2, '0');
      return h + ':' + m;
    }

    function updateSimPill() {
      if (!simPillEl) return;
      if (!simulatedTod) {
        simPillEl.style.display = 'none';
        simPillEl.textContent = '';
      } else {
        simPillEl.style.display = '';
        simPillEl.textContent = '🕒 ' + (TOD_LABELS[simulatedTod] || simulatedTod) + ' ✕';
      }
    }

    if (simPillEl) {
      simPillEl.addEventListener('click', () => {
        simulatedTod = null;
        stepGhost(Date.now(), 0.016);
        updateSimPill();
        draw();
      });
    }

    function isRateLimitedActive(session, now) {
      if (!session || !session.rateLimit) return false;
      const resetsAt = Number(session.rateLimit.resetsAt) || 0;
      return !(resetsAt > 0 && now >= resetsAt);
    }

    function isRateLimitPast(session, now) {
      if (!session || !session.rateLimit) return false;
      const resetsAt = Number(session.rateLimit.resetsAt) || 0;
      return resetsAt > 0 && now >= resetsAt;
    }

    function classifyBusyActivity(activity) {
      const text = String(activity || '').toLowerCase();
      if (/🛠️|bash|command|terminal|exec|npm|git|build|test|run_command|shell|deploy|compile/.test(text)) {
        return 'terminal';
      }
      if (/📖|🔍|read|view|grep|search|find|list|glob|liest|sucht|prüft/.test(text)) {
        return 'read';
      }
      if (/🧠|think|denkt|plan|überleg/.test(text)) {
        return 'think';
      }
      return 'write';
    }

    function classifyWaitingType(session, now) {
      if (isRateLimitPast(session, now)) return 'limitPast';
      const combined = (String(session.waitingFor || '') + ' ' + String(session.detail || '')).toLowerCase();
      if (/permission|freigabe|sandbox|approval|confirm|dialog/.test(combined)) return 'permission';
      return 'question';
    }

    function isBarOpen(now) {
      return new Date(now).getHours() >= BAR_OPEN_HOUR;
    }

    function getLoungeAnchorX() {
      return canvas.width - 104;
    }

    function getCorridorX() {
      return canvas.width - 196;
    }

    function getStationSlotCoords(station, slotIdx) {
      const kx = getLoungeAnchorX();
      if (station === 'play') {
        return { x: kx - 42, y: slotIdx === 0 ? 236 : 262 };
      }
      if (station === 'chat') {
        return slotIdx === 0 ? { x: kx - 49, y: 318 } : { x: kx - 5, y: 318 };
      }
      const baseY = station === 'bar' ? 152 : 56;
      if (slotIdx === 0) return { x: kx - 52, y: baseY };
      if (slotIdx === 1) return { x: kx - 56, y: baseY + 24 };
      return { x: kx - 56, y: baseY + 48 };
    }

    function getSeatCoords(session) {
      return { x: session.desk.x + 11, y: session.desk.y - 6 };
    }

    function countActiveStationActors(station) {
      let count = 0;
      actors.forEach((a) => {
        if ((a.phase === 'toDrink' || a.phase === 'atDrink') && a.drinkStation === station) count++;
      });
      return count;
    }

    function countActiveLeisureActors(kind) {
      let count = 0;
      const movePhase = kind === 'play' ? 'toPlay' : 'toChat';
      const stayPhase = kind === 'play' ? 'playing' : 'chatting';
      actors.forEach((a) => {
        if (a.phase === movePhase || a.phase === stayPhase) count++;
      });
      return count;
    }

    function findFreeStationSlot(station, limit) {
      const maxSlots = limit || MAX_COFFEE_QUEUE;
      const used = new Set();
      actors.forEach((a) => {
        if (station === 'play' && (a.phase === 'toPlay' || a.phase === 'playing') && a.leisureSlot !== null) {
          used.add(a.leisureSlot);
        } else if (station === 'chat' && (a.phase === 'toChat' || a.phase === 'chatting') && a.leisureSlot !== null) {
          used.add(a.leisureSlot);
        } else if ((a.phase === 'toDrink' || a.phase === 'atDrink') && a.drinkStation === station && a.drinkSlot !== null) {
          used.add(a.drinkSlot);
        }
      });
      for (let i = 0; i < maxSlots; i++) {
        if (!used.has(i)) return i;
      }
      return null;
    }

    function spawnConfetti(cx, cy) {
      const palette = ['#22C55E', '#FACC15', '#38BDF8', '#F472B6', '#A855F7'];
      for (let i = 0; i < 14; i++) {
        const angle = -Math.PI * (0.15 + (i / 13) * 0.7);
        const speed = 1.2 + (i % 4) * 0.45;
        confetti.push({
          x: cx + ((i % 3) - 1) * 8,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.6,
          color: palette[i % palette.length],
          life: 0,
          maxLife: 45 + (i % 4) * 8
        });
      }
    }

    function buildWaypointsToStation(session, station, slotIdx) {
      const seat = getSeatCoords(session);
      const laneY = session.desk.y - 16;
      const corridorX = getCorridorX();
      const slot = getStationSlotCoords(station, slotIdx);
      return [
        { x: seat.x, y: laneY },
        { x: corridorX, y: laneY },
        { x: corridorX, y: slot.y },
        { x: slot.x, y: slot.y }
      ];
    }

    function buildWaypointsToDesk(session) {
      const seat = getSeatCoords(session);
      const laneY = session.desk.y - 16;
      const corridorX = getCorridorX();
      return [
        { x: corridorX, y: laneY },
        { x: seat.x, y: laneY },
        { x: seat.x, y: seat.y }
      ];
    }

    function startDrinkWalk(actor, session, now) {
      const wantBar = isBarOpen(now);
      const station = wantBar ? 'bar' : 'coffee';
      const drinkType = wantBar ? 'beer' : 'coffee';
      if (countActiveStationActors(station) >= MAX_COFFEE_QUEUE) {
        actor.phase = 'seated';
        actor.phaseStartedAt = now;
        actor.drinkStation = null;
        actor.drinkSlot = null;
        actor.drinkType = drinkType;
        actor.waypoints = [];
        actor.hasDrink = true;
        return;
      }
      const slot = findFreeStationSlot(station, MAX_COFFEE_QUEUE);
      if (slot === null) {
        actor.phase = 'seated';
        actor.phaseStartedAt = now;
        actor.drinkStation = null;
        actor.drinkSlot = null;
        actor.drinkType = drinkType;
        actor.waypoints = [];
        actor.hasDrink = true;
        return;
      }
      actor.phase = 'toDrink';
      actor.phaseStartedAt = now;
      actor.drinkStation = station;
      actor.drinkType = drinkType;
      actor.drinkSlot = slot;
      actor.leisureSlot = null;
      actor.hasDrink = false;
      actor.waypoints = buildWaypointsToStation(session, station, slot);
    }

    function randomRange(min, max) {
      return Math.round(min + Math.random() * Math.max(0, max - min));
    }

    function startLeisureWalk(actor, session, kind, slot, now) {
      actor.phase = kind === 'play' ? 'toPlay' : 'toChat';
      actor.phaseStartedAt = now;
      actor.drinkStation = null;
      actor.drinkSlot = null;
      actor.leisureSlot = slot;
      actor.leisureDurationMs = kind === 'play'
        ? randomRange(PLAY_DURATION_MIN_MS, PLAY_DURATION_MAX_MS)
        : randomRange(CHAT_DURATION_MIN_MS, CHAT_DURATION_MAX_MS);
      actor.fastReturn = false;
      actor.waypoints = buildWaypointsToStation(session, kind, slot);
      lastLeisureDepartureAt = now;
    }

    function returnToDesk(actor, session, now, fast, returnPhase) {
      const corridorX = getCorridorX();
      const seat = getSeatCoords(session);
      const laneY = session.desk.y - 16;
      actor.phase = returnPhase || 'fromDrink';
      actor.phaseStartedAt = now;
      actor.drinkStation = null;
      actor.drinkSlot = null;
      actor.leisureSlot = null;
      actor.fastReturn = Boolean(fast);
      if (Math.abs(actor.x - seat.x) <= 6 && Math.abs(actor.y - seat.y) <= 18) {
        actor.waypoints = [{ x: seat.x, y: seat.y }];
      } else if (actor.x >= corridorX - 18) {
        actor.waypoints = buildWaypointsToDesk(session);
      } else {
        actor.waypoints = [
          { x: corridorX, y: actor.y },
          { x: corridorX, y: laneY },
          { x: seat.x, y: laneY },
          { x: seat.x, y: seat.y }
        ];
      }
    }

    function isWalkingOrLoungePhase(phase) {
      return phase === 'toDrink' || phase === 'atDrink' || phase === 'fromDrink' ||
        phase === 'toPlay' || phase === 'playing' || phase === 'fromPlay' ||
        phase === 'toChat' || phase === 'chatting' || phase === 'fromChat';
    }

    function syncActorsWithLayout(items, completedIds, now) {
      const completedSet = new Set(Array.isArray(completedIds) ? completedIds : []);
      const seenIds = new Set();

      for (const s of items) {
        seenIds.add(s.sessionId);
        const seat = getSeatCoords(s);
        let actor = actors.get(s.sessionId);

        if (!actor) {
          actor = {
            sessionId: s.sessionId,
            lastState: s.state,
            phase: 'seated',
            phaseStartedAt: now,
            x: seat.x,
            y: seat.y,
            facing: 'front',
            drinkStation: null,
            drinkType: 'coffee',
            drinkSlot: null,
            leisureSlot: null,
            leisureDurationMs: 0,
            nextLeisureAt: now + randomRange(LEISURE_DELAY_MIN_MS, LEISURE_DELAY_MAX_MS),
            waypoints: [],
            hasDrink: s.state === 'idle',
            fastReturn: false
          };
          actors.set(s.sessionId, actor);
        }

        const prevHandled = handledCompletionAt.get(s.sessionId) || 0;
        const transitionToIdle = hasInitializedActors && actor.lastState !== 'idle' && s.state === 'idle' && !isRateLimitedActive(s, now);
        const flaggedComplete = completedSet.has(s.sessionId) && (now - prevHandled > 6000);

        if (transitionToIdle || flaggedComplete) {
          handledCompletionAt.set(s.sessionId, now);
          celebrationUntil.set(s.sessionId, now + CELEBRATE_DURATION_MS);
          spawnConfetti(s.desk.x + 50, s.desk.y + 4);
          if (s.state === 'idle' && actor.phase === 'seated') {
            actor.phase = 'celebrating';
            actor.phaseStartedAt = now;
            actor.hasDrink = false;
          }
        }

        if (s.state !== 'idle' || isRateLimitedActive(s, now)) {
          if (s.state !== 'idle') handledCompletionAt.delete(s.sessionId);
          if (actor.phase === 'celebrating') {
            actor.phase = 'seated';
            actor.x = seat.x;
            actor.y = seat.y;
          } else if (actor.phase === 'toDrink' || actor.phase === 'atDrink') {
            returnToDesk(actor, s, now, true, 'fromDrink');
          } else if (actor.phase === 'toPlay' || actor.phase === 'playing') {
            returnToDesk(actor, s, now, true, 'fromPlay');
          } else if (actor.phase === 'toChat' || actor.phase === 'chatting') {
            returnToDesk(actor, s, now, true, 'fromChat');
          }
        }

        if ((actor.phase === 'fromDrink' || actor.phase === 'fromPlay' || actor.phase === 'fromChat') && actor.waypoints && actor.waypoints.length > 0) {
          const lastWp = actor.waypoints[actor.waypoints.length - 1];
          if (lastWp.x !== seat.x || lastWp.y !== seat.y) {
            returnToDesk(actor, s, now, actor.fastReturn, actor.phase);
          }
        }
        if (actor.phase === 'seated') {
          actor.x = seat.x;
          actor.y = seat.y;
          actor.facing = 'front';
          if (s.state === 'idle') actor.hasDrink = true;
        }
        actor.lastState = s.state;
      }

      actors.forEach((_, id) => {
        if (!seenIds.has(id)) actors.delete(id);
      });
      hasInitializedActors = true;
    }

    function maybeStartBoredLeisure(actor, session, now) {
      if (session.state !== 'idle' || isRateLimitedActive(session, now)) return;
      if (actor.phase !== 'seated' || !actor.hasDrink) return;
      const idleAgeMs = session.statusUpdatedAt ? (now - session.statusUpdatedAt) : 0;
      const seatedElapsed = now - actor.phaseStartedAt;
      if (now < (actor.nextLeisureAt || 0)) return;
      if (idleAgeMs < LEISURE_DELAY_MIN_MS && seatedElapsed < LEISURE_DELAY_MIN_MS) return;

      const chatCount = countActiveLeisureActors('chat');
      const playCount = countActiveLeisureActors('play');
      const soloPartnerWaiting = chatCount === 1 || playCount === 1;
      const minSpacing = soloPartnerWaiting ? 6000 : LEISURE_GLOBAL_COOLDOWN_MS;
      if (lastLeisureDepartureAt > 0 && (now - lastLeisureDepartureAt) < minSpacing) {
        actor.nextLeisureAt = lastLeisureDepartureAt + minSpacing + randomRange(4000, 18000);
        return;
      }

      const chance = soloPartnerWaiting ? LEISURE_JOIN_CHANCE : LEISURE_DEPART_CHANCE;
      if (Math.random() > chance) {
        actor.nextLeisureAt = now + randomRange(LEISURE_RETRY_MIN_MS, LEISURE_RETRY_MAX_MS);
        return;
      }

      // Count other seated idle candidates to prefer pairing for discussion
      let otherIdleCount = 0;
      actors.forEach((other, sid) => {
        if (sid !== session.sessionId && other.lastState === 'idle') otherIdleCount++;
      });

      const joinChat = chatCount === 1;
      const joinPlay = !joinChat && playCount === 1;
      const preferChat = joinChat || (!joinPlay && otherIdleCount >= 1 && Math.random() < 0.5);

      if (preferChat && chatCount < MAX_CHAT_SLOTS) {
        const slot = findFreeStationSlot('chat', MAX_CHAT_SLOTS);
        if (slot !== null) {
          startLeisureWalk(actor, session, 'chat', slot, now);
          return;
        }
      }
      if (playCount < MAX_PLAY_SLOTS) {
        const slot = findFreeStationSlot('play', MAX_PLAY_SLOTS);
        if (slot !== null) {
          startLeisureWalk(actor, session, 'play', slot, now);
          return;
        }
      }
      if (chatCount < MAX_CHAT_SLOTS) {
        const slot = findFreeStationSlot('chat', MAX_CHAT_SLOTS);
        if (slot !== null) {
          startLeisureWalk(actor, session, 'chat', slot, now);
          return;
        }
      }
      actor.nextLeisureAt = now + randomRange(LEISURE_RETRY_MIN_MS, LEISURE_RETRY_MAX_MS);
    }

    function advanceSingleActor(actor, session, now, dtSec) {
      const seat = getSeatCoords(session);
      if (actor.phase === 'celebrating') {
        actor.x = seat.x;
        actor.y = seat.y;
        if (now - actor.phaseStartedAt >= CELEBRATE_DURATION_MS) {
          if (session.state === 'idle' && !isRateLimitedActive(session, now)) {
            startDrinkWalk(actor, session, now);
          } else {
            actor.phase = 'seated';
            actor.phaseStartedAt = now;
          }
        }
        return;
      }

      if (actor.phase === 'seated') {
        maybeStartBoredLeisure(actor, session, now);
        return;
      }

      if (actor.phase === 'atDrink') {
        if (actor.drinkSlot > 0) {
          let lowerOccupied = false;
          actors.forEach((other) => {
            if (other !== actor && (other.phase === 'toDrink' || other.phase === 'atDrink') && other.drinkStation === actor.drinkStation && other.drinkSlot === actor.drinkSlot - 1) {
              lowerOccupied = true;
            }
          });
          if (!lowerOccupied) {
            actor.drinkSlot -= 1;
            actor.phaseStartedAt = now;
            const nextPos = getStationSlotCoords(actor.drinkStation, actor.drinkSlot);
            actor.waypoints = [nextPos];
          }
        }

        if (actor.waypoints && actor.waypoints.length > 0) {
          moveAlongWaypoints(actor, dtSec * 70);
          return;
        }

        actor.facing = 'right';
        const elapsed = now - actor.phaseStartedAt;
        if ((actor.drinkSlot === 0 && elapsed >= BREW_DURATION_MS) || elapsed >= MAX_AT_COFFEE_MS) {
          actor.hasDrink = true;
          returnToDesk(actor, session, now, false, 'fromDrink');
        }
        return;
      }

      if (actor.phase === 'playing') {
        actor.facing = 'right';
        const stayMs = actor.leisureDurationMs || PLAY_DURATION_MIN_MS;
        if (now - actor.phaseStartedAt >= stayMs) {
          returnToDesk(actor, session, now, false, 'fromPlay');
        }
        return;
      }

      if (actor.phase === 'chatting') {
        actor.facing = actor.leisureSlot === 0 ? 'right' : 'left';
        const stayMs = actor.leisureDurationMs || CHAT_DURATION_MIN_MS;
        if (now - actor.phaseStartedAt >= stayMs) {
          returnToDesk(actor, session, now, false, 'fromChat');
        }
        return;
      }

      if (actor.phase === 'toDrink' || actor.phase === 'fromDrink' ||
          actor.phase === 'toPlay' || actor.phase === 'fromPlay' ||
          actor.phase === 'toChat' || actor.phase === 'fromChat') {
        const speed = actor.fastReturn ? 145 : 88;
        const arrived = moveAlongWaypoints(actor, dtSec * speed);
        if (arrived) {
          if (actor.phase === 'toDrink') {
            actor.phase = 'atDrink';
            actor.phaseStartedAt = now;
            actor.facing = 'right';
          } else if (actor.phase === 'toPlay') {
            actor.phase = 'playing';
            actor.phaseStartedAt = now;
            actor.facing = 'right';
          } else if (actor.phase === 'toChat') {
            actor.phase = 'chatting';
            actor.phaseStartedAt = now;
            actor.facing = actor.leisureSlot === 0 ? 'right' : 'left';
          } else {
            actor.phase = 'seated';
            actor.phaseStartedAt = now;
            actor.nextLeisureAt = now + randomRange(LEISURE_DELAY_MIN_MS, LEISURE_DELAY_MAX_MS);
            actor.x = seat.x;
            actor.y = seat.y;
            actor.facing = 'front';
            actor.fastReturn = false;
          }
        }
      }
    }

    function moveAlongWaypoints(actor, maxDist) {
      let remaining = maxDist;
      while (actor.waypoints && actor.waypoints.length > 0 && remaining > 0) {
        const target = actor.waypoints[0];
        const dx = target.x - actor.x;
        const dy = target.y - actor.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy)) {
          actor.facing = dx >= 0 ? 'right' : 'left';
        }
        if (dist <= remaining) {
          actor.x = target.x;
          actor.y = target.y;
          actor.waypoints.shift();
          remaining -= dist;
        } else {
          actor.x += (dx / dist) * remaining;
          actor.y += (dy / dist) * remaining;
          remaining = 0;
        }
      }
      return !actor.waypoints || actor.waypoints.length === 0;
    }

    function pickGhostHauntTarget(now) {
      const kx = getLoungeAnchorX();
      const seed = Math.floor(now / 1000) + tick;
      const candidates = [];
      for (const s of layout.items) {
        candidates.push({ type: 'desk', id: s.sessionId, x: s.desk.x + 28, y: s.desk.y - 4 });
      }
      candidates.push({ type: 'fridge', id: 'fridge', x: kx + 46, y: 158 });
      candidates.push({ type: 'coffee', id: 'coffee', x: kx + 18, y: 50 });
      if (candidates.length === 0) return;
      const pick = candidates[seed % candidates.length];
      ghost.targetType = pick.type;
      ghost.targetId = pick.id;
      ghost.targetX = pick.x;
      ghost.targetY = pick.y;
      ghost.mode = 'approach';
    }

    function stepGhost(now, dtSec) {
      const tod = getEffectiveTimeOfDay(now);
      if (tod !== 'night') {
        ghost.active = false;
        ghost.targetType = null;
        ghost.targetId = null;
        ghost.hauntUntil = 0;
        ghost.fridgeUntil = 0;
        ghost.coffeeUntil = 0;
        return;
      }
      if (!ghost.active) {
        ghost.active = true;
        ghost.x = Math.floor(canvas.width * 0.45);
        ghost.y = 120;
        ghost.mode = 'roam';
        ghost.nextActionAt = now + 2200;
        pickGhostHauntTarget(now);
      }

      if (ghost.mode === 'haunt') {
        if (now >= ghost.hauntUntil) {
          ghost.mode = 'roam';
          ghost.targetType = null;
          ghost.targetId = null;
          ghost.nextActionAt = now + 4500;
          ghost.targetX = 90 + ((tick * 37) % Math.max(120, canvas.width - 260));
          ghost.targetY = 64 + ((tick * 23) % Math.max(100, canvas.height - 140));
        }
        return;
      }

      const dx = ghost.targetX - ghost.x;
      const dy = ghost.targetY - ghost.y;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dx) > 1) ghost.facing = dx >= 0 ? 'right' : 'left';

      if (dist > 6) {
        const step = Math.min(dist, 42 * dtSec);
        ghost.x += (dx / dist) * step;
        ghost.y += (dy / dist) * step;
      } else if (ghost.mode === 'approach') {
        ghost.mode = 'haunt';
        ghost.hauntUntil = now + 2600;
        if (ghost.targetType === 'fridge') ghost.fridgeUntil = ghost.hauntUntil;
        if (ghost.targetType === 'coffee') ghost.coffeeUntil = ghost.hauntUntil;
      } else if (now >= ghost.nextActionAt) {
        pickGhostHauntTarget(now);
      }
    }

    function stepSimulation(now) {
      const dtMs = Math.min(80, Math.max(8, now - lastFrameAt));
      lastFrameAt = now;
      const dtSec = dtMs / 1000;

      // Advance vacuum robot smoothly along bottom corridor
      const minVx = 40;
      const maxVx = Math.max(minVx + 40, canvas.width - 170);
      vacuum.x += vacuum.dir * 24 * dtSec;
      if (vacuum.x >= maxVx) {
        vacuum.x = maxVx;
        vacuum.dir = -1;
      } else if (vacuum.x <= minVx) {
        vacuum.x = minVx;
        vacuum.dir = 1;
      }

      // Advance confetti particles
      if (confetti.length > 0) {
        const nextConfetti = [];
        for (const c of confetti) {
          c.life += 1;
          if (c.life < c.maxLife) {
            c.x += c.vx;
            c.y += c.vy;
            c.vy += 0.06;
            nextConfetti.push(c);
          }
        }
        confetti = nextConfetti;
      }

      // Advance actors
      const byId = new Map();
      for (const s of layout.items) byId.set(s.sessionId, s);
      actors.forEach((actor, sid) => {
        const session = byId.get(sid);
        if (session) advanceSingleActor(actor, session, now, dtSec);
      });

      stepGhost(now, dtSec);
    }

    function getWindowPositions(w) {
      const signX = Math.floor(w / 2) - 82;
      const winW = 58;
      const x1 = 32;
      const x2 = Math.max(x1 + winW + 14, Math.floor((x1 + winW + signX - winW) / 2));
      const clockLeft = w - 68;
      const x3 = Math.min(clockLeft - winW - 10, Math.floor((signX + 164 + clockLeft - winW) / 2));
      return [x1, x2, x3];
    }

    function drawWindow(x, y, tod, windowIdx, celestialIdx) {
      const sOff = windowIdx || 0;
      const showCelestial = windowIdx === celestialIdx;
      px(x, y, 58, 22, '#334155');
      if (tod === 'day') {
        px(x + 2, y + 2, 54, 18, '#38BDF8');
        if (showCelestial) {
          px(x + 42, y + 4, 8, 8, '#FDE047');
        }
        const cloudX = x + 4 + (Math.floor(tick * 0.12 + sOff * 17) % 32);
        const cloudY = sOff === 1 ? y + 6 : y + 11;
        px(cloudX, cloudY, 14, 4, '#F8FAFC');
        px(cloudX + 3, cloudY - 3, 8, 3, '#F8FAFC');
      } else if (tod === 'dawn' || tod === 'evening') {
        px(x + 2, y + 2, 54, 6, tod === 'dawn' ? '#6366F1' : '#7C3AED');
        px(x + 2, y + 8, 54, 6, tod === 'dawn' ? '#F97316' : '#EA580C');
        px(x + 2, y + 14, 54, 6, tod === 'dawn' ? '#FDE047' : '#FB923C');
        if (showCelestial) {
          px(x + (tod === 'dawn' ? 14 : 22), y + 12, 10, 7, '#FDE047');
        } else {
          const streakX = x + 8 + (sOff * 13) % 24;
          px(streakX, y + 10, 14, 2, 'rgba(254, 240, 138, 0.45)');
        }
      } else {
        px(x + 2, y + 2, 54, 18, '#0F172A');
        if (showCelestial) {
          // Single crescent moon in the active sky window
          px(x + 41, y + 5, 7, 7, '#FEF08A');
          px(x + 43, y + 5, 4, 4, '#0F172A');
        } else if (Math.floor((tick + sOff * 11) / 24) % 2 === 0) {
          px(x + 42, y + 6, 2, 2, '#E2E8F0');
        }
        if (Math.floor((tick + sOff * 9) / 20) % 2 === 0) px(x + 9, y + 6, 2, 2, '#E2E8F0');
        else px(x + 10, y + 6, 1, 1, '#94A3B8');
        px(x + 22, y + 13, 2, 2, '#F8FAFC');
        if (Math.floor((tick + sOff * 13) / 28) % 2 === 1) px(x + 31, y + 7, 2, 2, '#BAE6FD');
        // Occasional shooting star across one window
        const shootPhase = (tick + sOff * 140) % 420;
        if (shootPhase >= 0 && shootPhase < 14) {
          const sx = x + 6 + shootPhase * 3;
          const sy = y + 4 + Math.floor(shootPhase * 0.6);
          px(sx, sy, 3, 1, '#FEF08A');
          px(sx - 3, sy - 1, 3, 1, 'rgba(248, 250, 252, 0.55)');
        }
      }
      // Window frame crossbars
      px(x + 28, y + 2, 2, 18, '#334155');
      px(x + 2, y + 10, 54, 2, '#334155');
    }

    function drawWallClock(cx, cy, now) {
      px(cx - 10, cy - 10, 20, 20, '#334155');
      px(cx - 8, cy - 8, 16, 16, '#F8FAFC');
      px(cx - 1, cy - 1, 2, 2, '#1E293B');
      const d = new Date(now);
      const secAngle = (d.getSeconds() / 60) * Math.PI * 2 - Math.PI / 2;
      const minAngle = ((d.getMinutes() + d.getSeconds() / 60) / 60) * Math.PI * 2 - Math.PI / 2;
      const hrAngle = (((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2 - Math.PI / 2;

      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hrAngle) * 4.2, cy + Math.sin(hrAngle) * 4.2);
      ctx.stroke();

      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(minAngle) * 6.5, cy + Math.sin(minAngle) * 6.5);
      ctx.stroke();

      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(secAngle) * 6.5, cy + Math.sin(secAngle) * 6.5);
      ctx.stroke();
    }

    function drawFloorAndProps(p, now, tod) {
      const w = canvas.width;
      const h = canvas.height;
      const windows = getWindowPositions(w);

      for (let y = 0; y < h; y += 18) {
        for (let x = 0; x < w; x += 18) {
          const alt = ((x / 18) + (y / 18)) % 2 === 0;
          px(x, y, 18, 18, alt ? p.floorA : p.floorB);
        }
      }

      // Top office wall, 3 windows (left outer, left of sign, right of sign), header plaque & live wall clock
      px(0, 0, w, 28, p.wall);
      px(0, 28, w, 3, p.carpetBorder);
      const celestialIdx = getCelestialWindowIndex(tod, now);
      windows.forEach((wx, idx) => drawWindow(wx, 3, tod, idx, celestialIdx));

      px(Math.floor(w / 2) - 82, 7, 164, 14, '#1E293B');
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DEV-FLOOR · AI SESSIONS', Math.floor(w / 2), 17);

      drawWallClock(w - 58, 14, now);

      // Carpet zone beneath desks
      const carpetW = Math.max(300, w - 176);
      const carpetH = Math.max(190, h - 54);
      px(30, 38, carpetW, carpetH, p.carpet);
      ctx.strokeStyle = p.carpetBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 38, carpetW, carpetH);

      // Moonlight beams beneath the 3 windows at night
      if (tod === 'night') {
        windows.forEach((wx) => {
          px(wx + 6, 32, 46, 8, 'rgba(148, 197, 255, 0.08)');
          px(wx + 12, 40, 44, 10, 'rgba(148, 197, 255, 0.05)');
        });
      }

      // Coffee corner on the right
      const kx = getLoungeAnchorX();
      const ky = 56;
      let someoneBrewing = ghost.active && ghost.coffeeUntil > now;
      let someoneAtBar = ghost.active && ghost.fridgeUntil > now;
      let someonePlaying = false;
      let someoneChatting = false;
      actors.forEach((a) => {
        if (a.phase === 'atDrink' && a.drinkSlot === 0 && (!a.waypoints || a.waypoints.length === 0)) {
          if (a.drinkStation === 'coffee') someoneBrewing = true;
          else if (a.drinkStation === 'bar') someoneAtBar = true;
        } else if (a.phase === 'playing') {
          someonePlaying = true;
        } else if (a.phase === 'chatting') {
          someoneChatting = true;
        }
      });

      px(kx, ky, 74, 36, p.deskTop);
      px(kx, ky + 36, 74, 5, p.deskEdge);
      px(kx + 12, ky - 14, 22, 24, '#334155');
      px(kx + 16, ky - 8, 14, 9, '#1E293B');
      px(kx + 19, ky - 4, 8, 5, '#78350F');
      // Machine status LED + extra cup/steam when someone is brewing
      px(kx + 30, ky - 11, 2, 2, someoneBrewing ? ((Math.floor(tick / 6) % 2 === 0) ? '#22C55E' : '#FACC15') : '#38BDF8');
      if (someoneBrewing) {
        px(kx + 20, ky - 2, 6, 5, '#F8FAFC');
      }
      const steam = Math.sin(tick * 0.12) * 2;
      const steamBoost = someoneBrewing ? 3 : 0;
      px(kx + 20 + steam, ky - 20 - steamBoost, 3, 4, 'rgba(226, 232, 240, 0.7)');
      px(kx + 25 - steam, ky - 24 - steamBoost, 3, 4, 'rgba(226, 232, 240, 0.5)');
      ctx.fillStyle = p.muted;
      ctx.font = '9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('KAFFEE', kx + 37, ky + 54);

      // Bar & fridge below the coffee corner (open from 16:00)
      const by = 152;
      const barOpen = isBarOpen(now);
      // Dark wood bar counter
      px(kx, by + 10, 44, 28, '#78350F');
      px(kx, by + 38, 44, 5, '#451A03');
      if (barOpen) {
        px(kx + 2, by + 39, 40, 2, '#F59E0B');
      }
      // Beer tap & coaster on bar counter
      px(kx + 10, by + 1, 4, 11, '#CBD5E1');
      px(kx + 8, by + 1, 8, 3, '#F59E0B');
      px(kx + 22, by + 16, 7, 2, '#D97706');

      // Beer fridge next to bar counter
      const fx = kx + 46;
      const fy = by - 6;
      px(fx, fy, 26, 44, '#475569');
      if (someoneAtBar) {
        // Fridge door swung open with cool blue glow and beer bottles inside
        px(fx + 2, fy + 2, 22, 40, '#0EA5E9');
        px(fx + 4, fy + 10, 18, 2, '#BAE6FD');
        px(fx + 4, fy + 24, 18, 2, '#BAE6FD');
        px(fx + 6, fy + 4, 3, 6, '#22C55E');
        px(fx + 11, fy + 4, 3, 6, '#F59E0B');
        px(fx + 16, fy + 4, 3, 6, '#22C55E');
        px(fx + 6, fy + 18, 3, 6, '#F59E0B');
        px(fx + 13, fy + 18, 3, 6, '#22C55E');
        px(fx - 7, fy + 1, 7, 42, '#94A3B8');
      } else {
        px(fx + 2, fy + 2, 22, 12, '#CBD5E1');
        px(fx + 2, fy + 16, 22, 26, '#94A3B8');
        px(fx + 4, fy + 20, 2, 10, '#E2E8F0');
        px(fx + 4, fy + 6, 2, 5, '#E2E8F0');
      }

      // Bar label (no blinking light)
      ctx.fillStyle = barOpen ? p.text : p.muted;
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(barOpen ? 'BAR' : 'BAR 16h', kx + 37, by + 55);

      // PlayStation corner below the bar
      const pyPlay = 236;
      // Cozy beanbag cushions for 2 players
      px(kx - 14, pyPlay + 8, 22, 16, '#4338CA');
      px(kx - 12, pyPlay + 10, 18, 12, '#6366F1');
      px(kx - 14, pyPlay + 34, 22, 16, '#4338CA');
      px(kx - 12, pyPlay + 36, 18, 12, '#6366F1');
      // TV & PlayStation console on media stand on the right
      px(kx + 32, pyPlay + 4, 38, 36, '#1E293B');
      px(kx + 34, pyPlay + 6, 34, 22, someonePlaying ? '#0B132B' : '#0F172A');
      if (someonePlaying) {
        // Animated retro Pong / arcade action on TV screen
        const ballX = kx + 37 + Math.round((Math.sin(tick * 0.18) + 1) * 13);
        const ballY = pyPlay + 9 + Math.round((Math.cos(tick * 0.25) + 1) * 7);
        const pad1Y = pyPlay + 10 + Math.round((Math.sin(tick * 0.14) + 1) * 5);
        const pad2Y = pyPlay + 10 + Math.round((Math.cos(tick * 0.16) + 1) * 5);
        px(kx + 36, pad1Y, 2, 6, '#38BDF8');
        px(kx + 64, pad2Y, 2, 6, '#F472B6');
        px(ballX, ballY, 3, 3, '#FACC15');
      } else {
        px(kx + 64, pyPlay + 25, 2, 2, '#EF4444');
      }
      // White/black console box with blue LED stripe
      px(kx + 42, pyPlay + 31, 18, 6, '#F8FAFC');
      px(kx + 44, pyPlay + 32, 14, 4, '#0F172A');
      px(kx + 45, pyPlay + 33, 12, 1, someonePlaying ? '#38BDF8' : '#3B82F6');
      ctx.fillStyle = p.muted;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PS5', kx + 51, pyPlay + 51);

      // Discussion standing table below the PlayStation corner
      const pyChat = 324;
      px(kx + 2, pyChat + 12, 22, 8, p.deskTop);
      px(kx + 2, pyChat + 20, 22, 3, p.deskEdge);
      px(kx + 11, pyChat + 23, 4, 12, '#475569');
      px(kx + 6, pyChat + 35, 14, 3, '#334155');
      if (someoneChatting) {
        px(kx + 6, pyChat + 8, 5, 4, '#F8FAFC');
        px(kx + 15, pyChat + 8, 5, 4, '#FACC15');
      }

      // Swaying office plant bottom right
      const py = h - 42;
      const sway = Math.round(Math.sin(tick * 0.04) * 1.2);
      px(kx + 46, py, 20, 16, '#9A5B36');
      px(kx + 44, py - 4, 24, 5, '#B46F45');
      px(kx + 50 + sway, py - 18, 12, 14, '#2E8B57');
      px(kx + 43 + sway, py - 13, 9, 9, '#3CB371');
      px(kx + 60 + sway, py - 15, 9, 10, '#3CB371');

      // Robotic vacuum patrolling bottom floor strip
      const vy = h - 14;
      const vx = Math.round(vacuum.x);
      px(vx, vy, 14, 9, '#334155');
      px(vx + 2, vy + 1, 10, 6, '#1E293B');
      px(vacuum.dir > 0 ? vx + 12 : vx, vy + 2, 2, 5, '#38BDF8');
      if (Math.floor(tick / 12) % 2 === 0) {
        px(vx + 6, vy + 3, 2, 2, '#22C55E');
      }
    }

    function drawSeatedAvatar(x, y, session, actor, p, now) {
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const seed = hashId(session.sessionId);
      const rateLimited = isRateLimitedActive(session, now);
      const isCelebrating = (celebrationUntil.get(session.sessionId) || 0) > now;
      const busyKind = session.state === 'busy' && !rateLimited ? classifyBusyActivity(session.activity) : null;
      const idleAgeMs = session.state === 'idle' && session.statusUpdatedAt ? (now - session.statusUpdatedAt) : 0;
      const isDozing = rateLimited || (session.state === 'idle' && idleAgeMs >= IDLE_COLD_COFFEE_MS && Math.sin(tick * 0.02 + seed) > 0.3);

      const typingBob = busyKind === 'write' || busyKind === 'terminal' ? (Math.floor(tick / 6) % 2) * 2 : 0;
      const waitBounce = session.state === 'waiting' ? Math.round(Math.sin(tick * 0.18) * 2) : 0;
      const celebrateBounce = isCelebrating ? -Math.round(Math.abs(Math.sin(tick * 0.35)) * 4) : 0;
      const ay = y + waitBounce + celebrateBounce;

      // Chair back
      px(x + 28, y + 12, 22, 14, p.chair);
      // Torso
      px(x + 30, ay + 10, 18, 14, meta.shirt);
      // Head & hair
      px(x + 32, ay - 4, 14, 14, '#F1C27D');
      px(x + 31, ay - 6, 16, 5, meta.hair);

      // Asynchronous blink & occasional glance left/right
      const blinkCycle = (tick + (seed % 190)) % 210;
      const isBlinking = blinkCycle >= 203 || isDozing;
      let gazeShift = 0;
      if (!isBlinking && (session.state === 'idle' || session.state === 'bookmarked' || session.state === 'waiting')) {
        const glance = Math.sin(tick * 0.03 + (seed % 50));
        if (glance > 0.78) gazeShift = 1;
        else if (glance < -0.78) gazeShift = -1;
      }

      if (isBlinking) {
        px(x + 35, ay + 3, 2, 1, '#1E293B');
        px(x + 41, ay + 3, 2, 1, '#1E293B');
      } else {
        px(x + 35 + gazeShift, ay + 2, 2, 2, '#1E293B');
        px(x + 41 + gazeShift, ay + 2, 2, 2, '#1E293B');
      }

      // Arms by state / activity
      if (isCelebrating) {
        px(x + 25, ay + 1, 5, 11, meta.shirt);
        px(x + 48, ay + 1, 5, 11, meta.shirt);
      } else if (session.state === 'waiting') {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 2 + waitBounce, 5, 11, meta.shirt);
      } else if (rateLimited) {
        px(x + 26, ay + 14, 5, 6, meta.shirt);
        px(x + 47, ay + 14, 5, 6, meta.shirt);
      } else if (busyKind === 'think') {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 46, ay + 7, 5, 9, meta.shirt);
      } else if (busyKind === 'read') {
        px(x + 26, ay + 14, 5, 6, meta.shirt);
        px(x + 47, ay + 12 + (Math.floor(tick / 18) % 2), 5, 6, meta.shirt);
      } else if (session.state === 'busy') {
        px(x + 26, ay + 13 + typingBob, 5, 7, meta.shirt);
        px(x + 47, ay + 13 + (2 - typingBob), 5, 7, meta.shirt);
      } else if (session.state === 'idle' && actor && actor.hasDrink && idleAgeMs < IDLE_COLD_COFFEE_MS && ((tick + (seed % 80)) % 140) < 28) {
        // Periodic sip of coffee or beer
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 6, 5, 8, meta.shirt);
        if (actor.drinkType === 'beer') {
          px(x + 48, ay + 3, 5, 5, '#FACC15');
          px(x + 48, ay + 2, 5, 2, '#F8FAFC');
        } else {
          px(x + 48, ay + 3, 5, 5, '#F8FAFC');
        }
      } else {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 13, 5, 6, meta.shirt);
      }

      // Floating Zzz for active rate-limit or long-idle nap
      if (isDozing) {
        const zOff = (tick % 36) / 6;
        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('z', x + 50, ay - 7 - zOff);
        if (tick % 36 > 12) ctx.fillText('Z', x + 54, ay - 12 - zOff);
      }

      // Floating thought dots when thinking
      if (busyKind === 'think' && !isCelebrating) {
        const pulse = Math.floor(tick / 14) % 3;
        px(x + 48, ay - 9, 2, 2, '#E2E8F0');
        if (pulse >= 1) px(x + 52, ay - 13, 3, 3, '#E2E8F0');
        if (pulse >= 2) px(x + 56, ay - 17, 5, 4, '#CBD5E1');
      }
    }

    function drawWalkingAvatar(actor, session, p) {
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const x = actor.x;
      const y = actor.y;
      const isMoving = actor.waypoints && actor.waypoints.length > 0;
      const stride = isMoving ? Math.round(Math.sin(tick * 0.4) * 2) : 0;
      const stepBob = isMoving ? Math.abs(Math.round(Math.sin(tick * 0.4))) : 0;
      const ay = y - stepBob;

      // Legs (slightly crouched when playing PlayStation)
      if (actor.phase === 'playing') {
        px(x + 32, ay + 23, 6, 4, '#1E293B');
        px(x + 40, ay + 23, 6, 4, '#1E293B');
      } else {
        px(x + 32, ay + 24, 5, 5 + Math.max(0, stride), '#1E293B');
        px(x + 41, ay + 24, 5, 5 + Math.max(0, -stride), '#1E293B');
      }
      // Torso
      px(x + 30, ay + 10, 18, 14, meta.shirt);
      // Head & hair
      px(x + 32, ay - 4, 14, 14, '#F1C27D');
      px(x + 31, ay - 6, 16, 5, meta.hair);

      // Eyes turned toward facing direction
      const eyeOffset = actor.facing === 'right' ? 2 : (actor.facing === 'left' ? -2 : 0);
      px(x + 35 + eyeOffset, ay + 2, 2, 2, '#1E293B');
      px(x + 41 + eyeOffset, ay + 2, 2, 2, '#1E293B');

      // Arms + gamepad / gesture / drink
      if (actor.phase === 'playing') {
        const mash = Math.floor(tick / 6) % 2;
        px(x + 28, ay + 13 + mash, 5, 5, meta.shirt);
        px(x + 46, ay + 13 + (1 - mash), 5, 5, meta.shirt);
        // Pixel PlayStation controller
        px(x + 49, ay + 15, 7, 4, '#0F172A');
        px(x + 51, ay + 16, 2, 2, '#38BDF8');
      } else if (actor.phase === 'chatting') {
        const talkPhase = Math.floor(tick / 40 + (actor.leisureSlot || 0)) % 2 === 0;
        const armWave = talkPhase ? (Math.floor(tick / 10) % 2) * 3 : 0;
        px(x + 26, ay + 13 - (actor.facing === 'left' ? armWave : 0), 4, 7, meta.shirt);
        px(x + 48, ay + 13 - (actor.facing === 'right' ? armWave : 0), 4, 7, meta.shirt);
        if (talkPhase) {
          const glyphs = ['{}', '</>', '?!', '✓'];
          const g = glyphs[(Math.floor(tick / 45) + (actor.leisureSlot || 0)) % glyphs.length];
          px(x + 29, ay - 22, 22, 12, '#F8FAFC');
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 8.5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(g, x + 40, ay - 13);
        }
      } else {
        px(x + 26, ay + 12 + stride, 4, 7, meta.shirt);
        px(x + 48, ay + 12 - stride, 4, 7, meta.shirt);
        if (actor.hasDrink) {
          const cupX = actor.facing === 'left' ? x + 22 : x + 50;
          if (actor.drinkType === 'beer') {
            px(cupX, ay + 14, 6, 6, '#FACC15');
            px(cupX, ay + 13, 6, 2, '#F8FAFC');
          } else {
            px(cupX, ay + 14, 6, 6, '#F8FAFC');
            px(cupX + 1, ay + 11, 2, 2, 'rgba(248, 250, 252, 0.7)');
          }
        }
      }

      // Small project pill in open corridor/lounge so owner stays recognizable
      if (actor.x >= getCorridorX() - 20 && actor.phase !== 'chatting') {
        const tag = (session.project || 'ROOT').slice(0, 10);
        px(x + 15, ay - 20, 48, 11, p.badgeBg);
        px(x + 17, ay - 17, 5, 5, meta.color);
        ctx.fillStyle = p.text;
        ctx.font = 'bold 8.5px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(tag, x + 24, ay - 12);
      }
    }

    function drawDeskLamp(x, y, lit, tod) {
      // Base, arm & shade on left desk corner
      px(x + 6, y + 20, 10, 3, '#475569');
      px(x + 9, y + 12, 3, 8, '#64748B');
      px(x + 8, y + 8, 11, 5, lit ? '#FDE047' : '#64748B');
      if (lit) {
        const alpha = tod === 'day' ? 0.14 : ((tod === 'evening' || tod === 'dawn') ? 0.24 : 0.34);
        const glow = 'rgba(253, 224, 71, ' + alpha + ')';
        px(x + 6, y + 13, 15, 6, glow);
        px(x + 4, y + 19, 21, 9, glow);
        px(x + 2, y + 28, 25, 10, glow);
      }
    }

    function drawContextStack(x, y, session) {
      const pct = session.tokens && typeof session.tokens.percent === 'number' ? session.tokens.percent : null;
      if (pct === null || pct <= 0) return;
      const baseX = x + 6;
      const baseY = y + 45;
      const layers = pct >= 80 ? 5 : (pct >= 60 ? 4 : (pct >= 25 ? 2 : 1));
      for (let i = 0; i < layers; i++) {
        const wobble = (pct >= 80 && i % 2 === 1) ? 1 : 0;
        let col = i % 2 === 0 ? '#E2E8F0' : '#CBD5E1';
        if (i === layers - 1) {
          if (pct >= 80) col = '#EF4444';
          else if (pct >= 60) col = '#F59E0B';
        }
        px(baseX + wobble, baseY - i * 3, 14, 2, col);
      }
      if (pct >= 90 && (Math.floor(tick / 14) % 2 === 0)) {
        px(baseX + 16, baseY - layers * 3, 3, 3, '#EF4444');
      }
    }

    function drawMonitorScreen(x, y, session, now, tod) {
      const rateLimited = isRateLimitedActive(session, now);
      if (rateLimited) {
        px(x + 33, y + 7, 32, 16, '#1E293B');
        // Animated pixel hourglass
        const phase = Math.floor(tick / 20) % 2;
        px(x + 45, y + 9, 8, 2, '#94A3B8');
        px(x + 46, y + 11, 6, 3, phase === 0 ? '#F59E0B' : '#334155');
        px(x + 48, y + 14, 2, 2, '#F59E0B');
        px(x + 46, y + 16, 6, 3, phase === 1 ? '#F59E0B' : '#334155');
        px(x + 45, y + 19, 8, 2, '#94A3B8');
        return;
      }

      if (session.state === 'busy') {
        const kind = classifyBusyActivity(session.activity);
        if (kind === 'terminal') {
          px(x + 33, y + 7, 32, 16, '#052E16');
          const lineOff = Math.floor(tick / 10) % 3;
          px(x + 35, y + 9, 18 + lineOff * 2, 2, '#4ADE80');
          px(x + 35, y + 13, 24 - lineOff * 3, 2, '#86EFAC');
          px(x + 35, y + 17, 12, 2, '#22C55E');
          if (Math.floor(tick / 10) % 2 === 0) px(x + 49, y + 17, 4, 2, '#F8FAFC');
        } else if (kind === 'read') {
          px(x + 33, y + 7, 32, 16, '#0F172A');
          const scanRow = 9 + (Math.floor(tick / 10) % 4) * 3;
          px(x + 35, y + 9, 26, 2, '#64748B');
          px(x + 35, y + 12, 22, 2, '#64748B');
          px(x + 35, y + 15, 25, 2, '#64748B');
          px(x + 35, y + 18, 19, 2, '#64748B');
          px(x + 35, y + scanRow, 26, 2, '#38BDF8');
        } else if (kind === 'think') {
          px(x + 33, y + 7, 32, 16, '#1E1B4B');
          const pulseW = 8 + Math.round((Math.sin(tick * 0.14) + 1) * 9);
          px(x + 36, y + 12, pulseW, 4, '#A78BFA');
          px(x + 36, y + 18, 12, 2, '#818CF8');
        } else {
          px(x + 33, y + 7, 32, 16, '#0F2942');
          const shift = Math.floor(tick / 8) % 3;
          px(x + 36, y + 10, 14 + shift * 3, 2, '#38BDF8');
          px(x + 36, y + 14, 22 - shift * 2, 2, '#4ADE80');
          px(x + 36, y + 18, 16, 2, '#A78BFA');
        }
      } else if (session.state === 'waiting') {
        px(x + 33, y + 7, 32, 16, '#451A03');
        px(x + 46, y + 10, 5, 8, '#FBBF24');
      } else if (session.state === 'idle') {
        if (tod === 'night') {
          // Dim night screensaver dot + standby LED
          px(x + 33, y + 7, 32, 16, '#020617');
          const sx = x + 35 + Math.round((Math.sin(tick * 0.07 + hashId(session.sessionId)) + 1) * 12);
          const sy = y + 9 + Math.round((Math.cos(tick * 0.09 + hashId(session.sessionId)) + 1) * 5);
          px(sx, sy, 3, 2, '#38BDF8');
          px(x + 62, y + 24, 2, 1, '#EF4444');
        } else {
          px(x + 33, y + 7, 32, 16, '#052E16');
          px(x + 42, y + 12, 12, 4, '#4ADE80');
        }
      } else {
        px(x + 33, y + 7, 32, 16, '#2E1065');
        px(x + 44, y + 11, 10, 7, '#C084FC');
      }
    }

    function drawDeskBubble(x, y, session, actor, now) {
      if (isRateLimitedActive(session, now)) {
        px(x + 70, y - 14, 22, 14, '#475569');
        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⏳', x + 81, y - 3);
        return;
      }

      if (session.state === 'waiting') {
        const wType = classifyWaitingType(session, now);
        const bob = Math.round(Math.sin(tick * 0.2) * 2);
        if (wType === 'permission') {
          const blink = Math.floor(tick / 14) % 2 === 0;
          px(x + 71, y - 16 + bob, 24, 16, blink ? '#EA580C' : '#F59E0B');
          // Pixel padlock icon
          px(x + 79, y - 13 + bob, 8, 4, '#111827');
          px(x + 81, y - 12 + bob, 4, 3, blink ? '#EA580C' : '#F59E0B');
          px(x + 77, y - 9 + bob, 12, 7, '#111827');
          px(x + 82, y - 7 + bob, 2, 3, '#FEF08A');
        } else if (wType === 'limitPast') {
          px(x + 70, y - 16 + bob, 26, 16, '#22C55E');
          ctx.fillStyle = '#052E16';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⏰!', x + 83, y - 4 + bob);
        } else {
          px(x + 72, y - 16 + bob, 22, 16, '#F59E0B');
          ctx.fillStyle = '#111827';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('?!', x + 83, y - 4 + bob);
        }
      } else if (session.state === 'busy') {
        const kind = classifyBusyActivity(session.activity);
        if (kind === 'terminal') {
          const spin = ['|', '/', '-', '\\\\'][Math.floor(tick / 8) % 4];
          px(x + 70, y - 13, 24, 13, '#1D4ED8');
          ctx.fillStyle = '#86EFAC';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('>' + spin, x + 82, y - 3);
        } else if (kind === 'read') {
          px(x + 70, y - 13, 24, 13, '#0284C7');
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9.5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('📖', x + 82, y - 3);
        } else if (kind === 'think') {
          const dots = ['.', '..', '...'][Math.floor(tick / 14) % 3];
          px(x + 70, y - 13, 24, 13, '#6D28D9');
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(dots, x + 82, y - 3);
        } else {
          const dots = '.'.repeat((Math.floor(tick / 12) % 3) + 1);
          px(x + 70, y - 13, 24, 13, '#2563EB');
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(dots, x + 82, y - 3);
        }
      } else if (session.state === 'idle') {
        let bubbleGlyph = '✓';
        if (actor) {
          if (actor.phase === 'toDrink' || actor.phase === 'atDrink' || actor.phase === 'fromDrink') {
            bubbleGlyph = actor.drinkType === 'beer' ? '🍺' : '☕';
          } else if (actor.phase === 'toPlay' || actor.phase === 'playing' || actor.phase === 'fromPlay') {
            bubbleGlyph = '🎮';
          } else if (actor.phase === 'toChat' || actor.phase === 'chatting' || actor.phase === 'fromChat') {
            bubbleGlyph = '💬';
          }
        }
        px(x + 74, y - 13, 18, 13, '#16A34A');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(bubbleGlyph, x + 83, y - 3);
      } else if (session.state === 'bookmarked') {
        px(x + 74, y - 13, 18, 13, '#9333EA');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('★', x + 83, y - 3);
      }
    }

    function drawDesk(session, p, now, tod) {
      const { x, y } = session.desk;
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const isSelected = session.sessionId === selectedId;
      const isHovered = session.sessionId === hoveredId;
      const until = celebrationUntil.get(session.sessionId) || 0;
      const isCelebrating = until > now;
      const actor = actors.get(session.sessionId);
      const isSeated = !actor || actor.phase === 'seated' || actor.phase === 'celebrating';
      const rateLimited = isRateLimitedActive(session, now);
      const isHauntedDesk = ghost.active && ghost.mode === 'haunt' && ghost.targetType === 'desk' && ghost.targetId === session.sessionId && ghost.hauntUntil > now;

      if (isSelected || isHovered || isCelebrating) {
        ctx.strokeStyle = isCelebrating ? '#22C55E' : (isSelected ? p.selectRing : meta.color);
        ctx.lineWidth = isSelected || isCelebrating ? 2.5 : 1.5;
        ctx.strokeRect(x - 6, y - 16, 112, session.ticket ? 102 : 88);
      }

      if (isSeated) {
        drawSeatedAvatar(x + 11, y - 6, session, actor, p, now);
        if (isHauntedDesk) {
          px(x + 42, y - 22, 12, 12, '#EF4444');
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('!', x + 48, y - 13);
        }
      } else {
        // Empty chair while developer is away in lounge
        px(x + 39, y + 6, 22, 14, p.chair);
      }

      // Desk surface & front edge
      px(x, y + 18, 100, 34, p.deskTop);
      px(x, y + 52, 100, 5, p.deskEdge);

      // Desk lamp (lit when working, flickers when haunted by ghost)
      const baseLit = session.state === 'busy' && !rateLimited;
      const lampLit = isHauntedDesk ? (Math.floor(tick / 4) % 2 === 0) : baseLit;
      drawDeskLamp(x, y, lampLit, tod);

      // Monitor
      px(x + 30, y + 4, 38, 22, p.monitorFrame);
      drawMonitorScreen(x, y, session, now, tod);

      // Context usage paper stack on left desk edge
      drawContextStack(x, y, session);

      // Drink mug on desk when idle at desk (coffee steams while warm, beer shows foam)
      if (session.state === 'idle' && isSeated && (!actor || actor.hasDrink)) {
        if (actor && actor.drinkType === 'beer') {
          px(x + 76, y + 25, 8, 9, '#FACC15');
          px(x + 76, y + 24, 8, 3, '#F8FAFC');
          px(x + 84, y + 27, 2, 5, '#E2E8F0');
        } else {
          const idleAgeMs = session.statusUpdatedAt ? (now - session.statusUpdatedAt) : 0;
          px(x + 76, y + 26, 8, 8, '#F8FAFC');
          if (idleAgeMs < IDLE_COLD_COFFEE_MS) {
            const d = Math.sin(tick * 0.15) * 1.5;
            px(x + 78 + d, y + 20, 2, 4, 'rgba(248, 250, 252, 0.65)');
          }
        }
      }

      // Project nameplate below desk
      px(x + 4, y + 59, 92, 15, p.badgeBg);
      px(x + 7, y + 63, 7, 7, meta.color);
      ctx.fillStyle = p.text;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      const label = (session.project || 'ROOT').slice(0, 12);
      ctx.fillText(label, x + 17, y + 70);

      // JIRA ticket badge directly beneath project nameplate
      if (session.ticket) {
        const ticketText = String(session.ticket).slice(0, 13);
        px(x + 4, y + 75, 92, 12, p.badgeBg);
        px(x + 7, y + 77, 4, 8, '#2684FF');
        ctx.fillStyle = isLightTheme() ? '#0052CC' : '#60A5FA';
        ctx.font = 'bold 8.5px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ticketText, x + 14, y + 84);
      }

      drawDeskBubble(x, y, session, actor, now);
    }

    function drawNightAtmosphere(p, now) {
      const w = canvas.width;
      const h = canvas.height;
      const dimAlpha = isLightTheme() ? 0.22 : 0.36;
      px(0, 31, w, h - 31, 'rgba(6, 10, 26, ' + dimAlpha + ')');

      // Warm lamp & monitor light islands for active desks
      for (const s of layout.items) {
        const rateLimited = isRateLimitedActive(s, now);
        const isHauntedDesk = ghost.active && ghost.mode === 'haunt' && ghost.targetType === 'desk' && ghost.targetId === s.sessionId && ghost.hauntUntil > now;
        const lampOn = (s.state === 'busy' && !rateLimited) || (isHauntedDesk && Math.floor(tick / 4) % 2 === 0);
        if (lampOn) {
          px(s.desk.x - 2, s.desk.y + 8, 32, 34, 'rgba(253, 224, 71, 0.16)');
        }
        if (s.state === 'busy' || s.state === 'waiting') {
          px(s.desk.x + 28, s.desk.y + 4, 42, 24, s.state === 'waiting' ? 'rgba(251, 191, 36, 0.12)' : 'rgba(56, 189, 248, 0.12)');
        }
      }

      // Lounge glows (coffee LED, bar underlight, fridge spill, vacuum headlight)
      const kx = getLoungeAnchorX();
      px(kx + 24, 41, 14, 14, 'rgba(56, 189, 248, 0.14)');
      if (isBarOpen(now)) {
        px(kx - 2, 185, 48, 12, 'rgba(245, 158, 11, 0.16)');
      }
      if (ghost.fridgeUntil > now || countActiveStationActors('bar') > 0) {
        px(kx + 34, 146, 38, 44, 'rgba(14, 165, 233, 0.18)');
      }
      const vx = Math.round(vacuum.x);
      const beamX = vacuum.dir > 0 ? vx + 14 : vx - 14;
      px(beamX, h - 15, 14, 10, 'rgba(186, 230, 253, 0.16)');
    }

    function drawGhost(now) {
      if (!ghost.active) return;
      const bob = Math.round(Math.sin(tick * 0.14) * 3);
      const gx = Math.round(ghost.x);
      const gy = Math.round(ghost.y) + bob;
      const wave = Math.floor(tick / 8) % 2;

      // Soft ectoplasm aura
      px(gx - 3, gy - 2, 22, 24, 'rgba(186, 230, 253, 0.18)');
      // Ghost head & body
      px(gx + 3, gy, 10, 3, 'rgba(241, 245, 249, 0.84)');
      px(gx + 1, gy + 3, 14, 12, 'rgba(226, 232, 240, 0.80)');
      // Wavy lower hem
      px(gx + 1, gy + 15, 4, wave === 0 ? 4 : 2, 'rgba(226, 232, 240, 0.78)');
      px(gx + 6, gy + 15, 4, wave === 1 ? 4 : 2, 'rgba(226, 232, 240, 0.78)');
      px(gx + 11, gy + 15, 4, wave === 0 ? 4 : 2, 'rgba(226, 232, 240, 0.78)');
      // Glowing eyes & spooky mouth
      const look = ghost.facing === 'right' ? 1 : -1;
      px(gx + 4 + look, gy + 6, 3, 3, '#0F172A');
      px(gx + 9 + look, gy + 6, 3, 3, '#0F172A');
      px(gx + 5 + look, gy + 7, 1, 1, '#38BDF8');
      px(gx + 10 + look, gy + 7, 1, 1, '#38BDF8');
      if (ghost.mode === 'haunt' && ghost.hauntUntil > now) {
        px(gx + 6, gy + 11, 4, 3, '#0F172A');
      }
    }

    function draw() {
      if (!ctx) return;
      const p = getThemePalette();
      const now = Date.now();
      const tod = getEffectiveTimeOfDay(now);
      drawFloorAndProps(p, now, tod);
      if (layout.items.length === 0) {
        if (tod === 'night') {
          drawNightAtmosphere(p, now);
          drawGhost(now);
        }
        ctx.fillStyle = p.muted;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Keine aktiven Sessions für den gewählten Filter im Büro.', Math.floor((canvas.width - 100) / 2), Math.floor(canvas.height / 2));
        return;
      }

      // Interleave walkers/lounge avatars and desk rows by Y depth
      const walkers = [];
      const byId = new Map();
      for (const s of layout.items) byId.set(s.sessionId, s);
      actors.forEach((actor, sid) => {
        if (isWalkingOrLoungePhase(actor.phase)) {
          const s = byId.get(sid);
          if (s) walkers.push({ actor, session: s });
        }
      });
      walkers.sort((a, b) => a.actor.y - b.actor.y);

      const colsPerRow = layout.colsPerRow || 4;
      const rows = [];
      for (const s of layout.items) {
        const rowIdx = Math.floor((s.slot || 0) / colsPerRow);
        if (!rows[rowIdx]) rows[rowIdx] = [];
        rows[rowIdx].push(s);
      }

      let wi = 0;
      for (let r = 0; r < rows.length; r++) {
        const rowItems = rows[r];
        if (!rowItems || rowItems.length === 0) continue;
        const rowSeatY = rowItems[0].desk.y - 6;
        while (wi < walkers.length && walkers[wi].actor.y <= rowSeatY) {
          drawWalkingAvatar(walkers[wi].actor, walkers[wi].session, p);
          wi++;
        }
        for (const session of rowItems) {
          drawDesk(session, p, now, tod);
        }
      }
      while (wi < walkers.length) {
        drawWalkingAvatar(walkers[wi].actor, walkers[wi].session, p);
        wi++;
      }

      if (tod === 'night') {
        drawNightAtmosphere(p, now);
        drawGhost(now);
      }

      // Confetti particles on top
      for (const c of confetti) {
        px(c.x, c.y, 3, 3, c.color);
      }
    }

    function updateLegend() {
      if (!legendEl) return;
      const counts = { waiting: 0, busy: 0, bookmarked: 0, idle: 0 };
      for (const item of layout.items) {
        if (counts[item.state] !== undefined) counts[item.state]++;
      }
      legendEl.innerHTML = OFFICE_ACTIVE_STATES.map((st) => {
        const m = STATE_META[st];
        return '<span class="office-legend-item"><span class="office-legend-dot" style="background:' + m.color + '"></span>' + counts[st] + ' ' + m.label + '</span>';
      }).join('');
      if (truncEl) {
        if (layout.truncated) {
          truncEl.textContent = 'Zeige ' + layout.items.length + ' von ' + layout.totalActive + ' aktiven Sessions';
          truncEl.style.display = '';
        } else {
          truncEl.style.display = 'none';
        }
      }
    }

    function updateInspector() {
      if (!infoEl || !actionsEl) return;
      const s = layout.items.find((item) => item.sessionId === selectedId) || null;
      if (!s) {
        infoEl.innerHTML = 'Klicke auf einen Schreibtisch im Büro, um Details zu sehen; Doppelklick öffnet direkt den Chat.';
        actionsEl.innerHTML = '';
        return;
      }
      const pm = PROVIDER_PALETTE[s.provider] || PROVIDER_PALETTE.claude;
      const sm = STATE_META[s.state] || { label: s.state, color: '#94A3B8' };
      const title = s.title || s.sessionId;
      const activity = s.activity || s.detail || sm.label;
      const projectName = s.project || 'ROOT';
      const isUnassigned = projectName === 'Nicht zugewiesen';
      const projectTitle = isUnassigned
        ? 'Session noch keinem Projekt zugewiesen (Klicken zum Zuweisen)'
        : 'Projekt manuell zuweisen oder ändern (aktuell: ' + projectName + ')';
      const providerIconHtml =
        '<span class="office-provider-icon ' + escapeHtml(s.provider || 'claude') + '" title="' + escapeHtml(pm.label) + '">' +
        (CARD_ICONS[s.provider] || CARD_ICONS.claude) +
        '</span>';
      const projectBadgeHtml =
        '<button type="button" class="office-project-badge' + (isUnassigned ? ' unassigned' : '') + '" data-office-act="assignProject" title="' + escapeHtml(projectTitle) + '">📁 ' + escapeHtml(projectName) + '</button>';
      const ticketInfoBadge = !jiraEnabled && s.ticket
        ? '<span class="office-jira-pill" style="cursor:default;">' + CARD_ICONS.jira + ' ' + escapeHtml(s.ticket) + '</span>'
        : '';
      infoEl.innerHTML =
        providerIconHtml +
        projectBadgeHtml +
        ticketInfoBadge +
        '<span class="office-inspector-title">' + escapeHtml(title) + '</span>' +
        '<span>(' + escapeHtml(sm.label) + ': ' + escapeHtml(activity) + ')</span>';

      const pinTitle = s.isBookmarked ? 'Nicht mehr merken' : 'Session merken';
      const jiraBtn = jiraEnabled
        ? (s.ticket
          ? '<button type="button" class="office-jira-pill" data-office-act="openJira" title="JIRA: ' + escapeHtml(s.ticket) + ' im Browser öffnen">' + CARD_ICONS.jira + ' ' + escapeHtml(s.ticket) + '</button>' +
            '<button type="button" class="office-jira-remove-btn" data-office-act="removeTicket" title="JIRA-Ticket ' + escapeHtml(s.ticket) + ' entfernen (löschen)">🗑️</button>'
          : '<button type="button" class="office-jira-add-btn" data-office-act="assignTicket" title="JIRA-Ticket zuweisen...">' + CARD_ICONS.jira + ' + JIRA</button>')
        : '';
      actionsEl.innerHTML =
        '<button type="button" class="office-act-btn primary" data-office-act="open" title="Chat öffnen">💬 Chat öffnen</button>' +
        '<button type="button" class="office-act-btn" data-office-act="viewTranscript" title="Transkript & Verlauf im Read-Only Viewer ansehen">👁️ Details</button>' +
        jiraBtn +
        '<button type="button" class="office-act-btn" data-office-act="markDone" title="Session als erledigt markieren">✅ Erledigt</button>' +
        '<button type="button" class="office-pin-btn' + (s.isBookmarked ? ' active' : '') + '" data-office-act="toggleBookmark" title="' + pinTitle + '">' + CARD_ICONS.pin + '</button>';

      const bindInspectorActions = (root) => {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        root.querySelectorAll('[data-office-act]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const act = btn.getAttribute('data-office-act');
            if (!act) return;
            vscode.postMessage({ action: act, sessionId: s.sessionId, provider: s.provider });
          });
        });
      };
      bindInspectorActions(infoEl);
      bindInspectorActions(actionsEl);
    }

    function cycleTimeOfDay() {
      const idx = TOD_CYCLE.indexOf(simulatedTod);
      simulatedTod = TOD_CYCLE[(idx + 1) % TOD_CYCLE.length];
      stepGhost(Date.now(), 0.016);
      updateSimPill();
      draw();
      return simulatedTod;
    }

    function hitTest(clientX, clientY) {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = ((clientX - rect.left) / rect.width) * canvas.width;
      const y = ((clientY - rect.top) / rect.height) * canvas.height;
      if (y >= 2 && y <= 26) {
        const windows = getWindowPositions(canvas.width);
        const wIdx = windows.findIndex((wx) => x >= wx && x <= wx + 58);
        if (wIdx !== -1) return { isWindow: true, windowIndex: wIdx };
      }
      if (ghost.active && x >= ghost.x - 4 && x <= ghost.x + 20 && y >= ghost.y - 6 && y <= ghost.y + 24) {
        return { isGhost: true };
      }
      for (const s of layout.items) {
        const actor = actors.get(s.sessionId);
        if (actor && isWalkingOrLoungePhase(actor.phase)) {
          if (x >= actor.x + 20 && x <= actor.x + 58 && y >= actor.y - 12 && y <= actor.y + 32) {
            return s;
          }
        }
      }
      return layout.items.find((s) => x >= s.desk.x - 6 && x <= s.desk.x + 106 && y >= s.desk.y - 16 && y <= s.desk.y + 88) || null;
    }

    function hideTooltip() {
      if (tooltipEl) tooltipEl.style.display = 'none';
    }

    function showWindowTooltip(clientX, clientY) {
      if (!tooltipEl || !canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const now = Date.now();
      const tod = getEffectiveTimeOfDay(now);
      const sun = computeSunTimes(now);
      const modeText = simulatedTod ? 'Simulation' : 'Echtzeit (' + escapeHtml(sun.tz || 'lokal') + ')';
      const sunLine = sun.sunriseMin !== null && sun.sunsetMin !== null
        ? '<div>🌅 ' + formatMinutesHM(sun.sunriseMin) + ' · 🌇 ' + formatMinutesHM(sun.sunsetMin) + '</div>'
        : '';
      tooltipEl.innerHTML =
        '<div><strong>🪟 Büro-Fenster</strong> · ' + escapeHtml(TOD_LABELS[tod] || tod) + '</div>' +
        '<div style="opacity:0.85">Modus: ' + modeText + '</div>' +
        sunLine +
        '<div style="opacity:0.75">Klick zum Durchschalten der Tageszeiten</div>';
      const left = Math.min(Math.max(8, clientX - rect.left + 12), Math.max(8, rect.width - 288));
      const top = Math.min(Math.max(8, clientY - rect.top + 12), Math.max(8, rect.height - 86));
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
      tooltipEl.style.display = 'block';
    }

    function showGhostTooltip(clientX, clientY) {
      if (!tooltipEl || !canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      tooltipEl.innerHTML =
        '<div><strong>👻 Büro-Geist</strong></div>' +
        '<div style="opacity:0.85">Treibt ab Sonnenuntergang bis zum Morgen sein Unwesen im Büro.</div>';
      const left = Math.min(Math.max(8, clientX - rect.left + 12), Math.max(8, rect.width - 288));
      const top = Math.min(Math.max(8, clientY - rect.top + 12), Math.max(8, rect.height - 86));
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
      tooltipEl.style.display = 'block';
    }

    function showTooltip(session, clientX, clientY) {
      if (!tooltipEl || !canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const pm = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const sm = STATE_META[session.state] || { label: session.state };
      const ctxPct = session.tokens && typeof session.tokens.percent === 'number' ? ' · Context ' + Math.round(session.tokens.percent) + '%' : '';
      const ticketLine = session.ticket ? '<div style="color:#60A5FA">🎫 ' + escapeHtml(session.ticket) + '</div>' : '';
      const actLine = session.activity ? '<div style="opacity:0.85">' + escapeHtml(session.activity) + '</div>' : '';
      tooltipEl.innerHTML =
        '<div><strong>' + escapeHtml(session.project || 'ROOT') + '</strong> · <span style="color:' + pm.color + '">' + escapeHtml(pm.label) + '</span></div>' +
        '<div>' + escapeHtml(session.title || session.sessionId) + '</div>' +
        ticketLine +
        actLine +
        '<div style="opacity:0.8">' + escapeHtml(sm.label) + (session.detail ? ' · ' + escapeHtml(session.detail) : '') + escapeHtml(ctxPct) + '</div>';
      const left = Math.min(Math.max(8, clientX - rect.left + 12), Math.max(8, rect.width - 288));
      const top = Math.min(Math.max(8, clientY - rect.top + 12), Math.max(8, rect.height - 86));
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
      tooltipEl.style.display = 'block';
    }

    if (canvas) {
      canvas.addEventListener('mousemove', (e) => {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit && hit.isWindow) {
          hoveredId = null;
          hoveredGhost = false;
          canvas.style.cursor = 'pointer';
          showWindowTooltip(e.clientX, e.clientY);
          return;
        }
        if (hit && hit.isGhost) {
          hoveredId = null;
          hoveredGhost = true;
          canvas.style.cursor = 'help';
          showGhostTooltip(e.clientX, e.clientY);
          return;
        }
        hoveredGhost = false;
        hoveredId = hit ? hit.sessionId : null;
        canvas.style.cursor = hit ? 'pointer' : 'default';
        if (hit) showTooltip(hit, e.clientX, e.clientY);
        else hideTooltip();
      });
      canvas.addEventListener('mouseleave', () => {
        hoveredId = null;
        hoveredGhost = false;
        canvas.style.cursor = 'default';
        hideTooltip();
      });
      canvas.addEventListener('click', (e) => {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit && hit.isWindow) {
          cycleTimeOfDay();
          showWindowTooltip(e.clientX, e.clientY);
          return;
        }
        if (hit && !hit.isGhost) {
          selectedId = hit.sessionId;
          updateInspector();
          draw();
        }
      });
      canvas.addEventListener('dblclick', (e) => {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit && !hit.isGhost && !hit.isWindow) {
          vscode.postMessage({ action: 'open', sessionId: hit.sessionId, provider: hit.provider });
        }
      });
    }

    function startLoop() {
      if (rafId !== null || !isActive || document.hidden) return;
      lastFrameAt = Date.now();
      const step = () => {
        if (!isActive || document.hidden) {
          rafId = null;
          return;
        }
        tick++;
        stepSimulation(Date.now());
        draw();
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }

    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopLoop();
      else if (isActive) startLoop();
    });

    function syncPopoutSelects(payload) {
      if (providerSelect && payload.filter) {
        providerSelect.value = payload.filter;
      }
      if (projectSelect && payload.counts && payload.counts.byProject) {
        const currentProj = payload.projectFilter || 'all';
        const names = Object.keys(payload.counts.byProject).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
        projectSelect.innerHTML = '<option value="all">Alle Projekte (' + (payload.counts.all || 0) + ')</option>' +
          names.map((n) => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + ' (' + payload.counts.byProject[n] + ')</option>').join('');
        projectSelect.value = currentProj;
      }
    }

    window.__aiOffice = {
      update(payload) {
        if (!payload) return;
        const now = Date.now();
        const completed = Array.isArray(payload.justCompletedSessionIds) ? payload.justCompletedSessionIds : [];
        if (typeof payload.jiraEnabled === 'boolean') {
          jiraEnabled = payload.jiraEnabled;
        }

        layout = buildOfficeLayout(payload.columns || [], deskSlots);
        deskSlots = layout.slots;
        if (canvas) {
          if (canvas.width !== layout.canvasWidth) canvas.width = layout.canvasWidth;
          if (canvas.height !== layout.canvasHeight) canvas.height = layout.canvasHeight;
        }
        syncActorsWithLayout(layout.items, completed, now);

        if (selectedId && !layout.items.some((s) => s.sessionId === selectedId)) {
          selectedId = null;
        }
        if (!selectedId && layout.items.length > 0) {
          selectedId = layout.items[0].sessionId;
        }
        if (IS_POPOUT) syncPopoutSelects(payload);
        updateLegend();
        updateInspector();
        draw();
      },
      setActive(active) {
        isActive = Boolean(active);
        if (isActive) {
          draw();
          startLoop();
        } else {
          stopLoop();
          hideTooltip();
        }
      },
      cycleTimeOfDay() {
        return cycleTimeOfDay();
      },
      setSimulatedTimeOfDay(tod) {
        simulatedTod = TOD_CYCLE.includes(tod) ? tod : null;
        stepGhost(Date.now(), 0.016);
        updateSimPill();
        draw();
        return simulatedTod;
      },
      getStats() {
        const now = Date.now();
        const phases = {};
        actors.forEach((a, sid) => {
          phases[sid] = {
            phase: a.phase,
            drinkStation: a.drinkStation,
            drinkType: a.drinkType,
            drinkSlot: a.drinkSlot,
            leisureSlot: a.leisureSlot,
            hasDrink: a.hasDrink
          };
        });
        return {
          coffeeQueueCount: countActiveStationActors('coffee'),
          barQueueCount: countActiveStationActors('bar'),
          playCount: countActiveLeisureActors('play'),
          chatCount: countActiveLeisureActors('chat'),
          tod: getEffectiveTimeOfDay(now),
          simulatedTod,
          sunTimes: computeSunTimes(now),
          getTimeOfDayFor: (ts, tz) => getTimeOfDay(ts, tz),
          getSunTimesFor: (ts, tz) => computeSunTimes(ts, tz),
          windowPositions: getWindowPositions(canvas ? canvas.width : 796),
          ghostActive: ghost.active,
          ghostMode: ghost.mode,
          confettiCount: confetti.length,
          phases
        };
      }
    };

    if (IS_POPOUT) {
      startLoop();
    }
  })();`;
}

module.exports = {
  OFFICE_ACTIVE_STATES,
  PROVIDER_PALETTE,
  CARD_ICONS,
  buildOfficeLayout,
  getOfficeStyles,
  getOfficeHtml,
  getOfficeClientScript
};
