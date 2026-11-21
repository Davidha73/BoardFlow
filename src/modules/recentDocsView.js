/**
 * Renders the Recent Boards & Templates view on the Start Screen.
 */

import { createIconPlaceholder, initIcons } from './icons.js';

function getDirName(filePath) {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx > 0 ? filePath.slice(0, idx) : '';
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STARTER_TEMPLATES = [
  {
    id: 'brainstorm',
    title: 'Brainstorm',
    desc: 'Sticky notes & idea clusters',
    shapes: [
      { id: 't1', type: 'rect', x: 120, y: 100, w: 180, h: 140, fillColor: '#FEF08A', strokeColor: '#EAB308', strokeWidth: 1, cornerRadius: 6, shadow: 'soft', textEnabled: true, label: 'Core Idea' },
      { id: 't2', type: 'rect', x: 340, y: 100, w: 180, h: 140, fillColor: '#BFDBFE', strokeColor: '#3B82F6', strokeWidth: 1, cornerRadius: 6, shadow: 'soft', textEnabled: true, label: 'User Value' },
      { id: 't3', type: 'rect', x: 560, y: 100, w: 180, h: 140, fillColor: '#BBF7D0', strokeColor: '#22C55E', strokeWidth: 1, cornerRadius: 6, shadow: 'soft', textEnabled: true, label: 'Next Steps' },
    ],
  },
  {
    id: 'flowchart',
    title: 'Flowchart',
    desc: 'Start, decision & action steps',
    shapes: [
      { id: 'f1', type: 'ellipse', x: 140, y: 120, w: 130, h: 70, fillColor: '#DBEAFE', strokeColor: '#2563EB', strokeWidth: 2, textEnabled: true, label: 'Start' },
      { id: 'f2', type: 'rect', x: 340, y: 120, w: 150, h: 70, fillColor: '#ffffff', strokeColor: '#1a1a1a', strokeWidth: 2, cornerRadius: 8, textEnabled: true, label: 'Process Step' },
      { id: 'f3', type: 'arrow', x1: 270, y1: 155, x2: 340, y2: 155, strokeColor: '#1a1a1a', strokeWidth: 2, startMarker: 'none', endMarker: 'arrow' },
    ],
  },
  {
    id: 'retro',
    title: 'Retrospective',
    desc: 'Went well, improve & actions',
    shapes: [
      { id: 'r1', type: 'rect', x: 100, y: 90, w: 200, h: 60, fillColor: '#BBF7D0', strokeColor: '#16A34A', strokeWidth: 1, cornerRadius: 6, textEnabled: true, label: 'What Went Well' },
      { id: 'r2', type: 'rect', x: 330, y: 90, w: 200, h: 60, fillColor: '#FED7AA', strokeColor: '#EA580C', strokeWidth: 1, cornerRadius: 6, textEnabled: true, label: 'To Improve' },
      { id: 'r3', type: 'rect', x: 560, y: 90, w: 200, h: 60, fillColor: '#DDD6FE', strokeColor: '#7C3AED', strokeWidth: 1, cornerRadius: 6, textEnabled: true, label: 'Action Items' },
    ],
  },
];

export function createRecentDocsView({
  containerEl,
  onOpenFile,
  onNewDocument,
  onNewTemplate,
  onDeleteTemplate,
  getCustomTemplates,
  onOpenDialog,
  onClearRecent,
  onRemoveRecent,
  onCopyPath,
  onShowInExplorer,
}) {
  function createMenuItem(iconName, labelText, onClick) {
    const itemBtn = document.createElement('button');
    itemBtn.type = 'button';
    itemBtn.className = 'recent-doc-menu-item';
    itemBtn.setAttribute('role', 'menuitem');
    itemBtn.appendChild(createIconPlaceholder(iconName, 'lucide-xs'));
    const labelEl = document.createElement('span');
    labelEl.textContent = labelText;
    itemBtn.appendChild(labelEl);
    itemBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeAllMenus();
      onClick?.();
    });
    return itemBtn;
  }

  function closeAllMenus() {
    containerEl?.querySelectorAll('.recent-doc-menu-popover.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
    });
    containerEl?.querySelectorAll('.recent-doc-menu-btn[aria-expanded="true"]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('.recent-doc-menu-wrap')) {
      closeAllMenus();
    }
  });

  const allTemplatesModalEl = document.getElementById('all-templates-modal');
  const allTemplatesBackdropEl = document.getElementById('all-templates-modal-backdrop');
  const allTemplatesGridEl = document.getElementById('all-templates-grid');
  const allRecentsModalEl = document.getElementById('all-recents-modal');
  const allRecentsBackdropEl = document.getElementById('all-recents-modal-backdrop');
  const allRecentsListEl = document.getElementById('all-recents-list');
  let lastRecentItems = [];

  function getAllTemplates() {
    const customTemplates = typeof getCustomTemplates === 'function' ? getCustomTemplates() : [];
    return [...STARTER_TEMPLATES, ...customTemplates];
  }

  function setAllTemplatesOpen(isOpen) {
    if (!allTemplatesModalEl) return;
    if (isOpen && allTemplatesGridEl) {
      allTemplatesGridEl.innerHTML = '';
      getAllTemplates().forEach((tpl) => {
        allTemplatesGridEl.appendChild(
          createTemplateCard(tpl, () => setAllTemplatesOpen(false))
        );
      });
      initIcons(allTemplatesGridEl);
    }
    allTemplatesModalEl.classList.toggle('is-open', isOpen);
    allTemplatesBackdropEl?.classList.toggle('is-open', isOpen);
    allTemplatesModalEl.setAttribute('aria-hidden', String(!isOpen));
    allTemplatesBackdropEl?.setAttribute('aria-hidden', String(!isOpen));
  }

  function setAllRecentsOpen(isOpen) {
    if (!allRecentsModalEl) return;
    if (isOpen && allRecentsListEl) {
      allRecentsListEl.innerHTML = '';
      lastRecentItems.forEach((doc) => {
        allRecentsListEl.appendChild(createRecentDocRow(doc, () => setAllRecentsOpen(false)));
      });
      initIcons(allRecentsListEl);
    }
    allRecentsModalEl.classList.toggle('is-open', isOpen);
    allRecentsBackdropEl?.classList.toggle('is-open', isOpen);
    allRecentsModalEl.setAttribute('aria-hidden', String(!isOpen));
    allRecentsBackdropEl?.setAttribute('aria-hidden', String(!isOpen));
  }

  document.getElementById('btn-close-all-templates')?.addEventListener('click', () => setAllTemplatesOpen(false));
  document.getElementById('btn-done-all-templates')?.addEventListener('click', () => setAllTemplatesOpen(false));
  allTemplatesBackdropEl?.addEventListener('click', () => setAllTemplatesOpen(false));
  document.getElementById('btn-close-all-recents')?.addEventListener('click', () => setAllRecentsOpen(false));
  document.getElementById('btn-done-all-recents')?.addEventListener('click', () => setAllRecentsOpen(false));
  allRecentsBackdropEl?.addEventListener('click', () => setAllRecentsOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (allTemplatesModalEl?.classList.contains('is-open')) setAllTemplatesOpen(false);
      if (allRecentsModalEl?.classList.contains('is-open')) setAllRecentsOpen(false);
    }
  });

  function createTemplatePreviewSvg(shapes) {
    if (!Array.isArray(shapes) || shapes.length === 0) return null;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    shapes.forEach((s) => {
      const sx1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.x1, s.x2) : s.x;
      const sy1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.y1, s.y2) : s.y;
      const sx2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.x1, s.x2) : s.x + (s.w || 40);
      const sy2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.y1, s.y2) : s.y + (s.h || 40);
      minX = Math.min(minX, sx1);
      minY = Math.min(minY, sy1);
      maxX = Math.max(maxX, sx2);
      maxY = Math.max(maxY, sy2);
    });
    const pad = 28;
    const vbW = Math.max(80, maxX - minX + pad * 2);
    const vbH = Math.max(60, maxY - minY + pad * 2);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'recent-template-thumb-svg');
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${vbW} ${vbH}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    shapes.forEach((s) => {
      if (s.type === 'line' || s.type === 'arrow') {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(s.x1));
        line.setAttribute('y1', String(s.y1));
        line.setAttribute('x2', String(s.x2));
        line.setAttribute('y2', String(s.y2));
        line.setAttribute('stroke', s.strokeColor && s.strokeColor !== 'none' ? s.strokeColor : '#64748b');
        line.setAttribute('stroke-width', String(Math.max(4, s.strokeWidth || 3)));
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
      } else if (s.type === 'ellipse') {
        const el = document.createElementNS(SVG_NS, 'ellipse');
        el.setAttribute('cx', String(s.x + s.w / 2));
        el.setAttribute('cy', String(s.y + s.h / 2));
        el.setAttribute('rx', String(s.w / 2));
        el.setAttribute('ry', String(s.h / 2));
        el.setAttribute('fill', s.fillColor === 'none' ? 'none' : s.fillColor || '#ffffff');
        el.setAttribute('stroke', s.strokeColor === 'none' ? 'none' : s.strokeColor || '#64748b');
        el.setAttribute('stroke-width', '4');
        svg.appendChild(el);
      } else if (s.type === 'diamond') {
        const poly = document.createElementNS(SVG_NS, 'polygon');
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        poly.setAttribute('points', `${cx},${s.y} ${s.x + s.w},${cy} ${cx},${s.y + s.h} ${s.x},${cy}`);
        poly.setAttribute('fill', s.fillColor === 'none' ? 'none' : s.fillColor || '#ffffff');
        poly.setAttribute('stroke', s.strokeColor === 'none' ? 'none' : s.strokeColor || '#64748b');
        poly.setAttribute('stroke-width', '4');
        svg.appendChild(poly);
      } else {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(s.x));
        rect.setAttribute('y', String(s.y));
        rect.setAttribute('width', String(s.w || 40));
        rect.setAttribute('height', String(s.h || 40));
        rect.setAttribute('rx', String(s.type === 'frame' ? 8 : s.cornerRadius || 4));
        if (s.type === 'frame') {
          rect.setAttribute('fill', 'rgba(148,163,184,0.12)');
          rect.setAttribute('stroke', '#94a3b8');
          rect.setAttribute('stroke-dasharray', '10,6');
          rect.setAttribute('stroke-width', '4');
        } else {
          rect.setAttribute('fill', s.fillColor === 'none' ? 'none' : s.fillColor || '#ffffff');
          rect.setAttribute('stroke', s.strokeColor === 'none' ? 'none' : s.strokeColor || '#64748b');
          rect.setAttribute('stroke-width', '4');
        }
        svg.appendChild(rect);
      }
    });
    return svg;
  }

  function createTemplateCard(tpl, onBeforeSelect) {
    const tplBtn = document.createElement('button');
    tplBtn.type = 'button';
    tplBtn.className = 'recent-template-card';

    if (tpl.isCustom) {
      const delBtn = document.createElement('span');
      delBtn.className = 'recent-template-delete';
      delBtn.role = 'button';
      delBtn.tabIndex = 0;
      delBtn.title = `Delete "${tpl.title}"`;
      delBtn.setAttribute('aria-label', `Delete template ${tpl.title}`);
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await onDeleteTemplate?.(tpl.id);
        if (allTemplatesModalEl?.classList.contains('is-open')) setAllTemplatesOpen(true);
      });
      tplBtn.appendChild(delBtn);
    }

    const thumb = document.createElement('div');
    thumb.className = 'recent-template-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const previewSvg = createTemplatePreviewSvg(tpl.shapes);
    if (previewSvg) {
      thumb.appendChild(previewSvg);
    } else {
      thumb.classList.add('is-blank');
      thumb.appendChild(createIconPlaceholder('layout-template', 'lucide-md'));
    }
    tplBtn.appendChild(thumb);

    const textWrap = document.createElement('span');
    textWrap.className = 'recent-template-text';
    const titleEl = document.createElement('span');
    titleEl.className = 'recent-template-title';
    titleEl.textContent = tpl.title;
    const descEl = document.createElement('span');
    descEl.className = 'recent-template-desc';
    descEl.textContent = tpl.desc;
    textWrap.appendChild(titleEl);
    textWrap.appendChild(descEl);

    tplBtn.appendChild(textWrap);
    tplBtn.addEventListener('click', () => {
      onBeforeSelect?.();
      onNewTemplate?.(tpl);
    });
    return tplBtn;
  }

  function createRecentDocRow(doc, onBeforeOpen) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recent-doc-item';
    btn.title = doc.path;

    const info = document.createElement('span');
    info.className = 'recent-doc-info';
    const nameEl = document.createElement('span');
    nameEl.className = 'recent-doc-name';
    nameEl.textContent = doc.name || doc.path;
    const pathEl = document.createElement('span');
    pathEl.className = 'recent-doc-path';
    pathEl.textContent = getDirName(doc.path);
    info.append(nameEl, pathEl);

    const meta = document.createElement('span');
    meta.className = 'recent-doc-meta';
    const modeEl = document.createElement('span');
    modeEl.className = 'recent-doc-mode';
    modeEl.textContent = 'BOARD';
    const sizeEl = document.createElement('span');
    sizeEl.className = 'recent-doc-size';
    sizeEl.textContent = formatSize(doc.size);
    const dateEl = document.createElement('span');
    dateEl.className = 'recent-doc-date';
    dateEl.textContent = formatDate(doc.modifiedAt || doc.openedAt);
    meta.append(modeEl, sizeEl, dateEl);

    btn.append(info, meta);
    btn.addEventListener('click', () => {
      onBeforeOpen?.();
      onOpenFile?.(doc.path);
    });

    const row = document.createElement('div');
    row.className = 'recent-doc-row';
    row.setAttribute('role', 'listitem');

    const menuWrap = document.createElement('div');
    menuWrap.className = 'recent-doc-menu-wrap';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'recent-doc-menu-btn';
    menuBtn.title = 'Board options';
    menuBtn.setAttribute('aria-label', `Options for ${doc.name || doc.path}`);
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.appendChild(createIconPlaceholder('ellipsis-vertical', 'lucide-xs'));

    const popover = document.createElement('div');
    popover.className = 'recent-doc-menu-popover';
    popover.setAttribute('role', 'menu');
    popover.append(
      createMenuItem('copy', 'Copy File Path', () => onCopyPath?.(doc.path)),
      createMenuItem('folder-open', 'Show in Finder', () => onShowInExplorer?.(doc.path)),
      Object.assign(document.createElement('div'), { className: 'recent-doc-menu-divider' }),
      createMenuItem('x', 'Remove from Recent Boards', async () => {
        await onRemoveRecent?.(doc.path);
        if (allRecentsModalEl?.classList.contains('is-open')) setAllRecentsOpen(true);
      })
    );

    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !popover.classList.contains('is-open');
      closeAllMenus();
      if (willOpen) {
        popover.classList.add('is-open');
        menuBtn.setAttribute('aria-expanded', 'true');
      }
    });

    menuWrap.append(menuBtn, popover);
    row.append(btn, menuWrap);
    return row;
  }

  function render(items = []) {
    lastRecentItems = Array.isArray(items) ? items : [];
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'recent-docs-card';

    const header = document.createElement('div');
    header.className = 'recent-docs-header';
    const title = document.createElement('h2');
    title.className = 'recent-docs-title';
    title.textContent = 'Recent Boards';
    header.appendChild(title);

    if (items.length > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'recent-docs-clear-btn';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', () => onClearRecent?.());
      header.appendChild(clearBtn);
    }
    card.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'recent-docs-empty';
      empty.textContent = 'No recent boards yet.';
      card.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'recent-docs-list';
      list.setAttribute('role', 'list');
      items.slice(0, 5).forEach((doc) => list.appendChild(createRecentDocRow(doc)));
      card.appendChild(list);

      const moreRow = document.createElement('div');
      moreRow.className = 'recent-templates-more-row';
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'recent-templates-more-btn';
      moreBtn.textContent = items.length > 5 ? `More… (${items.length})` : 'More…';
      moreBtn.addEventListener('click', () => setAllRecentsOpen(true));
      moreRow.appendChild(moreBtn);
      card.appendChild(moreRow);
    }

    const templatesSection = document.createElement('div');
    templatesSection.className = 'recent-templates-section';
    const templatesHeading = document.createElement('div');
    templatesHeading.className = 'recent-templates-heading';
    templatesHeading.textContent = 'Start from a Template';
    templatesSection.appendChild(templatesHeading);

    const templatesGrid = document.createElement('div');
    templatesGrid.className = 'recent-templates-grid';
    const allTemplates = getAllTemplates();
    allTemplates.slice(0, 4).forEach((tpl) => templatesGrid.appendChild(createTemplateCard(tpl)));
    templatesSection.appendChild(templatesGrid);

    const tplMoreRow = document.createElement('div');
    tplMoreRow.className = 'recent-templates-more-row';
    const tplMoreBtn = document.createElement('button');
    tplMoreBtn.type = 'button';
    tplMoreBtn.className = 'recent-templates-more-btn';
    tplMoreBtn.textContent = allTemplates.length > 4 ? `More… (${allTemplates.length})` : 'More…';
    tplMoreBtn.addEventListener('click', () => setAllTemplatesOpen(true));
    tplMoreRow.appendChild(tplMoreBtn);
    templatesSection.appendChild(tplMoreRow);
    card.appendChild(templatesSection);

    const actions = document.createElement('div');
    actions.className = 'recent-docs-actions';
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'recent-docs-action-btn is-primary';
    newBtn.textContent = 'New Board';
    newBtn.addEventListener('click', () => onNewDocument?.());

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'recent-docs-action-btn';
    openBtn.textContent = 'Open Board…';
    openBtn.addEventListener('click', () => onOpenDialog?.());

    actions.append(newBtn, openBtn);
    card.appendChild(actions);

    containerEl.appendChild(card);
    initIcons(containerEl);
  }

  return { render };
}
