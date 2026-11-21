/**
 * BoardFlow Infinite Pan-and-Zoom Whiteboard Canvas & Shape Engine.
 * Matches WordFlow's shape interaction model (anchors, snapping, Alt-bypass,
 * grouping, layering, effects, sticky notes, images, undo/redo, PNG/SVG export).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const PALETTE = [
  '#1a1a1a', '#4b5563', '#9ca3af', '#ffffff', '#dc2626',
  '#ea580c', '#eab308', '#16a34a', '#0d9488', '#2563eb',
  '#4f46e5', '#9333ea', '#db2777', '#fef08a', '#bfdbfe',
];

const LIGHT_FILLS = new Set(['#ffffff', '#fef08a', '#bfdbfe', '#bbf7d0', '#fed7aa', '#ddd6fe', '#9ca3af', 'none']);

const STICKY_COLORS = [
  { fill: '#FEF08A', stroke: '#EAB308' },
  { fill: '#BFDBFE', stroke: '#3B82F6' },
  { fill: '#BBF7D0', stroke: '#22C55E' },
  { fill: '#FBCFE8', stroke: '#EC4899' },
  { fill: '#FED7AA', stroke: '#F97316' },
];

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function getGradientVector(angleDeg) {
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const x1 = Math.round((0.5 - 0.5 * Math.cos(rad)) * 100);
  const y1 = Math.round((0.5 - 0.5 * Math.sin(rad)) * 100);
  const x2 = Math.round((0.5 + 0.5 * Math.cos(rad)) * 100);
  const y2 = Math.round((0.5 + 0.5 * Math.sin(rad)) * 100);
  return { x1: `${x1}%`, y1: `${y1}%`, x2: `${x2}%`, y2: `${y2}%` };
}

function getStrokeDashArray(style, strokeWidth) {
  const w = Math.max(1, Number(strokeWidth) || 2);
  if (style === 'dashed') return `${w * 3.2},${w * 2}`;
  if (style === 'dotted') return `${w},${w * 2}`;
  return '';
}

export function createBoardCanvas({
  viewportEl,
  stageEl,
  layerEl,
  miniBarEl,
  onMutate,
  onZoomChange,
  onItemCountChange,
} = {}) {
  let shapes = [];
  let selectedIds = new Set();
  let clipboard = [];
  let undoStack = [];
  let redoStack = [];

  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let spaceHeld = false;
  let panToolActive = false;
  let marqueeMode = false;
  let drawTool = null;
  let drawColor = '#1a1a1a';
  let drawSize = 'sm';
  let drawTip = 'round';
  let snapToGrid = false;
  let gridSize = 24;
  let minimapEnabled = true;
  let alignGuidesEnabled = true;
  let miniBarOpen = false;
  let copiedFormat = null;
  let dragOp = null;
  let activeAlignGuides = [];
  let activeSnapPoint = null;
  let stickyIdx = 0;

  const fillDropdownEl = document.getElementById('shape-fill-dropdown');
  const fillBtnEl = document.getElementById('btn-shape-fill');
  const fillPopoverEl = document.getElementById('shape-fill-popover');
  const fillGridEl = document.getElementById('shape-fill-grid');
  const fillIndicatorEl = document.getElementById('shape-fill-indicator');
  const borderBtnEl = document.getElementById('btn-shape-border');
  const borderPopoverEl = document.getElementById('shape-border-popover');
  const borderGridEl = document.getElementById('shape-border-grid');
  const borderIndicatorEl = document.getElementById('shape-border-indicator');
  const effectsBtnEl = document.getElementById('btn-shape-effects');
  const effectsPopoverEl = document.getElementById('shape-effects-popover');
  const opacityRangeEl = document.getElementById('shape-opacity-range');
  const opacityValueEl = document.getElementById('shape-opacity-value');
  const gradientSectionEl = document.getElementById('shape-gradient-section');
  const gradStartInputEl = document.getElementById('shape-grad-start');
  const gradEndInputEl = document.getElementById('shape-grad-end');
  const alignBtnEl = document.getElementById('btn-shape-align');
  const alignPopoverEl = document.getElementById('shape-align-popover');
  const cornersDropdownEl = document.getElementById('shape-corners-dropdown');
  const cornersBtnEl = document.getElementById('btn-shape-corners');
  const cornersPopoverEl = document.getElementById('shape-corners-popover');
  const endsDropdownEl = document.getElementById('shape-ends-dropdown');
  const endsBtnEl = document.getElementById('btn-shape-ends');
  const endsPopoverEl = document.getElementById('shape-ends-popover');
  const textCheckboxEl = document.getElementById('chk-shape-text');

  const groupBtnEl = document.getElementById('btn-shape-group');
  const ungroupBtnEl = document.getElementById('btn-shape-ungroup');
  const arrangeOrderBtns = Array.from(document.querySelectorAll('[data-arrange-order]'));
  const marqueeBtnEl = document.getElementById('btn-shape-marquee');
  const panBtnEl = document.getElementById('btn-board-pan');
  const penBtnEl = document.getElementById('btn-board-pen');
  const highlighterBtnEl = document.getElementById('btn-board-highlighter');
  const eraserBtnEl = document.getElementById('btn-board-eraser');
  const drawOptionsBarEl = document.getElementById('draw-options-bar');
  const drawTipOptionsEl = document.getElementById('draw-tip-options');
  const minimapEl = document.getElementById('board-minimap');
  const canvasMenuEl = document.getElementById('canvas-context-menu');
  const fontFamilyEl = document.getElementById('shape-font-family');
  const fontSizeEl = document.getElementById('shape-font-size');
  const boldBtnEl = document.getElementById('btn-shape-bold');
  const textColorEl = document.getElementById('shape-text-color');
  const lockBtnEl = document.getElementById('btn-shape-lock');
  const undoBtnEl = document.getElementById('btn-undo');
  const redoBtnEl = document.getElementById('btn-redo');
  const copyBtnEl = document.getElementById('btn-board-copy');
  const pasteBtnEl = document.getElementById('btn-board-paste');
  const duplicateBtnEl = document.getElementById('btn-board-duplicate');
  const deleteBtnEl = document.getElementById('btn-board-delete');
  const formatPainterBtnEl = document.getElementById('btn-format-painter');
  const miniFormatPainterBtnEl = document.getElementById('btn-mini-format-painter');
  const miniDuplicateBtnEl = document.getElementById('btn-mini-duplicate');
  const miniDeleteBtnEl = document.getElementById('btn-mini-delete');

  function setDrawTool(nextTool) {
    drawTool = drawTool === nextTool ? null : nextTool;
    penBtnEl?.classList.toggle('is-active', drawTool === 'pen');
    penBtnEl?.setAttribute('aria-pressed', String(drawTool === 'pen'));
    highlighterBtnEl?.classList.toggle('is-active', drawTool === 'highlighter');
    highlighterBtnEl?.setAttribute('aria-pressed', String(drawTool === 'highlighter'));
    eraserBtnEl?.classList.toggle('is-active', drawTool === 'eraser');
    eraserBtnEl?.setAttribute('aria-pressed', String(drawTool === 'eraser'));
    viewportEl?.classList.toggle('is-draw-tool', drawTool === 'pen' || drawTool === 'highlighter');
    viewportEl?.classList.toggle('is-eraser-tool', drawTool === 'eraser');
    drawOptionsBarEl?.classList.toggle('is-visible', drawTool === 'pen' || drawTool === 'highlighter');
    drawTipOptionsEl?.classList.toggle('is-hidden', drawTool !== 'pen');
    if (drawTool && panToolActive) {
      panToolActive = false;
      panBtnEl?.classList.remove('is-active');
      panBtnEl?.setAttribute('aria-pressed', 'false');
      viewportEl?.classList.remove('is-pan-tool');
    }
  }

  function getDrawStrokeWidth(tool) {
    if (tool === 'highlighter') return drawSize === 'lg' ? 26 : drawSize === 'md' ? 20 : 16;
    return drawSize === 'lg' ? 8 : drawSize === 'md' ? 5 : 3;
  }

  function buildLinePath(curve, x1, y1, x2, y2) {
    if (curve === 'curved') {
      const mx = (x1 + x2) / 2;
      return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    }
    if (curve === 'elbow') {
      const mx = (x1 + x2) / 2;
      return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  function snapCoord(val, altKey) {
    if (!snapToGrid || altKey) return Math.round(val);
    return Math.round(val / gridSize) * gridSize;
  }

  function buildSmoothPath(points, w, h) {
    if (!Array.isArray(points) || points.length === 0) return '';
    if (points.length === 1) {
      const px = (points[0].x * w).toFixed(1);
      const py = (points[0].y * h).toFixed(1);
      return `M ${px} ${py} L ${px} ${py}`;
    }
    const pts = points.map((p) => ({ x: p.x * w, y: p.y * h }));
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(1);
      const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(1);
      d += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx} ${my}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    return d;
  }

  function snapshot() {
    return JSON.stringify(shapes);
  }

  function recordUndo(prevSnap) {
    const nextSnap = snapshot();
    if (prevSnap !== nextSnap) {
      undoStack.push(prevSnap);
      if (undoStack.length > 80) undoStack.shift();
      redoStack = [];
      updateUndoRedoButtons();
    }
  }

  function updateUndoRedoButtons() {
    if (undoBtnEl) undoBtnEl.disabled = undoStack.length === 0;
    if (redoBtnEl) redoBtnEl.disabled = redoStack.length === 0;
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(snapshot());
    shapes = JSON.parse(undoStack.pop());
    selectedIds.clear();
    updateUndoRedoButtons();
    hideMiniBar();
    render();
    onMutate?.();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(snapshot());
    shapes = JSON.parse(redoStack.pop());
    selectedIds.clear();
    updateUndoRedoButtons();
    hideMiniBar();
    render();
    onMutate?.();
  }

  function getBoardBounds(targetShapes = shapes) {
    if (!targetShapes || targetShapes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    targetShapes.forEach((s) => {
      const sx1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.x1, s.x2) : s.x;
      const sy1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.y1, s.y2) : s.y;
      const sx2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.x1, s.x2) : s.x + s.w;
      const sy2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.y1, s.y2) : s.y + s.h;
      minX = Math.min(minX, sx1);
      minY = Math.min(minY, sy1);
      maxX = Math.max(maxX, sx2);
      maxY = Math.max(maxY, sy2);
    });
    return { minX, minY, maxX, maxY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  function renderMinimap() {
    if (!minimapEl || !viewportEl) return;
    minimapEl.classList.toggle('is-hidden', !minimapEnabled);
    if (!minimapEnabled) return;
    const ctx = minimapEl.getContext('2d');
    if (!ctx) return;
    const cw = minimapEl.width;
    const ch = minimapEl.height;
    ctx.clearRect(0, 0, cw, ch);

    const rect = viewportEl.getBoundingClientRect();
    const viewWorld = {
      minX: -panX / zoom,
      minY: -panY / zoom,
      maxX: (rect.width - panX) / zoom,
      maxY: (rect.height - panY) / zoom,
    };
    const b = getBoardBounds(shapes);
    const minX = b ? Math.min(b.minX, viewWorld.minX) - 40 : viewWorld.minX - 40;
    const minY = b ? Math.min(b.minY, viewWorld.minY) - 40 : viewWorld.minY - 40;
    const maxX = b ? Math.max(b.maxX, viewWorld.maxX) + 40 : viewWorld.maxX + 40;
    const maxY = b ? Math.max(b.maxY, viewWorld.maxY) + 40 : viewWorld.maxY + 40;
    const scale = Math.min(cw / Math.max(1, maxX - minX), ch / Math.max(1, maxY - minY));
    const ox = (cw - (maxX - minX) * scale) / 2;
    const oy = (ch - (maxY - minY) * scale) / 2;
    minimapEl._mapTransform = { minX, minY, scale, ox, oy };

    shapes.forEach((s) => {
      if (s.type === 'line' || s.type === 'arrow') {
        ctx.strokeStyle = s.strokeColor === 'none' ? '#94a3b8' : s.strokeColor || '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ox + (s.x1 - minX) * scale, oy + (s.y1 - minY) * scale);
        ctx.lineTo(ox + (s.x2 - minX) * scale, oy + (s.y2 - minY) * scale);
        ctx.stroke();
      } else {
        const x = ox + (s.x - minX) * scale;
        const y = oy + (s.y - minY) * scale;
        const w = Math.max(2, s.w * scale);
        const h = Math.max(2, s.h * scale);
        if (s.type === 'frame') {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
        } else {
          ctx.fillStyle = s.fillColor && s.fillColor !== 'none' ? s.fillColor : '#cbd5e1';
          ctx.fillRect(x, y, w, h);
        }
      }
    });

    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
    ctx.lineWidth = 1.5;
    const vx = ox + (viewWorld.minX - minX) * scale;
    const vy = oy + (viewWorld.minY - minY) * scale;
    const vw = (viewWorld.maxX - viewWorld.minX) * scale;
    const vh = (viewWorld.maxY - viewWorld.minY) * scale;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);
  }

  function fitToShapes(targetShapes = shapes) {
    if (!viewportEl) return;
    const b = getBoardBounds(targetShapes);
    if (!b) {
      panX = 0;
      panY = 0;
      setZoomPercent(100, { notify: true });
      return;
    }
    const rect = viewportEl.getBoundingClientRect();
    const pad = 48;
    const nextZoom = Math.min(3, Math.max(0.25, Math.min((rect.width - pad * 2) / b.w, (rect.height - pad * 2) / b.h)));
    zoom = nextZoom;
    panX = Math.round(rect.width / 2 - (b.minX + b.w / 2) * zoom);
    panY = Math.round(rect.height / 2 - (b.minY + b.h / 2) * zoom);
    applyViewportTransform();
    positionMiniBar();
    onZoomChange?.(Math.round(zoom * 100));
  }

  function applyViewportTransform() {
    if (stageEl) {
      stageEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    }
    if (viewportEl) {
      viewportEl.style.backgroundPosition = `${panX}px ${panY}px`;
      const gridStep = Math.max(6, Math.round(gridSize * zoom));
      viewportEl.style.backgroundSize = `${gridStep}px ${gridStep}px`;
    }
    renderMinimap();
  }

  function setZoomPercent(percent, { notify = false } = {}) {
    const clamped = Math.min(300, Math.max(25, Math.round(Number(percent) || 100)));
    const nextZoom = clamped / 100;
    if (viewportEl) {
      const rect = viewportEl.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const worldX = (cx - panX) / zoom;
      const worldY = (cy - panY) / zoom;
      zoom = nextZoom;
      panX = Math.round(cx - worldX * zoom);
      panY = Math.round(cy - worldY * zoom);
    } else {
      zoom = nextZoom;
    }
    applyViewportTransform();
    positionMiniBar();
    if (notify) onZoomChange?.(clamped);
  }

  function screenToWorld(clientX, clientY) {
    const rect = viewportEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    };
  }

  function getSelectedShapes() {
    return shapes.filter((s) => selectedIds.has(s.id));
  }

  function getGroupMemberIds(id) {
    const target = shapes.find((s) => s.id === id);
    if (!target) return [];
    if (!target.groupId) return [id];
    return shapes.filter((s) => s.groupId === target.groupId).map((s) => s.id);
  }

  function closePopovers() {
    [
      fillPopoverEl,
      borderPopoverEl,
      effectsPopoverEl,
      alignPopoverEl,
      cornersPopoverEl,
      endsPopoverEl,
    ].forEach((p) => p?.classList.remove('is-open'));
  }

  function hideMiniBar() {
    miniBarOpen = false;
    closePopovers();
    miniBarEl?.classList.remove('is-visible');
    if (groupBtnEl) groupBtnEl.disabled = true;
    if (ungroupBtnEl) ungroupBtnEl.disabled = true;
    if (copyBtnEl) copyBtnEl.disabled = true;
    if (duplicateBtnEl) duplicateBtnEl.disabled = true;
    if (deleteBtnEl) deleteBtnEl.disabled = true;
    if (formatPainterBtnEl && !copiedFormat) formatPainterBtnEl.disabled = true;
    if (pasteBtnEl) pasteBtnEl.disabled = clipboard.length === 0;
    arrangeOrderBtns.forEach((b) => {
      b.disabled = true;
    });
  }

  function updateIndicators(shape) {
    if (!shape) return;
    const selected = getSelectedShapes();
    const isLineOnly = selected.every((s) => s.type === 'line' || s.type === 'arrow');
    const hasFillable = selected.some(
      (s) => s.type !== 'line' && s.type !== 'arrow' && s.type !== 'image'
    );

    if (fillDropdownEl) fillDropdownEl.classList.toggle('is-hidden', !hasFillable);
    if (endsDropdownEl) endsDropdownEl.classList.toggle('is-hidden', !isLineOnly);
    if (cornersDropdownEl) {
      cornersDropdownEl.classList.toggle(
        'is-hidden',
        !selected.some((s) => s.type === 'rect' || s.type === 'image')
      );
    }

    if (fillIndicatorEl) {
      fillIndicatorEl.style.backgroundColor =
        shape.fillColor === 'none' ? 'transparent' : shape.fillColor || '#ffffff';
    }
    if (borderIndicatorEl) {
      borderIndicatorEl.style.backgroundColor =
        shape.strokeColor === 'none' ? 'transparent' : shape.strokeColor || '#1a1a1a';
    }
    if (textCheckboxEl) {
      const canToggleText = selected.some(
        (s) => !['text', 'frame', 'image', 'line', 'arrow', 'freehand'].includes(s.type)
      );
      textCheckboxEl.closest('.shape-text-toggle')?.classList.toggle('is-hidden', !canToggleText);
      textCheckboxEl.checked = Boolean(shape.textEnabled || shape.label);
    }
    if (fontFamilyEl) fontFamilyEl.value = shape.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    if (fontSizeEl) fontSizeEl.value = String(shape.fontSize || (shape.type === 'text' ? 14 : 13));
    if (boldBtnEl) {
      const isBold = shape.fontWeight === '700' || shape.fontWeight === 'bold';
      boldBtnEl.classList.toggle('is-active', isBold);
      boldBtnEl.setAttribute('aria-pressed', String(isBold));
    }
    if (textColorEl) textColorEl.value = shape.textColor || '#1a1a1a';
    const activeTextAlign = shape.textAlign || (shape.type === 'text' ? 'left' : 'center');
    miniBarEl?.querySelectorAll('[data-shape-text-align]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.shapeTextAlign === activeTextAlign);
    });
    const activeTextVAlign = shape.textVAlign || (shape.type === 'text' ? 'top' : 'middle');
    miniBarEl?.querySelectorAll('[data-shape-text-valign]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.shapeTextValign === activeTextVAlign);
    });
    if (lockBtnEl) {
      const isLocked = selected.some((s) => Boolean(s.locked));
      lockBtnEl.classList.toggle('is-active', isLocked);
      lockBtnEl.setAttribute('aria-pressed', String(isLocked));
    }
    endsPopoverEl?.querySelectorAll('[data-line-curve]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lineCurve === (shape.lineCurve || 'straight'));
    });

    const pct = Math.round((shape.opacity ?? 1) * 100);
    if (opacityRangeEl) opacityRangeEl.value = String(pct);
    if (opacityValueEl) opacityValueEl.textContent = `${pct}%`;
    effectsPopoverEl?.querySelectorAll('[data-shape-opacity]').forEach((btn) => {
      btn.classList.toggle('is-active', Math.round(Number(btn.dataset.shapeOpacity) * 100) === pct);
    });
    const activeShadow = shape.shadow || 'none';
    effectsPopoverEl?.querySelectorAll('[data-shape-shadow]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.shapeShadow === activeShadow);
    });
    if (gradientSectionEl) gradientSectionEl.classList.toggle('is-hidden', !hasFillable);
    if (hasFillable) {
      if (gradStartInputEl && shape.gradientStart) gradStartInputEl.value = shape.gradientStart;
      if (gradEndInputEl && shape.gradientEnd) gradEndInputEl.value = shape.gradientEnd;
      const activeAngle = String(shape.gradientAngle ?? 135);
      effectsPopoverEl?.querySelectorAll('[data-grad-angle]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.gradAngle === activeAngle);
      });
      document
        .getElementById('btn-shape-grad-clear')
        ?.classList.toggle('is-active', shape.fillType !== 'gradient');
    }

    if (groupBtnEl) {
      const allSameGroup =
        selected.length >= 2 &&
        Boolean(selected[0].groupId) &&
        selected.every((s) => s.groupId === selected[0].groupId);
      groupBtnEl.disabled = !(selected.length >= 2 && !allSameGroup);
    }
    if (ungroupBtnEl) {
      ungroupBtnEl.disabled = !selected.some((s) => Boolean(s.groupId));
    }
    if (copyBtnEl) copyBtnEl.disabled = selected.length === 0;
    if (duplicateBtnEl) duplicateBtnEl.disabled = selected.length === 0;
    if (deleteBtnEl) deleteBtnEl.disabled = selected.length === 0;
    if (formatPainterBtnEl) formatPainterBtnEl.disabled = selected.length === 0 && !copiedFormat;
    if (pasteBtnEl) pasteBtnEl.disabled = clipboard.length === 0;
    arrangeOrderBtns.forEach((b) => {
      b.disabled = selected.length === 0;
    });
  }

  let canvasMenuWorldPt = null;

  function closeCanvasMenu() {
    canvasMenuEl?.classList.remove('is-open');
  }

  function openCanvasMenuAt(clientX, clientY) {
    if (!canvasMenuEl || !viewportEl) return;
    canvasMenuWorldPt = screenToWorld(clientX, clientY);
    const pasteItem = canvasMenuEl.querySelector('[data-canvas-action="paste"]');
    if (pasteItem) pasteItem.disabled = clipboard.length === 0;
    canvasMenuEl.classList.add('is-open');
    const rect = viewportEl.getBoundingClientRect();
    const maxW = Math.max(8, viewportEl.clientWidth - canvasMenuEl.offsetWidth - 8);
    const maxH = Math.max(8, viewportEl.clientHeight - canvasMenuEl.offsetHeight - 8);
    canvasMenuEl.style.left = `${Math.max(8, Math.min(maxW, clientX - rect.left))}px`;
    canvasMenuEl.style.top = `${Math.max(8, Math.min(maxH, clientY - rect.top))}px`;
  }

  function openMiniBarAt(clientX, clientY) {
    if (!miniBarEl || !viewportEl) return;
    const selected = getSelectedShapes();
    if (selected.length === 0) return;
    miniBarOpen = true;
    updateIndicators(selected[0]);
    const rect = viewportEl.getBoundingClientRect();
    const maxW = Math.max(24, viewportEl.clientWidth - 280);
    const maxH = Math.max(24, viewportEl.clientHeight - 56);
    miniBarEl.style.left = `${Math.max(8, Math.min(maxW, clientX - rect.left))}px`;
    miniBarEl.style.top = `${Math.max(8, Math.min(maxH, clientY - rect.top))}px`;
    miniBarEl.classList.add('is-visible');
  }

  function positionMiniBar() {
    if (!miniBarEl || !viewportEl) return;
    const selected = getSelectedShapes();
    if (selected.length === 0) {
      hideMiniBar();
      return;
    }
    updateIndicators(selected[0]);
    if (!miniBarOpen) return;
    miniBarEl.classList.add('is-visible');
  }

  function selectShape(id, { toggle = false } = {}) {
    if (!id) {
      selectedIds.clear();
    } else if (toggle) {
      const members = getGroupMemberIds(id);
      if (selectedIds.has(id)) members.forEach((m) => selectedIds.delete(m));
      else members.forEach((m) => selectedIds.add(m));
    } else {
      selectedIds = new Set(getGroupMemberIds(id));
    }
    render();
    positionMiniBar();
  }

  function buildPolygonPoints(shape) {
    const w = shape.w;
    const h = shape.h;
    if (shape.type === 'triangle') return `${w / 2},2 ${w - 2},${h - 2} 2,${h - 2}`;
    if (shape.type === 'diamond') return `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`;
    if (shape.type === 'parallelogram') {
      const skew = Math.min(24, w * 0.18);
      return `${skew},2 ${w - 2},2 ${w - skew},${h - 2} 2,${h - 2}`;
    }
    if (shape.type === 'hexagon') {
      return `${w * 0.25},2 ${w * 0.75},2 ${w - 2},${h / 2} ${w * 0.75},${h - 2} ${w * 0.25},${h - 2} 2,${h / 2}`;
    }
    if (shape.type === 'star') {
      const pts = [];
      const cx = w / 2;
      const cy = h / 2;
      const rx = w / 2 - 2;
      const ry = h / 2 - 2;
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? 1 : 0.42;
        const a = (-90 + i * 36) * (Math.PI / 180);
        pts.push(`${(cx + rx * r * Math.cos(a)).toFixed(1)},${(cy + ry * r * Math.sin(a)).toFixed(1)}`);
      }
      return pts.join(' ');
    }
    return '';
  }

  function buildFlowchartPaths(shape) {
    const w = shape.w;
    const h = shape.h;
    if (shape.type === 'document') {
      const waveY = h - Math.max(10, h * 0.16);
      return [
        `M 2 2 L ${w - 2} 2 L ${w - 2} ${waveY} Q ${w * 0.75} ${waveY - 12} ${w * 0.5} ${waveY} T 2 ${waveY} Z`,
      ];
    }
    if (shape.type === 'database') {
      const ry = Math.min(16, Math.max(8, h * 0.14));
      return [
        `M 2 ${ry + 2} A ${(w - 4) / 2} ${ry} 0 0 1 ${w - 2} ${ry + 2} L ${w - 2} ${h - ry - 2} A ${(w - 4) / 2} ${ry} 0 0 1 2 ${h - ry - 2} Z`,
        `M 2 ${ry + 2} A ${(w - 4) / 2} ${ry} 0 0 0 ${w - 2} ${ry + 2}`,
      ];
    }
    if (shape.type === 'cloud') {
      return [
        `M ${w * 0.25} ${h * 0.78} ` +
          `C ${w * 0.08} ${h * 0.78}, ${w * 0.04} ${h * 0.56}, ${w * 0.16} ${h * 0.45} ` +
          `C ${w * 0.14} ${h * 0.22}, ${w * 0.34} ${h * 0.1}, ${w * 0.5} ${h * 0.2} ` +
          `C ${w * 0.62} ${h * 0.08}, ${w * 0.84} ${h * 0.18}, ${w * 0.82} ${h * 0.42} ` +
          `C ${w * 0.96} ${h * 0.48}, ${w * 0.94} ${h * 0.78}, ${w * 0.76} ${h * 0.78} Z`,
      ];
    }
    return [];
  }

  function getShapeBoxAnchors(shape) {
    return [
      { dir: 'n', x: shape.x + shape.w / 2, y: shape.y },
      { dir: 'e', x: shape.x + shape.w, y: shape.y + shape.h / 2 },
      { dir: 's', x: shape.x + shape.w / 2, y: shape.y + shape.h },
      { dir: 'w', x: shape.x, y: shape.y + shape.h / 2 },
    ];
  }

  function findSnapAnchor(wx, wy, threshold = 14) {
    let best = null;
    let bestDist = threshold;
    for (const s of shapes) {
      if (s.type === 'line' || s.type === 'arrow') continue;
      for (const pt of getShapeBoxAnchors(s)) {
        const d = Math.hypot(pt.x - wx, pt.y - wy);
        if (d < bestDist) {
          bestDist = d;
          best = { shapeId: s.id, ...pt };
        }
      }
    }
    return best;
  }

  function syncAttachedLines(movedShape) {
    const anchors = getShapeBoxAnchors(movedShape);
    const map = Object.fromEntries(anchors.map((a) => [a.dir, a]));
    shapes.forEach((s) => {
      if (s.type !== 'line' && s.type !== 'arrow') return;
      if (s.startAnchor?.shapeId === movedShape.id && map[s.startAnchor.dir]) {
        s.x1 = map[s.startAnchor.dir].x;
        s.y1 = map[s.startAnchor.dir].y;
      }
      if (s.endAnchor?.shapeId === movedShape.id && map[s.endAnchor.dir]) {
        s.x2 = map[s.endAnchor.dir].x;
        s.y2 = map[s.endAnchor.dir].y;
      }
    });
  }

  function isShapeInsideFrame(shape, frame) {
    if (shape.id === frame.id) return false;
    const isLine = shape.type === 'line' || shape.type === 'arrow';
    const cx = isLine ? (shape.x1 + shape.x2) / 2 : shape.x + shape.w / 2;
    const cy = isLine ? (shape.y1 + shape.y2) / 2 : shape.y + shape.h / 2;
    return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
  }

  /** Returns seedShapes plus any shapes whose center falls inside a seed frame (preserving z-order). */
  function expandWithFrameContents(seedShapes) {
    const included = new Set(seedShapes.map((s) => s.id));
    const queue = seedShapes.filter((s) => s.type === 'frame');
    while (queue.length > 0) {
      const frame = queue.shift();
      for (const s of shapes) {
        if (included.has(s.id)) continue;
        if (isShapeInsideFrame(s, frame)) {
          included.add(s.id);
          if (s.type === 'frame') queue.push(s);
        }
      }
    }
    return shapes.filter((s) => included.has(s.id));
  }

  function snapBoxToPeers(shape, rawX, rawY, threshold = 8, excludeIds = selectedIds) {
    if (!alignGuidesEnabled) return { x: rawX, y: rawY, guides: [] };
    const guides = [];
    let bestX = rawX;
    let bestY = rawY;
    let minDx = threshold;
    let minDy = threshold;

    const myXs = [
      { val: rawX, offset: 0 },
      { val: rawX + shape.w / 2, offset: shape.w / 2 },
      { val: rawX + shape.w, offset: shape.w },
    ];
    const myYs = [
      { val: rawY, offset: 0 },
      { val: rawY + shape.h / 2, offset: shape.h / 2 },
      { val: rawY + shape.h, offset: shape.h },
    ];

    for (const peer of shapes) {
      if (peer.id === shape.id || excludeIds.has(peer.id) || peer.type === 'line' || peer.type === 'arrow') continue;
      const peerXs = [peer.x, peer.x + peer.w / 2, peer.x + peer.w];
      const peerYs = [peer.y, peer.y + peer.h / 2, peer.y + peer.h];

      for (const mx of myXs) {
        for (const px of peerXs) {
          const d = Math.abs(mx.val - px);
          if (d < minDx) {
            minDx = d;
            bestX = px - mx.offset;
            guides[0] = {
              axis: 'x',
              pos: px,
              start: Math.min(rawY, peer.y) - 20,
              end: Math.max(rawY + shape.h, peer.y + peer.h) + 20,
            };
          }
        }
      }
      for (const my of myYs) {
        for (const py of peerYs) {
          const d = Math.abs(my.val - py);
          if (d < minDy) {
            minDy = d;
            bestY = py - my.offset;
            guides[1] = {
              axis: 'y',
              pos: py,
              start: Math.min(rawX, peer.x) - 20,
              end: Math.max(rawX + shape.w, peer.x + peer.w) + 20,
            };
          }
        }
      }
    }
    return { x: bestX, y: bestY, guides: guides.filter(Boolean) };
  }

  function openShapeTextEditor(shape, el) {
    const prev = snapshot();
    const labelEl = el.querySelector('.word-shape-label') || (() => {
      shape.textEnabled = true;
      const div = document.createElement('div');
      div.className = 'word-shape-label';
      el.appendChild(div);
      return div;
    })();
    labelEl.classList.add('is-editing');
    labelEl.contentEditable = 'true';
    labelEl.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(labelEl);
    sel.removeAllRanges();
    sel.addRange(range);

    let committed = false;
    const onInput = () => {
      shape.label = labelEl.innerText.trim();
      if (shape.label || shape.isSticky || shape.type === 'text') shape.textEnabled = true;
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
        e.preventDefault();
        labelEl.blur();
      }
    };
    const commit = () => {
      if (committed) return;
      committed = true;
      labelEl.removeEventListener('input', onInput);
      labelEl.removeEventListener('keydown', onKeyDown);
      labelEl.removeEventListener('blur', commit);
      labelEl.classList.remove('is-editing');
      labelEl.contentEditable = 'false';
      shape.label = labelEl.innerText.trim();
      if (shape.label || shape.isSticky || shape.type === 'text') shape.textEnabled = true;
      recordUndo(prev);
      onMutate?.();
    };
    labelEl.addEventListener('input', onInput);
    labelEl.addEventListener('keydown', onKeyDown);
    labelEl.addEventListener('blur', commit);
  }

  function render() {
    if (!layerEl) return;
    layerEl.innerHTML = '';

    shapes.forEach((shape) => {
      const isSelected = selectedIds.has(shape.id);
      const isSingleSelected = isSelected && selectedIds.size === 1;
      const shadowClass = shape.shadow && shape.shadow !== 'none' ? ` has-shadow-${shape.shadow}` : '';

      if (shape.type === 'line' || shape.type === 'arrow') {
        const minX = Math.min(shape.x1, shape.x2) - 16;
        const minY = Math.min(shape.y1, shape.y2) - 16;
        const width = Math.max(32, Math.abs(shape.x2 - shape.x1) + 32);
        const height = Math.max(32, Math.abs(shape.y2 - shape.y1) + 32);
        const lx1 = shape.x1 - minX;
        const ly1 = shape.y1 - minY;
        const lx2 = shape.x2 - minX;
        const ly2 = shape.y2 - minY;
        const stroke = shape.strokeColor === 'none' ? 'transparent' : shape.strokeColor || '#1a1a1a';
        const strokeWidth = shape.strokeWidth || 2.5;

        const el = document.createElement('div');
        el.className = `word-shape word-shape-line${shadowClass}${isSelected ? ' is-selected' : ''}${shape.locked ? ' is-locked' : ''}`;
        el.dataset.shapeId = shape.id;
        el.style.left = `${minX}px`;
        el.style.top = `${minY}px`;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        if (typeof shape.opacity === 'number' && shape.opacity < 1) el.style.opacity = String(shape.opacity);

        const svg = createSvgEl('svg', { class: 'word-shape-svg', viewBox: `0 0 ${width} ${height}`, width, height });
        const defs = createSvgEl('defs');
        const startMarkerId = `start-${shape.id}`;
        const endMarkerId = `end-${shape.id}`;
        const hasStartArrow = shape.startMarker === 'arrow';
        const hasEndArrow = (shape.endMarker || (shape.type === 'arrow' ? 'arrow' : 'none')) === 'arrow';
        const addArrowMarker = (id) => {
          const m = createSvgEl('marker', {
            id,
            viewBox: '0 0 10 10',
            refX: '8',
            refY: '5',
            markerWidth: '6',
            markerHeight: '6',
            orient: 'auto-start-reverse',
          });
          m.appendChild(createSvgEl('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: stroke }));
          defs.appendChild(m);
        };
        if (hasStartArrow) addArrowMarker(startMarkerId);
        if (hasEndArrow) addArrowMarker(endMarkerId);
        svg.appendChild(defs);

        const dPath = buildLinePath(shape.lineCurve || 'straight', lx1, ly1, lx2, ly2);
        const lineAttrs = {
          d: dPath,
          fill: 'none',
          stroke,
          'stroke-width': strokeWidth,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        };
        const dash = getStrokeDashArray(shape.strokeStyle, strokeWidth);
        if (dash) lineAttrs['stroke-dasharray'] = dash;
        if (hasStartArrow) lineAttrs['marker-start'] = `url(#${startMarkerId})`;
        if (hasEndArrow) lineAttrs['marker-end'] = `url(#${endMarkerId})`;
        svg.appendChild(createSvgEl('path', lineAttrs));

        const hit = createSvgEl('path', {
          class: 'word-shape-hit',
          d: dPath,
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': '16',
        });
        svg.appendChild(hit);
        el.appendChild(svg);

        if (shape.label) {
          const lineLabel = document.createElement('div');
          lineLabel.className = 'word-shape-line-label';
          lineLabel.textContent = shape.label;
          lineLabel.style.left = `${(lx1 + lx2) / 2}px`;
          lineLabel.style.top = `${(ly1 + ly2) / 2}px`;
          el.appendChild(lineLabel);
        }

        if (isSingleSelected) {
          ['start', 'end'].forEach((end) => {
            const h = document.createElement('div');
            h.className = 'shape-handle shape-endpoint';
            h.dataset.handle = end;
            h.style.left = `${end === 'start' ? lx1 : lx2}px`;
            h.style.top = `${end === 'start' ? ly1 : ly2}px`;
            el.appendChild(h);
          });
        }
        layerEl.appendChild(el);
        return;
      }

      const el = document.createElement('div');
      const variantClass = shape.type === 'frame' ? ' word-shape-frame' : shape.type === 'text' ? ' word-shape-text' : '';
      el.className = `word-shape word-shape-box${variantClass}${shadowClass}${isSelected ? ' is-selected' : ''}${shape.locked ? ' is-locked' : ''}`;
      el.dataset.shapeId = shape.id;
      el.style.left = `${shape.x}px`;
      el.style.top = `${shape.y}px`;
      el.style.width = `${shape.w}px`;
      el.style.height = `${shape.h}px`;
      if (shape.rotation) el.style.transform = `rotate(${shape.rotation}deg)`;
      if (typeof shape.opacity === 'number' && shape.opacity < 1) el.style.opacity = String(shape.opacity);

      if (shape.type === 'frame') {
        const titleEl = document.createElement('div');
        titleEl.className = 'word-shape-frame-title';
        titleEl.textContent = shape.label || 'Frame';
        el.appendChild(titleEl);
      } else if (shape.type === 'image') {
        const clipEl = document.createElement('div');
        clipEl.className = 'word-shape-image-clip';
        if (shape.cornerRadius) clipEl.style.borderRadius = `${shape.cornerRadius}px`;
        const img = document.createElement('img');
        img.className = 'word-shape-image';
        img.src = shape.src || '';
        img.alt = shape.alt || 'Image';
        img.draggable = false;
        clipEl.appendChild(img);
        el.appendChild(clipEl);
      } else {
        const useGrad = shape.fillType === 'gradient' && shape.gradientStart && shape.gradientEnd;
        const gradId = `shape-grad-${shape.id}`;
        const fill = useGrad ? `url(#${gradId})` : shape.fillColor === 'none' ? 'transparent' : shape.fillColor || '#ffffff';
        const stroke = shape.strokeColor === 'none' ? 'none' : shape.strokeColor || '#1a1a1a';
        const strokeWidth = shape.strokeColor === 'none' ? 0 : shape.strokeWidth || 2;
        const dash = strokeWidth > 0 ? getStrokeDashArray(shape.strokeStyle, strokeWidth) : '';

        const svg = createSvgEl('svg', { class: 'word-shape-svg', viewBox: `0 0 ${shape.w} ${shape.h}`, width: shape.w, height: shape.h });
        if (useGrad) {
          const defs = createSvgEl('defs');
          const grad = createSvgEl('linearGradient', { id: gradId, ...getGradientVector(shape.gradientAngle ?? 135) });
          grad.appendChild(createSvgEl('stop', { offset: '0%', 'stop-color': shape.gradientStart }));
          grad.appendChild(createSvgEl('stop', { offset: '100%', 'stop-color': shape.gradientEnd }));
          defs.appendChild(grad);
          svg.appendChild(defs);
        }

        if (shape.type === 'freehand') {
          const pathAttrs = {
            d: buildSmoothPath(shape.points, shape.w, shape.h),
            fill: 'none',
            stroke,
            'stroke-width': strokeWidth,
            'stroke-linecap': shape.strokeCap || 'round',
            'stroke-linejoin': shape.strokeJoin || 'round',
          };
          if (dash) pathAttrs['stroke-dasharray'] = dash;
          svg.appendChild(createSvgEl('path', pathAttrs));
        } else if (shape.type === 'ellipse') {
          const attrs = {
            cx: shape.w / 2,
            cy: shape.h / 2,
            rx: Math.max(1, shape.w / 2 - 1.5),
            ry: Math.max(1, shape.h / 2 - 1.5),
            fill,
            stroke,
            'stroke-width': strokeWidth,
          };
          if (dash) attrs['stroke-dasharray'] = dash;
          svg.appendChild(createSvgEl('ellipse', attrs));
        } else if (['triangle', 'diamond', 'hexagon', 'star', 'parallelogram'].includes(shape.type)) {
          const attrs = {
            points: buildPolygonPoints(shape),
            fill,
            stroke,
            'stroke-width': strokeWidth,
            'stroke-linejoin': 'round',
          };
          if (dash) attrs['stroke-dasharray'] = dash;
          svg.appendChild(createSvgEl('polygon', attrs));
        } else if (['document', 'database', 'cloud'].includes(shape.type)) {
          const paths = buildFlowchartPaths(shape);
          paths.forEach((d, idx) => {
            const attrs = {
              d,
              fill: idx === 0 ? fill : 'none',
              stroke,
              'stroke-width': strokeWidth,
              'stroke-linejoin': 'round',
            };
            if (dash) attrs['stroke-dasharray'] = dash;
            svg.appendChild(createSvgEl('path', attrs));
          });
        } else {
          const r = shape.type === 'terminator' ? Math.round(Math.min(shape.w, shape.h) / 2) : Number(shape.cornerRadius) || 0;
          const attrs = {
            x: 1,
            y: 1,
            width: Math.max(2, shape.w - 2),
            height: Math.max(2, shape.h - 2),
            rx: r,
            ry: r,
            fill,
            stroke,
            'stroke-width': strokeWidth,
          };
          if (dash) attrs['stroke-dasharray'] = dash;
          svg.appendChild(createSvgEl('rect', attrs));
          if (shape.type === 'subroutine') {
            const inset = Math.min(18, Math.max(10, shape.w * 0.1));
            [inset, shape.w - inset].forEach((lx) => {
              svg.appendChild(
                createSvgEl('line', {
                  x1: lx,
                  y1: 1,
                  x2: lx,
                  y2: Math.max(2, shape.h - 1),
                  stroke,
                  'stroke-width': strokeWidth,
                })
              );
            });
          }
        }
        el.appendChild(svg);
      }

      if (shape.type !== 'frame' && (shape.textEnabled || shape.label)) {
        const labelEl = document.createElement('div');
        labelEl.className = 'word-shape-label';
        labelEl.textContent = shape.label || '';
        const isDarkTheme = document.documentElement.dataset.theme === 'dark';
        const isTransparentFill = shape.fillType !== 'gradient' && shape.fillColor === 'none';
        const isLight = shape.fillType !== 'gradient' && LIGHT_FILLS.has((shape.fillColor || '#ffffff').toLowerCase());
        const autoTextColor = isTransparentFill && isDarkTheme ? '#e5e7eb' : isLight ? '#1a1a1a' : '#ffffff';
        labelEl.style.color = shape.textColor || autoTextColor;
        if (shape.fontFamily) labelEl.style.fontFamily = shape.fontFamily;
        if (shape.fontSize) labelEl.style.fontSize = `${shape.fontSize}px`;
        if (shape.fontWeight) labelEl.style.fontWeight = shape.fontWeight;
        if (shape.textAlign) labelEl.style.textAlign = shape.textAlign;
        if (shape.textVAlign) {
          labelEl.style.justifyContent =
            shape.textVAlign === 'top' ? 'flex-start' : shape.textVAlign === 'bottom' ? 'flex-end' : 'center';
        }
        el.appendChild(labelEl);
      }

      if (!shape.locked && shape.type !== 'frame' && shape.type !== 'freehand') {
        ['n', 'e', 's', 'w'].forEach((dir) => {
          const port = document.createElement('div');
          port.className = `shape-connect-port shape-connect-port-${dir}`;
          port.dataset.portDir = dir;
          el.appendChild(port);
        });
      }

      if (isSingleSelected && !shape.locked) {
        const stem = document.createElement('div');
        stem.className = 'shape-rotate-stem';
        el.appendChild(stem);
        const rot = document.createElement('div');
        rot.className = 'shape-rotate-handle';
        el.appendChild(rot);
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((dir) => {
          const h = document.createElement('div');
          h.className = `shape-handle shape-handle-${dir}`;
          h.dataset.handle = dir;
          el.appendChild(h);
        });
      }
      layerEl.appendChild(el);
    });

    activeAlignGuides.forEach((g) => {
      const guide = document.createElement('div');
      guide.className = `shape-align-guide-${g.axis}`;
      if (g.axis === 'x') {
        guide.style.left = `${g.pos}px`;
        guide.style.top = `${g.start}px`;
        guide.style.height = `${Math.max(10, g.end - g.start)}px`;
      } else {
        guide.style.top = `${g.pos}px`;
        guide.style.left = `${g.start}px`;
        guide.style.width = `${Math.max(10, g.end - g.start)}px`;
      }
      layerEl.appendChild(guide);
    });

    if (activeSnapPoint) {
      const dot = document.createElement('div');
      dot.className = 'shape-snap-dot is-active';
      dot.style.left = `${activeSnapPoint.x}px`;
      dot.style.top = `${activeSnapPoint.y}px`;
      layerEl.appendChild(dot);
    }

    onItemCountChange?.(shapes.length);
    renderMinimap();
  }

  function insertShape(type, atWorldPt = null) {
    const prev = snapshot();
    const id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const rect = viewportEl?.getBoundingClientRect() || { width: 800, height: 600 };
    const activeFrame = !atWorldPt && type !== 'frame' ? getSelectedShapes().find((s) => s.type === 'frame') : null;
    const cx = atWorldPt ? atWorldPt.x : activeFrame ? activeFrame.x + activeFrame.w / 2 : (rect.width / 2 - panX) / zoom;
    const cy = atWorldPt ? atWorldPt.y : activeFrame ? activeFrame.y + activeFrame.h / 2 : (rect.height / 2 - panY) / zoom;
    const offset = atWorldPt
      ? 0
      : activeFrame
        ? (shapes.filter((s) => isShapeInsideFrame(s, activeFrame)).length % 5) * 18
        : (shapes.length % 5) * 18;

    if (type === 'frame') {
      shapes.unshift({
        id,
        type: 'frame',
        x: snapCoord(cx - 240 + offset, false),
        y: snapCoord(cy - 160 + offset, false),
        w: 480,
        h: 320,
        label: 'Frame',
        textEnabled: false,
      });
    } else if (type === 'text') {
      shapes.push({
        id,
        type: 'text',
        x: snapCoord(cx - 100 + offset, false),
        y: snapCoord(cy - 28 + offset, false),
        w: 200,
        h: 56,
        fillColor: 'none',
        strokeColor: 'none',
        strokeWidth: 0,
        cornerRadius: 4,
        textEnabled: true,
        label: 'Text',
      });
    } else if (type === 'sticky') {
      const color = STICKY_COLORS[stickyIdx % STICKY_COLORS.length];
      stickyIdx += 1;
      shapes.push({
        id,
        type: 'rect',
        isSticky: true,
        x: snapCoord(cx - 90 + offset, false),
        y: snapCoord(cy - 80 + offset, false),
        w: 180,
        h: 160,
        fillColor: color.fill,
        strokeColor: color.stroke,
        strokeWidth: 1,
        cornerRadius: 6,
        shadow: 'soft',
        textEnabled: true,
        label: 'Note',
      });
    } else if (type === 'line' || type === 'arrow') {
      const defaultStroke = document.documentElement.dataset.theme === 'dark' ? '#ffffff' : '#1a1a1a';
      shapes.push({
        id,
        type,
        strokeColor: defaultStroke,
        strokeWidth: 2.5,
        strokeStyle: 'solid',
        startMarker: 'none',
        endMarker: type === 'arrow' ? 'arrow' : 'none',
        x1: Math.round(cx - 80 + offset),
        y1: Math.round(cy + 20 + offset),
        x2: Math.round(cx + 80 + offset),
        y2: Math.round(cy - 40 + offset),
      });
    } else {
      const resolved = type === 'rounded-rect' ? 'rect' : type;
      shapes.push({
        id,
        type: resolved,
        x: snapCoord(cx - 75 + offset, false),
        y: snapCoord(cy - 50 + offset, false),
        w: type === 'star' || type === 'ellipse' ? 110 : type === 'database' ? 120 : 150,
        h: type === 'star' || type === 'ellipse' ? 110 : type === 'terminator' ? 64 : type === 'database' ? 120 : 100,
        cornerRadius: type === 'rounded-rect' ? 12 : 0,
        fillColor: '#ffffff',
        strokeColor: '#1a1a1a',
        strokeWidth: 2,
        strokeStyle: 'solid',
        textEnabled: false,
        label: '',
      });
    }

    selectedIds = new Set([id]);
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  }

  function insertImage({ src, alt, width, height }) {
    const prev = snapshot();
    const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const rect = viewportEl?.getBoundingClientRect() || { width: 800, height: 600 };
    const cx = (rect.width / 2 - panX) / zoom;
    const cy = (rect.height / 2 - panY) / zoom;
    shapes.push({
      id,
      type: 'image',
      src,
      alt: alt || 'Image',
      x: Math.round(cx - width / 2),
      y: Math.round(cy - height / 2),
      w: width,
      h: height,
      strokeColor: 'none',
      strokeWidth: 0,
    });
    selectedIds = new Set([id]);
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  }

  function buildSwatches(gridEl, onPick) {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    PALETTE.forEach((hex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shape-swatch-btn';
      btn.style.backgroundColor = hex;
      btn.title = hex;
      btn.addEventListener('click', () => onPick(hex));
      gridEl.appendChild(btn);
    });
  }

  buildSwatches(fillGridEl, (hex) => {
    const prev = snapshot();
    getSelectedShapes().forEach((s) => {
      if (s.type !== 'line' && s.type !== 'arrow' && s.type !== 'image') {
        s.fillColor = hex;
        s.fillType = 'solid';
      }
    });
    recordUndo(prev);
    render();
    positionMiniBar();
    closePopovers();
    onMutate?.();
  });

  buildSwatches(borderGridEl, (hex) => {
    const prev = snapshot();
    getSelectedShapes().forEach((s) => {
      s.strokeColor = hex;
    });
    recordUndo(prev);
    render();
    positionMiniBar();
    closePopovers();
    onMutate?.();
  });

  function groupSelected() {
    const selected = getSelectedShapes();
    if (selected.length < 2) return;
    const prev = snapshot();
    const gid = `grp-${Date.now().toString(36)}`;
    selected.forEach((s) => {
      s.groupId = gid;
    });
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  }

  function ungroupSelected() {
    const selected = getSelectedShapes();
    const gids = new Set(selected.map((s) => s.groupId).filter(Boolean));
    if (gids.size === 0) return;
    const prev = snapshot();
    shapes.forEach((s) => {
      if (s.groupId && gids.has(s.groupId)) delete s.groupId;
    });
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  }

  function reorderSelected(direction) {
    if (selectedIds.size === 0) return;
    const prev = snapshot();
    if (direction === 'front') {
      const rest = shapes.filter((s) => !selectedIds.has(s.id));
      const sel = shapes.filter((s) => selectedIds.has(s.id));
      shapes = [...rest, ...sel];
    } else if (direction === 'back') {
      const rest = shapes.filter((s) => !selectedIds.has(s.id));
      const sel = shapes.filter((s) => selectedIds.has(s.id));
      shapes = [...sel, ...rest];
    } else if (direction === 'forward') {
      for (let i = shapes.length - 2; i >= 0; i -= 1) {
        if (selectedIds.has(shapes[i].id) && !selectedIds.has(shapes[i + 1].id)) {
          [shapes[i], shapes[i + 1]] = [shapes[i + 1], shapes[i]];
        }
      }
    } else if (direction === 'backward') {
      for (let i = 1; i < shapes.length; i += 1) {
        if (selectedIds.has(shapes[i].id) && !selectedIds.has(shapes[i - 1].id)) {
          [shapes[i], shapes[i - 1]] = [shapes[i - 1], shapes[i]];
        }
      }
    }
    recordUndo(prev);
    render();
    onMutate?.();
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    const prev = snapshot();
    const toDelete = new Set(
      expandWithFrameContents(getSelectedShapes())
        .filter((s) => !s.locked)
        .map((s) => s.id)
    );
    if (toDelete.size === 0) return;
    shapes = shapes.filter((s) => !toDelete.has(s.id));
    toDelete.forEach((id) => selectedIds.delete(id));
    recordUndo(prev);
    if (selectedIds.size === 0) hideMiniBar();
    render();
    onMutate?.();
  }

  function eraseFreehandAt(wx, wy, radius = 14) {
    let hitAny = false;
    shapes = shapes.filter((s) => {
      if (s.type !== 'freehand' || s.locked) return true;
      if (wx < s.x - radius || wx > s.x + s.w + radius || wy < s.y - radius || wy > s.y + s.h + radius) {
        return true;
      }
      const hit = (s.points || []).some((p) => Math.hypot(s.x + p.x * s.w - wx, s.y + p.y * s.h - wy) <= radius);
      if (hit) hitAny = true;
      return !hit;
    });
    return hitAny;
  }

  // Event bindings
  viewportEl?.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (dragOp || event.ctrlKey) return;
    const shapeEl = event.target.closest('.word-shape');
    if (!shapeEl) {
      hideMiniBar();
      openCanvasMenuAt(event.clientX, event.clientY);
      return;
    }
    closeCanvasMenu();
    const id = shapeEl.dataset.shapeId;
    if (!selectedIds.has(id)) selectShape(id);
    openMiniBarAt(event.clientX, event.clientY);
  });

  viewportEl?.addEventListener('mousedown', (event) => {
    closeCanvasMenu();
    if (event.target?.isContentEditable) return;
    if (document.activeElement?.isContentEditable) {
      document.activeElement.blur();
    }
    if (event.button === 0 && miniBarOpen) {
      miniBarOpen = false;
      closePopovers();
      miniBarEl?.classList.remove('is-visible');
    }
    if (event.button === 1 || spaceHeld || panToolActive) {
      event.preventDefault();
      dragOp = { mode: 'pan', startX: event.clientX, startY: event.clientY, origPanX: panX, origPanY: panY };
      viewportEl.classList.add('is-panning');
      return;
    }
    if (event.button !== 0 && !event.ctrlKey) return;
    if (event.target === minimapEl) return;
    if (drawTool === 'eraser' && event.button === 0) {
      event.preventDefault();
      const worldPt = screenToWorld(event.clientX, event.clientY);
      const prevSnap = snapshot();
      const erased = eraseFreehandAt(worldPt.x, worldPt.y);
      dragOp = { mode: 'erase', prevSnap, erased };
      if (erased) render();
      return;
    }
    if (drawTool && event.button === 0) {
      event.preventDefault();
      const worldPt = screenToWorld(event.clientX, event.clientY);
      dragOp = {
        mode: 'draw',
        tool: drawTool,
        points: [{ x: worldPt.x, y: worldPt.y }],
        prevSnap: snapshot(),
      };
      return;
    }
    const portEl = event.target.closest('.shape-connect-port');
    const rotEl = event.target.closest('.shape-rotate-handle');
    const handleEl = event.target.closest('.shape-handle');
    const shapeEl = event.target.closest('.word-shape');
    if (portEl && shapeEl) {
      event.stopPropagation();
      const source = shapes.find((s) => s.id === shapeEl.dataset.shapeId);
      if (!source || source.locked) return;
      const dir = portEl.dataset.portDir;
      const anchor = getShapeBoxAnchors(source).find((a) => a.dir === dir) || { x: source.x + source.w / 2, y: source.y + source.h / 2 };
      const prevSnap = snapshot();
      const id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const defaultStroke = document.documentElement.dataset.theme === 'dark' ? '#ffffff' : '#1a1a1a';
      const arrow = {
        id,
        type: 'arrow',
        strokeColor: defaultStroke,
        strokeWidth: 2.5,
        strokeStyle: 'solid',
        startMarker: 'none',
        endMarker: 'arrow',
        x1: Math.round(anchor.x),
        y1: Math.round(anchor.y),
        x2: Math.round(anchor.x),
        y2: Math.round(anchor.y),
        startAnchor: { shapeId: source.id, dir },
        endAnchor: null,
      };
      shapes.push(arrow);
      selectedIds = new Set([id]);
      dragOp = { mode: 'connect', shape: arrow, prevSnap };
      render();
      return;
    }
    if (rotEl && shapeEl) {
      event.stopPropagation();
      const shape = shapes.find((s) => s.id === shapeEl.dataset.shapeId);
      if (!shape || shape.locked) return;
      dragOp = { mode: 'rotate', shape, prevSnap: snapshot() };
      return;
    }
    if (handleEl && shapeEl) {
      event.stopPropagation();
      const shape = shapes.find((s) => s.id === shapeEl.dataset.shapeId);
      if (!shape || shape.locked) return;
      const worldPt = screenToWorld(event.clientX, event.clientY);
      const prevSnap = snapshot();
      if (shape.type === 'line' || shape.type === 'arrow') {
        dragOp = { mode: 'endpoint', shape, end: handleEl.dataset.handle, prevSnap };
      } else {
        dragOp = {
          mode: 'resize',
          shape,
          dir: handleEl.dataset.handle,
          startWorldX: worldPt.x,
          startWorldY: worldPt.y,
          orig: { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
          prevSnap,
        };
      }
      return;
    }

    if (shapeEl && (event.button === 0 || event.ctrlKey)) {
      if (copiedFormat && event.button === 0) {
        event.preventDefault();
        const target = shapes.find((s) => s.id === shapeEl.dataset.shapeId);
        if (target && !target.locked) {
          applyFormatToShape(target);
        }
        if (!event.shiftKey) clearFormatPainter();
        return;
      }
      if (event.ctrlKey || event.metaKey) event.preventDefault();
      const id = shapeEl.dataset.shapeId;
      if (event.shiftKey) {
        selectShape(id, { toggle: true });
      } else if (!selectedIds.has(id)) {
        selectShape(id);
      }
      const worldPt = screenToWorld(event.clientX, event.clientY);
      const selected = getSelectedShapes();
      let moveTargets = expandWithFrameContents(selected).filter((s) => !s.locked);
      if (moveTargets.length === 0) return;
      const prevSnap = snapshot();
      let activeId = id;
      if (event.ctrlKey || event.metaKey) {
        const idMap = new Map();
        const clones = moveTargets.map((item) => {
          const clone = JSON.parse(JSON.stringify(item));
          clone.id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
          idMap.set(item.id, clone.id);
          return clone;
        });
        clones.forEach((c) => {
          if (c.startAnchor?.shapeId && idMap.has(c.startAnchor.shapeId)) {
            c.startAnchor = { ...c.startAnchor, shapeId: idMap.get(c.startAnchor.shapeId) };
          }
          if (c.endAnchor?.shapeId && idMap.has(c.endAnchor.shapeId)) {
            c.endAnchor = { ...c.endAnchor, shapeId: idMap.get(c.endAnchor.shapeId) };
          }
          shapes.push(c);
        });
        selectedIds = new Set(clones.map((c) => c.id));
        activeId = idMap.get(id) || id;
        moveTargets = clones;
        render();
      }
      const activeSelected = getSelectedShapes();
      const clickedShape = activeSelected.find((s) => s.id === activeId);
      const primaryShape =
        clickedShape && clickedShape.type !== 'line' && clickedShape.type !== 'arrow'
          ? clickedShape
          : activeSelected.length === 1 && activeSelected[0].type !== 'line' && activeSelected[0].type !== 'arrow'
            ? activeSelected[0]
            : null;
      let groupOrig = null;
      if (!primaryShape && moveTargets.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        moveTargets.forEach((s) => {
          const sx1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.x1, s.x2) : s.x;
          const sy1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.y1, s.y2) : s.y;
          const sx2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.x1, s.x2) : s.x + s.w;
          const sy2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.y1, s.y2) : s.y + s.h;
          minX = Math.min(minX, sx1);
          minY = Math.min(minY, sy1);
          maxX = Math.max(maxX, sx2);
          maxY = Math.max(maxY, sy2);
        });
        groupOrig = { id: '__group__', x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
      }
      dragOp = {
        mode: 'move',
        startWorldX: worldPt.x,
        startWorldY: worldPt.y,
        prevSnap,
        primaryId: primaryShape?.id || null,
        groupOrig,
        dragIds: new Set(moveTargets.map((s) => s.id)),
        items: moveTargets.map((s) =>
          s.type === 'line' || s.type === 'arrow'
            ? { shape: s, isLine: true, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }
            : { shape: s, isLine: false, x: s.x, y: s.y }
        ),
      };
      return;
    }

    if (!marqueeMode) selectShape(null);
    const worldPt = screenToWorld(event.clientX, event.clientY);
    dragOp = { mode: 'marquee', startWorldX: worldPt.x, startWorldY: worldPt.y, curWorldX: worldPt.x, curWorldY: worldPt.y };
  });

  viewportEl?.addEventListener('dblclick', (event) => {
    if (event.target === minimapEl || drawTool) return;
    const anyShapeEl = event.target.closest('.word-shape');
    if (!anyShapeEl) {
      const worldPt = screenToWorld(event.clientX, event.clientY);
      const prev = snapshot();
      const id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const box = {
        id,
        type: 'text',
        x: snapCoord(worldPt.x - 100, event.altKey),
        y: snapCoord(worldPt.y - 20, event.altKey),
        w: 200,
        h: 56,
        fillColor: 'none',
        strokeColor: 'none',
        strokeWidth: 0,
        cornerRadius: 4,
        textEnabled: true,
        label: '',
      };
      shapes.push(box);
      selectedIds = new Set([id]);
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      const createdEl = layerEl?.querySelector(`[data-shape-id="${id}"]`);
      if (createdEl) openShapeTextEditor(box, createdEl);
      return;
    }
    const lineEl = event.target.closest('.word-shape-line');
    if (lineEl) {
      const shape = shapes.find((s) => s.id === lineEl.dataset.shapeId);
      if (!shape) return;
      let labelEl = lineEl.querySelector('.word-shape-line-label');
      if (!labelEl) {
        const minX = Math.min(shape.x1, shape.x2) - 16;
        const minY = Math.min(shape.y1, shape.y2) - 16;
        labelEl = document.createElement('div');
        labelEl.className = 'word-shape-line-label';
        labelEl.style.left = `${(shape.x1 + shape.x2) / 2 - minX}px`;
        labelEl.style.top = `${(shape.y1 + shape.y2) / 2 - minY}px`;
        lineEl.appendChild(labelEl);
      }
      labelEl.classList.add('is-editing');
      labelEl.contentEditable = 'true';
      labelEl.focus();
      const commit = () => {
        labelEl.classList.remove('is-editing');
        labelEl.contentEditable = 'false';
        const prev = snapshot();
        shape.label = labelEl.innerText.trim();
        recordUndo(prev);
        render();
        onMutate?.();
        labelEl.removeEventListener('blur', commit);
      };
      labelEl.addEventListener('blur', commit);
      return;
    }
    const shapeEl = event.target.closest('.word-shape-box');
    if (!shapeEl) return;
    const shape = shapes.find((s) => s.id === shapeEl.dataset.shapeId);
    if (!shape || shape.type === 'image') return;
    if (shape.type === 'frame') {
      const titleEl = shapeEl.querySelector('.word-shape-frame-title');
      if (!titleEl) return;
      const prev = snapshot();
      titleEl.contentEditable = 'true';
      titleEl.focus();
      const onInput = () => {
        shape.label = titleEl.innerText.trim() || 'Frame';
      };
      const commit = () => {
        titleEl.removeEventListener('input', onInput);
        titleEl.removeEventListener('blur', commit);
        titleEl.contentEditable = 'false';
        shape.label = titleEl.innerText.trim() || 'Frame';
        recordUndo(prev);
        onMutate?.();
      };
      titleEl.addEventListener('input', onInput);
      titleEl.addEventListener('blur', commit);
      return;
    }
    openShapeTextEditor(shape, shapeEl);
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragOp) return;
    if (dragOp.mode === 'pan') {
      panX = dragOp.origPanX + (event.clientX - dragOp.startX);
      panY = dragOp.origPanY + (event.clientY - dragOp.startY);
      applyViewportTransform();
      positionMiniBar();
      return;
    }
    const worldPt = screenToWorld(event.clientX, event.clientY);
    if (dragOp.mode === 'erase') {
      if (eraseFreehandAt(worldPt.x, worldPt.y)) {
        dragOp.erased = true;
        render();
      }
      return;
    }
    if (dragOp.mode === 'draw') {
      const isStraight = dragOp.tool === 'pen' && (drawTip === 'line' || event.shiftKey);
      dragOp.isStraight = isStraight;
      if (isStraight) {
        dragOp.points = [dragOp.points[0], { x: worldPt.x, y: worldPt.y }];
      } else {
        dragOp.points.push({ x: worldPt.x, y: worldPt.y });
      }
      render();
      const pts = dragOp.points;
      const minX = Math.min(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxX = Math.max(...pts.map((p) => p.x));
      const maxY = Math.max(...pts.map((p) => p.y));
      const w = Math.max(4, maxX - minX);
      const h = Math.max(4, maxY - minY);
      const norm = pts.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }));
      const previewSvg = createSvgEl('svg', {
        class: 'word-shape-svg board-draw-preview',
        viewBox: `0 0 ${w} ${h}`,
        width: w,
        height: h,
      });
      previewSvg.style.left = `${minX}px`;
      previewSvg.style.top = `${minY}px`;
      if (dragOp.tool === 'highlighter') previewSvg.style.opacity = '0.45';
      const previewWidth = getDrawStrokeWidth(dragOp.tool);
      const previewAttrs = {
        d: buildSmoothPath(norm, w, h),
        fill: 'none',
        stroke: dragOp.tool === 'highlighter' ? (drawColor === '#1a1a1a' ? '#fef08a' : drawColor) : drawColor,
        'stroke-width': previewWidth,
        'stroke-linecap': dragOp.tool === 'pen' && drawTip === 'square' ? 'square' : 'round',
        'stroke-linejoin': dragOp.tool === 'pen' && drawTip === 'square' ? 'bevel' : 'round',
      };
      if (dragOp.tool === 'pen' && (drawTip === 'dashed' || drawTip === 'dotted')) {
        previewAttrs['stroke-dasharray'] = getStrokeDashArray(drawTip, previewWidth);
      }
      previewSvg.appendChild(createSvgEl('path', previewAttrs));
      layerEl?.appendChild(previewSvg);
      return;
    }
    if (dragOp.mode === 'move') {
      let dx = worldPt.x - dragOp.startWorldX;
      let dy = worldPt.y - dragOp.startWorldY;
      const primaryItem = dragOp.primaryId ? dragOp.items.find((item) => item.shape.id === dragOp.primaryId) : null;
      const snapTarget = primaryItem ? primaryItem.shape : dragOp.groupOrig;
      const snapOrigX = primaryItem ? primaryItem.x : dragOp.groupOrig?.x;
      const snapOrigY = primaryItem ? primaryItem.y : dragOp.groupOrig?.y;
      const useUnifiedSnap = Boolean(snapTarget && !event.altKey);
      if (useUnifiedSnap) {
        const snapped = snapBoxToPeers(snapTarget, snapOrigX + dx, snapOrigY + dy, 8, dragOp.dragIds);
        const targetX = snapped.guides.some((g) => g.axis === 'x')
          ? Math.round(snapped.x)
          : snapCoord(snapped.x, event.altKey);
        const targetY = snapped.guides.some((g) => g.axis === 'y')
          ? Math.round(snapped.y)
          : snapCoord(snapped.y, event.altKey);
        dx = targetX - snapOrigX;
        dy = targetY - snapOrigY;
        activeAlignGuides = snapped.guides;
      } else {
        activeAlignGuides = [];
      }
      dragOp.items.forEach((item) => {
        if (item.isLine) {
          item.shape.x1 = useUnifiedSnap ? Math.round(item.x1 + dx) : snapCoord(item.x1 + dx, event.altKey);
          item.shape.y1 = useUnifiedSnap ? Math.round(item.y1 + dy) : snapCoord(item.y1 + dy, event.altKey);
          item.shape.x2 = useUnifiedSnap ? Math.round(item.x2 + dx) : snapCoord(item.x2 + dx, event.altKey);
          item.shape.y2 = useUnifiedSnap ? Math.round(item.y2 + dy) : snapCoord(item.y2 + dy, event.altKey);
          item.shape.startAnchor = null;
          item.shape.endAnchor = null;
        } else {
          item.shape.x = useUnifiedSnap ? Math.round(item.x + dx) : snapCoord(item.x + dx, event.altKey);
          item.shape.y = useUnifiedSnap ? Math.round(item.y + dy) : snapCoord(item.y + dy, event.altKey);
          syncAttachedLines(item.shape);
        }
      });
      render();
      positionMiniBar();
    } else if (dragOp.mode === 'resize') {
      const dx = worldPt.x - dragOp.startWorldX;
      const dy = worldPt.y - dragOp.startWorldY;
      const { orig, dir, shape } = dragOp;
      let { x, y, w, h } = orig;
      if (dir.includes('e')) w = Math.max(24, orig.w + dx);
      if (dir.includes('s')) h = Math.max(24, orig.h + dy);
      if (dir.includes('w')) w = Math.max(24, orig.w - dx);
      if (dir.includes('n')) h = Math.max(24, orig.h - dy);
      if (event.shiftKey) {
        const ratio = orig.w / Math.max(1, orig.h);
        const hasH = dir.includes('e') || dir.includes('w');
        const hasV = dir.includes('n') || dir.includes('s');
        if (hasH && hasV) {
          if (Math.abs(w / orig.w - 1) >= Math.abs(h / orig.h - 1)) {
            h = Math.max(24, w / ratio);
            w = Math.max(24, h * ratio);
          } else {
            w = Math.max(24, h * ratio);
            h = Math.max(24, w / ratio);
          }
        } else if (hasH) {
          h = Math.max(24, w / ratio);
        } else if (hasV) {
          w = Math.max(24, h * ratio);
        }
      }
      if (dir.includes('w')) x = orig.x + (orig.w - w);
      if (dir.includes('n')) y = orig.y + (orig.h - h);
      shape.x = Math.round(x);
      shape.y = Math.round(y);
      shape.w = Math.round(w);
      shape.h = Math.round(h);
      syncAttachedLines(shape);
      render();
      positionMiniBar();
    } else if (dragOp.mode === 'connect') {
      const { shape } = dragOp;
      const snapped = event.altKey ? null : findSnapAnchor(worldPt.x, worldPt.y, 14);
      activeSnapPoint = snapped ? { x: snapped.x, y: snapped.y } : null;
      shape.x2 = Math.round(snapped ? snapped.x : worldPt.x);
      shape.y2 = Math.round(snapped ? snapped.y : worldPt.y);
      shape.endAnchor = snapped ? { shapeId: snapped.shapeId, dir: snapped.dir } : null;
      render();
    } else if (dragOp.mode === 'rotate') {
      const { shape } = dragOp;
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      let deg = Math.round((Math.atan2(worldPt.y - cy, worldPt.x - cx) * 180) / Math.PI + 90);
      if (event.shiftKey) deg = Math.round(deg / 15) * 15;
      shape.rotation = ((deg % 360) + 360) % 360;
      render();
      positionMiniBar();
    } else if (dragOp.mode === 'endpoint') {
      const { shape, end } = dragOp;
      const snapped = event.altKey ? null : findSnapAnchor(worldPt.x, worldPt.y, 14);
      activeSnapPoint = snapped ? { x: snapped.x, y: snapped.y } : null;
      const fx = Math.round(snapped ? snapped.x : worldPt.x);
      const fy = Math.round(snapped ? snapped.y : worldPt.y);
      const ref = snapped ? { shapeId: snapped.shapeId, dir: snapped.dir } : null;
      if (end === 'start') {
        shape.x1 = fx;
        shape.y1 = fy;
        shape.startAnchor = ref;
      } else {
        shape.x2 = fx;
        shape.y2 = fy;
        shape.endAnchor = ref;
      }
      render();
      positionMiniBar();
    } else if (dragOp.mode === 'marquee') {
      dragOp.curWorldX = worldPt.x;
      dragOp.curWorldY = worldPt.y;
      render();
      const box = document.createElement('div');
      box.className = 'shape-marquee-box is-window';
      const x1 = Math.min(dragOp.startWorldX, dragOp.curWorldX);
      const y1 = Math.min(dragOp.startWorldY, dragOp.curWorldY);
      box.style.left = `${x1}px`;
      box.style.top = `${y1}px`;
      box.style.width = `${Math.abs(dragOp.curWorldX - dragOp.startWorldX)}px`;
      box.style.height = `${Math.abs(dragOp.curWorldY - dragOp.startWorldY)}px`;
      layerEl?.appendChild(box);
    }
  });

  window.addEventListener('mouseup', () => {
    if (!dragOp) return;
    if (dragOp.mode === 'erase') {
      if (dragOp.erased) {
        recordUndo(dragOp.prevSnap);
        onMutate?.();
      }
    } else if (dragOp.mode === 'connect') {
      const { shape } = dragOp;
      if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) < 10) {
        shapes = shapes.filter((s) => s.id !== shape.id);
        selectedIds.clear();
      } else {
        recordUndo(dragOp.prevSnap);
        onMutate?.();
      }
      render();
      positionMiniBar();
    } else if (dragOp.mode === 'draw') {
      const pts = dragOp.points;
      if (pts.length >= 2) {
        if (dragOp.isStraight) {
          const p0 = pts[0];
          const p1 = pts[pts.length - 1];
          if (Math.hypot(p1.x - p0.x, p1.y - p0.y) >= 4) {
            const id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
            shapes.push({
              id,
              type: 'line',
              strokeColor: drawColor,
              strokeWidth: getDrawStrokeWidth('pen'),
              strokeStyle: 'solid',
              startMarker: 'none',
              endMarker: 'none',
              x1: Math.round(p0.x),
              y1: Math.round(p0.y),
              x2: Math.round(p1.x),
              y2: Math.round(p1.y),
            });
            recordUndo(dragOp.prevSnap);
            onMutate?.();
          }
        } else {
          const minX = Math.min(...pts.map((p) => p.x));
          const minY = Math.min(...pts.map((p) => p.y));
          const maxX = Math.max(...pts.map((p) => p.x));
          const maxY = Math.max(...pts.map((p) => p.y));
          const w = Math.max(8, Math.round(maxX - minX));
          const h = Math.max(8, Math.round(maxY - minY));
          const norm = pts.map((p) => ({
            x: (p.x - minX) / (maxX - minX || 1),
            y: (p.y - minY) / (maxY - minY || 1),
          }));
          const id = `free-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
          shapes.push({
            id,
            type: 'freehand',
            x: Math.round(minX),
            y: Math.round(minY),
            w,
            h,
            points: norm,
            strokeColor: dragOp.tool === 'highlighter' ? (drawColor === '#1a1a1a' ? '#fef08a' : drawColor) : drawColor,
            strokeWidth: getDrawStrokeWidth(dragOp.tool),
            strokeCap: dragOp.tool === 'pen' && drawTip === 'square' ? 'square' : 'round',
            strokeJoin: dragOp.tool === 'pen' && drawTip === 'square' ? 'bevel' : 'round',
            strokeStyle: dragOp.tool === 'pen' && (drawTip === 'dashed' || drawTip === 'dotted') ? drawTip : 'solid',
            opacity: dragOp.tool === 'highlighter' ? 0.45 : 1,
            fillColor: 'none',
          });
          recordUndo(dragOp.prevSnap);
          onMutate?.();
        }
      }
      render();
    } else if (dragOp.mode === 'pan') {
      viewportEl?.classList.remove('is-panning');
    } else if (dragOp.mode === 'marquee') {
      const x1 = Math.min(dragOp.startWorldX, dragOp.curWorldX);
      const y1 = Math.min(dragOp.startWorldY, dragOp.curWorldY);
      const x2 = Math.max(dragOp.startWorldX, dragOp.curWorldX);
      const y2 = Math.max(dragOp.startWorldY, dragOp.curWorldY);
      if (x2 - x1 > 4 || y2 - y1 > 4) {
        selectedIds = new Set(
          shapes
            .filter((s) => {
              const sx1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.x1, s.x2) : s.x;
              const sy1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.y1, s.y2) : s.y;
              const sx2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.x1, s.x2) : s.x + s.w;
              const sy2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.y1, s.y2) : s.y + s.h;
              return sx1 <= x2 && sx2 >= x1 && sy1 <= y2 && sy2 >= y1;
            })
            .map((s) => s.id)
        );
      }
      render();
      positionMiniBar();
    } else if (dragOp.prevSnap) {
      recordUndo(dragOp.prevSnap);
      onMutate?.();
    }
    activeAlignGuides = [];
    activeSnapPoint = null;
    dragOp = null;
  });

  viewportEl?.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.08 : 0.92;
        setZoomPercent(Math.round(zoom * 100 * factor), { notify: true });
      } else {
        event.preventDefault();
        panX -= event.deltaX;
        panY -= event.deltaY;
        applyViewportTransform();
        positionMiniBar();
      }
    },
    { passive: false }
  );

  // Mini-bar & toolbar controls
  fillBtnEl?.addEventListener('click', () => {
    const open = !fillPopoverEl?.classList.contains('is-open');
    closePopovers();
    fillPopoverEl?.classList.toggle('is-open', open);
  });
  borderBtnEl?.addEventListener('click', () => {
    const open = !borderPopoverEl?.classList.contains('is-open');
    closePopovers();
    borderPopoverEl?.classList.toggle('is-open', open);
  });
  effectsBtnEl?.addEventListener('click', () => {
    const open = !effectsPopoverEl?.classList.contains('is-open');
    closePopovers();
    effectsPopoverEl?.classList.toggle('is-open', open);
  });
  alignBtnEl?.addEventListener('click', () => {
    const open = !alignPopoverEl?.classList.contains('is-open');
    closePopovers();
    alignPopoverEl?.classList.toggle('is-open', open);
  });
  cornersBtnEl?.addEventListener('click', () => {
    const open = !cornersPopoverEl?.classList.contains('is-open');
    closePopovers();
    cornersPopoverEl?.classList.toggle('is-open', open);
  });
  endsBtnEl?.addEventListener('click', () => {
    const open = !endsPopoverEl?.classList.contains('is-open');
    closePopovers();
    endsPopoverEl?.classList.toggle('is-open', open);
  });

  opacityRangeEl?.addEventListener('input', () => {
    const pct = Number(opacityRangeEl.value) || 100;
    if (opacityValueEl) opacityValueEl.textContent = `${pct}%`;
    getSelectedShapes().forEach((s) => {
      s.opacity = pct / 100;
    });
    render();
    positionMiniBar();
    onMutate?.();
  });

  gradStartInputEl?.addEventListener('input', () => {
    getSelectedShapes().forEach((s) => {
      s.fillType = 'gradient';
      s.gradientStart = gradStartInputEl.value;
      s.gradientEnd = s.gradientEnd || gradEndInputEl?.value || '#1d4ed8';
    });
    render();
    onMutate?.();
  });

  gradEndInputEl?.addEventListener('input', () => {
    getSelectedShapes().forEach((s) => {
      s.fillType = 'gradient';
      s.gradientEnd = gradEndInputEl.value;
      s.gradientStart = s.gradientStart || gradStartInputEl?.value || '#3b82f6';
    });
    render();
    onMutate?.();
  });

  document.getElementById('btn-shape-grad-clear')?.addEventListener('click', () => {
    const prev = snapshot();
    getSelectedShapes().forEach((s) => {
      s.fillType = 'solid';
    });
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  });

  miniBarEl?.addEventListener('mousedown', (e) => e.stopPropagation());
  miniBarEl?.addEventListener('click', (e) => {
    const target = e.target;
    const noFill = target.closest('[data-shape-fill]');
    if (noFill) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.fillColor = 'none';
        s.fillType = 'solid';
      });
      recordUndo(prev);
      render();
      closePopovers();
      onMutate?.();
      return;
    }
    const noBorder = target.closest('[data-shape-border]');
    if (noBorder) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.strokeColor = 'none';
      });
      recordUndo(prev);
      render();
      closePopovers();
      onMutate?.();
      return;
    }
    const widthBtn = target.closest('[data-shape-width]');
    if (widthBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.strokeWidth = Number(widthBtn.dataset.shapeWidth);
      });
      recordUndo(prev);
      render();
      onMutate?.();
      return;
    }
    const styleBtn = target.closest('[data-shape-style]');
    if (styleBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.strokeStyle = styleBtn.dataset.shapeStyle;
      });
      recordUndo(prev);
      render();
      onMutate?.();
      return;
    }
    const opBtn = target.closest('[data-shape-opacity]');
    if (opBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.opacity = Number(opBtn.dataset.shapeOpacity);
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      return;
    }
    const shBtn = target.closest('[data-shape-shadow]');
    if (shBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.shadow = shBtn.dataset.shapeShadow;
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      return;
    }
    const gpBtn = target.closest('[data-grad-start][data-grad-end]');
    if (gpBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.fillType = 'gradient';
        s.gradientStart = gpBtn.dataset.gradStart;
        s.gradientEnd = gpBtn.dataset.gradEnd;
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      return;
    }
    const gaBtn = target.closest('[data-grad-angle]');
    if (gaBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.fillType = 'gradient';
        s.gradientAngle = Number(gaBtn.dataset.gradAngle);
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      return;
    }
    const radBtn = target.closest('[data-shape-radius]');
    if (radBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        s.cornerRadius = Number(radBtn.dataset.shapeRadius) || 0;
      });
      recordUndo(prev);
      render();
      closePopovers();
      onMutate?.();
      return;
    }
    const endsBtn = target.closest('[data-shape-ends]');
    if (endsBtn) {
      const mode = endsBtn.dataset.shapeEnds;
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        if (s.type !== 'line' && s.type !== 'arrow') return;
        s.startMarker = mode === 'start' || mode === 'both' ? 'arrow' : 'none';
        s.endMarker = mode === 'end' || mode === 'both' ? 'arrow' : 'none';
      });
      recordUndo(prev);
      render();
      closePopovers();
      onMutate?.();
      return;
    }
    const curveBtn = target.closest('[data-line-curve]');
    if (curveBtn) {
      const prev = snapshot();
      getSelectedShapes().forEach((s) => {
        if (s.type !== 'line' && s.type !== 'arrow') return;
        s.lineCurve = curveBtn.dataset.lineCurve;
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      return;
    }
    const textAlignBtn = target.closest('[data-shape-text-align]');
    if (textAlignBtn) {
      const prev = snapshot();
      const align = textAlignBtn.dataset.shapeTextAlign;
      getSelectedShapes().forEach((s) => {
        s.textAlign = align;
        s.textEnabled = true;
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      return;
    }
    const textVAlignBtn = target.closest('[data-shape-text-valign]');
    if (textVAlignBtn) {
      const prev = snapshot();
      const valign = textVAlignBtn.dataset.shapeTextValign;
      getSelectedShapes().forEach((s) => {
        s.textVAlign = valign;
        s.textEnabled = true;
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
      return;
    }
    const alignBtn = target.closest('[data-shape-align]');
    if (alignBtn) {
      const sel = getSelectedShapes().filter((s) => s.type !== 'line' && s.type !== 'arrow' && !s.locked);
      if (sel.length < 2) return;
      const prev = snapshot();
      const mode = alignBtn.dataset.shapeAlign;
      const minX = Math.min(...sel.map((s) => s.x));
      const maxX = Math.max(...sel.map((s) => s.x + s.w));
      const midX = (minX + maxX) / 2;
      const minY = Math.min(...sel.map((s) => s.y));
      const maxY = Math.max(...sel.map((s) => s.y + s.h));
      const midY = (minY + maxY) / 2;
      if (mode === 'dist-h' && sel.length >= 3) {
        const sorted = [...sel].sort((a, b) => a.x - b.x);
        const totalW = sorted.reduce((acc, s) => acc + s.w, 0);
        const gap = (maxX - minX - totalW) / (sorted.length - 1);
        let curX = minX;
        sorted.forEach((s) => {
          s.x = Math.round(curX);
          curX += s.w + gap;
          syncAttachedLines(s);
        });
      } else if (mode === 'dist-v' && sel.length >= 3) {
        const sorted = [...sel].sort((a, b) => a.y - b.y);
        const totalH = sorted.reduce((acc, s) => acc + s.h, 0);
        const gap = (maxY - minY - totalH) / (sorted.length - 1);
        let curY = minY;
        sorted.forEach((s) => {
          s.y = Math.round(curY);
          curY += s.h + gap;
          syncAttachedLines(s);
        });
      } else {
        sel.forEach((s) => {
          if (mode === 'left') s.x = minX;
          else if (mode === 'right') s.x = maxX - s.w;
          else if (mode === 'center') s.x = Math.round(midX - s.w / 2);
          else if (mode === 'top') s.y = minY;
          else if (mode === 'bottom') s.y = maxY - s.h;
          else if (mode === 'middle') s.y = Math.round(midY - s.h / 2);
          syncAttachedLines(s);
        });
      }
      recordUndo(prev);
      render();
      closePopovers();
      onMutate?.();
    }
  });

  textCheckboxEl?.addEventListener('change', () => {
    const sel = getSelectedShapes()[0];
    if (!sel) return;
    sel.textEnabled = textCheckboxEl.checked;
    render();
    onMutate?.();
  });

  fontFamilyEl?.addEventListener('change', () => {
    const family = fontFamilyEl.value;
    const prev = snapshot();
    getSelectedShapes().forEach((s) => {
      s.fontFamily = family;
      s.textEnabled = true;
    });
    recordUndo(prev);
    render();
    onMutate?.();
  });

  fontSizeEl?.addEventListener('change', () => {
    const size = Number(fontSizeEl.value) || 14;
    const prev = snapshot();
    getSelectedShapes().forEach((s) => {
      s.fontSize = size;
      s.textEnabled = true;
    });
    recordUndo(prev);
    render();
    onMutate?.();
  });

  boldBtnEl?.addEventListener('click', () => {
    const prev = snapshot();
    const sel = getSelectedShapes();
    const nextBold = !(sel[0]?.fontWeight === '700' || sel[0]?.fontWeight === 'bold');
    sel.forEach((s) => {
      s.fontWeight = nextBold ? '700' : '500';
      s.textEnabled = true;
    });
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  });

  textColorEl?.addEventListener('input', () => {
    getSelectedShapes().forEach((s) => {
      s.textColor = textColorEl.value;
      s.textEnabled = true;
    });
    render();
    onMutate?.();
  });

  lockBtnEl?.addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 0) return;
    const prev = snapshot();
    const nextLock = !sel.some((s) => Boolean(s.locked));
    sel.forEach((s) => {
      s.locked = nextLock;
    });
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  });

  drawOptionsBarEl?.addEventListener('mousedown', (e) => e.stopPropagation());
  drawOptionsBarEl?.addEventListener('click', (e) => {
    const cBtn = e.target.closest('[data-draw-color]');
    if (cBtn) {
      drawColor = cBtn.dataset.drawColor;
      drawOptionsBarEl.querySelectorAll('[data-draw-color]').forEach((b) => b.classList.toggle('is-active', b === cBtn));
      return;
    }
    const sBtn = e.target.closest('[data-draw-size]');
    if (sBtn) {
      drawSize = sBtn.dataset.drawSize;
      drawOptionsBarEl.querySelectorAll('[data-draw-size]').forEach((b) => b.classList.toggle('is-active', b === sBtn));
      return;
    }
    const tBtn = e.target.closest('[data-draw-tip]');
    if (tBtn) {
      drawTip = tBtn.dataset.drawTip;
      drawOptionsBarEl.querySelectorAll('[data-draw-tip]').forEach((b) => b.classList.toggle('is-active', b === tBtn));
    }
  });

  minimapEl?.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    const t = minimapEl._mapTransform;
    if (!t || !viewportEl) return;
    const jumpTo = (clientX, clientY) => {
      const mRect = minimapEl.getBoundingClientRect();
      const vRect = viewportEl.getBoundingClientRect();
      const wx = t.minX + (clientX - mRect.left - t.ox) / t.scale;
      const wy = t.minY + (clientY - mRect.top - t.oy) / t.scale;
      panX = Math.round(vRect.width / 2 - wx * zoom);
      panY = Math.round(vRect.height / 2 - wy * zoom);
      applyViewportTransform();
      positionMiniBar();
    };
    jumpTo(event.clientX, event.clientY);
    const onMove = (e) => jumpTo(e.clientX, e.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  groupBtnEl?.addEventListener('click', groupSelected);
  ungroupBtnEl?.addEventListener('click', ungroupSelected);
  arrangeOrderBtns.forEach((btn) => {
    btn.addEventListener('click', () => reorderSelected(btn.dataset.arrangeOrder));
  });
  function cloneShapesIntoBoard(sourceShapes) {
    if (!sourceShapes || sourceShapes.length === 0) return;
    const prev = snapshot();
    const nextIds = new Set();
    sourceShapes.forEach((item) => {
      const clone = JSON.parse(JSON.stringify(item));
      clone.id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      delete clone.locked;
      if (clone.type === 'line' || clone.type === 'arrow') {
        clone.x1 += 24;
        clone.y1 += 24;
        clone.x2 += 24;
        clone.y2 += 24;
      } else {
        clone.x += 24;
        clone.y += 24;
      }
      shapes.push(clone);
      nextIds.add(clone.id);
    });
    selectedIds = nextIds;
    recordUndo(prev);
    render();
    positionMiniBar();
    onMutate?.();
  }

  function copySelected() {
    if (selectedIds.size === 0) return;
    clipboard = JSON.parse(JSON.stringify(expandWithFrameContents(getSelectedShapes())));
    if (pasteBtnEl) pasteBtnEl.disabled = clipboard.length === 0;
  }

  function pasteClipboard() {
    if (clipboard.length === 0) return;
    cloneShapesIntoBoard(clipboard);
  }

  function duplicateSelected() {
    if (selectedIds.size === 0) return;
    cloneShapesIntoBoard(expandWithFrameContents(getSelectedShapes()));
  }

  canvasMenuEl?.addEventListener('mousedown', (e) => e.stopPropagation());
  canvasMenuEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-canvas-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.canvasAction;
    closeCanvasMenu();
    if (action === 'paste') {
      pasteClipboard();
    } else if (action === 'sticky' || action === 'text' || action === 'frame') {
      insertShape(action, canvasMenuWorldPt);
    } else if (action === 'select-all') {
      selectedIds = new Set(shapes.map((s) => s.id));
      render();
      positionMiniBar();
    } else if (action === 'fit-view') {
      fitToShapes(shapes);
    } else if (action === 'reset-view') {
      panX = 0;
      panY = 0;
      setZoomPercent(100, { notify: true });
    }
  });

  const FORMAT_STYLE_PROPS = [
    'fillColor', 'fillType', 'gradientStart', 'gradientEnd', 'gradientAngle',
    'strokeColor', 'strokeWidth', 'strokeStyle', 'opacity', 'shadow', 'cornerRadius',
    'fontFamily', 'fontSize', 'fontWeight', 'textColor', 'textAlign', 'textVAlign',
    'startMarker', 'endMarker', 'lineCurve',
  ];

  function clearFormatPainter() {
    copiedFormat = null;
    formatPainterBtnEl?.classList.remove('is-active');
    formatPainterBtnEl?.setAttribute('aria-pressed', 'false');
    if (formatPainterBtnEl) formatPainterBtnEl.disabled = selectedIds.size === 0;
    viewportEl?.classList.remove('is-format-painter');
  }

  function startFormatPainter() {
    const src = getSelectedShapes()[0];
    if (!src) return;
    copiedFormat = {};
    FORMAT_STYLE_PROPS.forEach((k) => {
      if (src[k] !== undefined) copiedFormat[k] = src[k];
    });
    formatPainterBtnEl?.classList.add('is-active');
    formatPainterBtnEl?.setAttribute('aria-pressed', 'true');
    if (formatPainterBtnEl) formatPainterBtnEl.disabled = false;
    viewportEl?.classList.add('is-format-painter');
  }

  function applyFormatToShape(target) {
    if (!copiedFormat || !target) return;
    const prev = snapshot();
    const isLine = target.type === 'line' || target.type === 'arrow';
    const lineOnly = new Set(['startMarker', 'endMarker', 'lineCurve']);
    const boxOnly = new Set(['fillColor', 'fillType', 'gradientStart', 'gradientEnd', 'gradientAngle', 'cornerRadius']);
    for (const [k, v] of Object.entries(copiedFormat)) {
      if (isLine && boxOnly.has(k)) continue;
      if (!isLine && lineOnly.has(k)) continue;
      target[k] = v;
    }
    recordUndo(prev);
    selectShape(target.id);
    onMutate?.();
  }

  undoBtnEl?.addEventListener('click', undo);
  redoBtnEl?.addEventListener('click', redo);
  copyBtnEl?.addEventListener('click', copySelected);
  pasteBtnEl?.addEventListener('click', pasteClipboard);
  duplicateBtnEl?.addEventListener('click', duplicateSelected);
  deleteBtnEl?.addEventListener('click', deleteSelected);
  formatPainterBtnEl?.addEventListener('click', () => {
    if (copiedFormat) clearFormatPainter();
    else startFormatPainter();
  });
  miniFormatPainterBtnEl?.addEventListener('click', () => {
    startFormatPainter();
    miniBarOpen = false;
    closePopovers();
    miniBarEl?.classList.remove('is-visible');
  });
  miniDuplicateBtnEl?.addEventListener('click', () => {
    duplicateSelected();
    hideMiniBar();
  });
  miniDeleteBtnEl?.addEventListener('click', () => {
    deleteSelected();
  });

  marqueeBtnEl?.addEventListener('click', () => {
    marqueeMode = !marqueeMode;
    marqueeBtnEl.classList.toggle('is-active', marqueeMode);
    marqueeBtnEl.setAttribute('aria-pressed', String(marqueeMode));
  });

  penBtnEl?.addEventListener('click', () => setDrawTool('pen'));
  highlighterBtnEl?.addEventListener('click', () => setDrawTool('highlighter'));
  eraserBtnEl?.addEventListener('click', () => setDrawTool('eraser'));

  panBtnEl?.addEventListener('click', () => {
    if (drawTool) setDrawTool(null);
    panToolActive = !panToolActive;
    panBtnEl.classList.toggle('is-active', panToolActive);
    panBtnEl.setAttribute('aria-pressed', String(panToolActive));
    viewportEl?.classList.toggle('is-pan-tool', panToolActive);
  });

  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (active?.isContentEditable || active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
    if (event.code === 'Space') {
      spaceHeld = true;
      viewportEl?.classList.add('is-pan-tool');
    } else if (event.key === 'Escape' && (drawTool || copiedFormat)) {
      if (drawTool) setDrawTool(null);
      if (copiedFormat) clearFormatPainter();
    } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'p') {
      setDrawTool('pen');
    } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'h') {
      setDrawTool('highlighter');
    } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'e') {
      setDrawTool('eraser');
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'Digit1') {
      event.preventDefault();
      fitToShapes(shapes);
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'Digit2' && selectedIds.size > 0) {
      event.preventDefault();
      fitToShapes(getSelectedShapes());
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && selectedIds.size > 0) {
      event.preventDefault();
      const step = event.shiftKey ? (snapToGrid ? 24 : 10) : 1;
      const ndx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const ndy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      const targets = expandWithFrameContents(getSelectedShapes()).filter((s) => !s.locked);
      if (targets.length === 0) return;
      const prev = snapshot();
      targets.forEach((s) => {
        if (s.type === 'line' || s.type === 'arrow') {
          s.x1 += ndx;
          s.y1 += ndy;
          s.x2 += ndx;
          s.y2 += ndy;
          s.startAnchor = null;
          s.endAnchor = null;
        } else {
          s.x += ndx;
          s.y += ndy;
          syncAttachedLines(s);
        }
      });
      recordUndo(prev);
      render();
      positionMiniBar();
      onMutate?.();
    }
    const isMod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (isMod && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (isMod && key === 'y') {
      event.preventDefault();
      redo();
    } else if (isMod && key === 'a') {
      event.preventDefault();
      selectedIds = new Set(shapes.map((s) => s.id));
      render();
      positionMiniBar();
    } else if (isMod && key === 'd' && selectedIds.size > 0) {
      event.preventDefault();
      duplicateSelected();
    } else if (isMod && key === 'c' && selectedIds.size > 0) {
      event.preventDefault();
      copySelected();
    } else if (isMod && key === 'v' && clipboard.length > 0) {
      event.preventDefault();
      pasteClipboard();
    } else if (isMod && key === 'g') {
      event.preventDefault();
      if (event.shiftKey) ungroupSelected();
      else groupSelected();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.size > 0) {
      event.preventDefault();
      deleteSelected();
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      spaceHeld = false;
      if (!panToolActive) viewportEl?.classList.remove('is-pan-tool');
    }
  });

  function exportSvgString(targetShapes = shapes) {
    if (!targetShapes || targetShapes.length === 0) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    targetShapes.forEach((s) => {
      const sx1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.x1, s.x2) : s.x;
      const sy1 = s.type === 'line' || s.type === 'arrow' ? Math.min(s.y1, s.y2) : s.y;
      const sx2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.x1, s.x2) : s.x + s.w;
      const sy2 = s.type === 'line' || s.type === 'arrow' ? Math.max(s.y1, s.y2) : s.y + s.h;
      minX = Math.min(minX, sx1);
      minY = Math.min(minY, sy1);
      maxX = Math.max(maxX, sx2);
      maxY = Math.max(maxY, sy2);
    });
    const pad = 32;
    const w = Math.max(200, Math.round(maxX - minX + pad * 2));
    const h = Math.max(150, Math.round(maxY - minY + pad * 2));
    const ox = -minX + pad;
    const oy = -minY + pad;
    const defsParts = [];
    const bodyParts = [];
    targetShapes.forEach((s) => {
      const op = typeof s.opacity === 'number' && s.opacity < 1 ? ` opacity="${s.opacity}"` : '';
      const stroke = s.strokeColor === 'none' ? 'none' : s.strokeColor || '#1a1a1a';
      const strokeWidth = s.strokeWidth ?? 2;
      const dash = getStrokeDashArray(s.strokeStyle, strokeWidth);
      const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';

      let fill = s.fillColor === 'none' ? 'none' : s.fillColor || '#ffffff';
      if (s.fillType === 'gradient') {
        const gid = `exp-grad-${s.id}`;
        const vec = getGradientVector(s.gradientAngle ?? 135);
        defsParts.push(
          `<linearGradient id="${gid}" x1="${vec.x1}" y1="${vec.y1}" x2="${vec.x2}" y2="${vec.y2}">` +
            `<stop offset="0%" stop-color="${s.gradientStart || '#3b82f6'}"/>` +
            `<stop offset="100%" stop-color="${s.gradientEnd || '#1d4ed8'}"/>` +
          `</linearGradient>`
        );
        fill = `url(#${gid})`;
      }

      if (s.type === 'freehand') {
        const d = buildSmoothPath(s.points, s.w, s.h);
        const cap = s.strokeCap || 'round';
        const join = s.strokeJoin || 'round';
        bodyParts.push(`<g transform="translate(${s.x + ox},${s.y + oy})"${op}><path d="${d}" fill="none" stroke="${s.strokeColor || '#1a1a1a'}" stroke-width="${s.strokeWidth || 3}" stroke-linecap="${cap}" stroke-linejoin="${join}"${dashAttr}/></g>`);
      } else if (s.type === 'frame') {
        bodyParts.push(`<rect x="${s.x + ox}" y="${s.y + oy}" width="${s.w}" height="${s.h}" rx="8" fill="rgba(148,163,184,0.06)" stroke="#94a3b8" stroke-dasharray="6,4" stroke-width="1.5"${op}/>`);
        if (s.label) {
          bodyParts.push(`<text x="${s.x + ox + 10}" y="${s.y + oy + 18}" font-family="sans-serif" font-size="12" font-weight="600" fill="#475569">${s.label.replace(/</g, '&lt;')}</text>`);
        }
        return;
      } else if (s.type === 'line' || s.type === 'arrow') {
        const hasStart = s.startMarker === 'arrow';
        const hasEnd = (s.endMarker || (s.type === 'arrow' ? 'arrow' : 'none')) === 'arrow';
        let markerAttrs = '';
        if (hasStart) {
          const mid = `exp-start-${s.id}`;
          defsParts.push(`<marker id="${mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${stroke}"/></marker>`);
          markerAttrs += ` marker-start="url(#${mid})"`;
        }
        if (hasEnd) {
          const mid = `exp-end-${s.id}`;
          defsParts.push(`<marker id="${mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${stroke}"/></marker>`);
          markerAttrs += ` marker-end="url(#${mid})"`;
        }
        bodyParts.push(`<path d="${buildLinePath(s.lineCurve || 'straight', s.x1 + ox, s.y1 + oy, s.x2 + ox, s.y2 + oy)}" fill="none" stroke="${stroke}" stroke-width="${s.strokeWidth || 2.5}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${markerAttrs}${op}/>`);
        if (s.label) {
          bodyParts.push(`<text x="${(s.x1 + s.x2) / 2 + ox}" y="${(s.y1 + s.y2) / 2 + oy - 6}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="500" fill="#1a1a1a">${s.label.replace(/</g, '&lt;')}</text>`);
        }
        return;
      } else if (s.type === 'image') {
        if (s.src) {
          bodyParts.push(`<image href="${s.src.replace(/"/g, '&quot;')}" x="${s.x + ox}" y="${s.y + oy}" width="${s.w}" height="${s.h}" preserveAspectRatio="none"${op}/>`);
        }
      } else if (s.type === 'ellipse') {
        bodyParts.push(`<ellipse cx="${s.x + ox + s.w / 2}" cy="${s.y + oy + s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}${op}/>`);
      } else if (['triangle', 'diamond', 'hexagon', 'star', 'parallelogram'].includes(s.type)) {
        bodyParts.push(`<g transform="translate(${s.x + ox},${s.y + oy})"${op}><polygon points="${buildPolygonPoints(s)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dashAttr}/></g>`);
      } else if (['document', 'database', 'cloud'].includes(s.type)) {
        const paths = buildFlowchartPaths(s)
          .map((d, idx) => `<path d="${d}" fill="${idx === 0 ? fill : 'none'}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dashAttr}/>`)
          .join('');
        bodyParts.push(`<g transform="translate(${s.x + ox},${s.y + oy})"${op}>${paths}</g>`);
      } else {
        const rx = s.type === 'terminator' ? Math.round(Math.min(s.w, s.h) / 2) : s.cornerRadius || 0;
        bodyParts.push(`<rect x="${s.x + ox}" y="${s.y + oy}" width="${s.w}" height="${s.h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}${op}/>`);
        if (s.type === 'subroutine') {
          const inset = Math.min(18, Math.max(10, s.w * 0.1));
          bodyParts.push(`<line x1="${s.x + ox + inset}" y1="${s.y + oy}" x2="${s.x + ox + inset}" y2="${s.y + oy + s.h}" stroke="${stroke}" stroke-width="${strokeWidth}"${op}/>`);
          bodyParts.push(`<line x1="${s.x + ox + s.w - inset}" y1="${s.y + oy}" x2="${s.x + ox + s.w - inset}" y2="${s.y + oy + s.h}" stroke="${stroke}" stroke-width="${strokeWidth}"${op}/>`);
        }
      }
      if (s.label) {
        const isLight = s.fillType !== 'gradient' && LIGHT_FILLS.has((s.fillColor || '#ffffff').toLowerCase());
        const textFill = s.textColor || (isLight ? '#1a1a1a' : '#ffffff');
        const fs = s.fontSize || (s.type === 'text' ? 14 : 14);
        const fw = s.fontWeight ? ` font-weight="${s.fontWeight}"` : '';
        const ta = s.textAlign || (s.type === 'text' ? 'left' : 'center');
        const va = s.textVAlign || (s.type === 'text' ? 'top' : 'middle');
        const anchor = ta === 'left' ? 'start' : ta === 'right' ? 'end' : 'middle';
        const tx = ta === 'left' ? s.x + ox + 8 : ta === 'right' ? s.x + ox + s.w - 8 : s.x + ox + s.w / 2;
        const ty = va === 'top' ? s.y + oy + fs + 6 : va === 'bottom' ? s.y + oy + s.h - 10 : s.y + oy + s.h / 2;
        const domBaseline = va === 'top' ? 'auto' : va === 'bottom' ? 'auto' : 'central';
        const ff = (s.fontFamily || 'sans-serif').replace(/"/g, "'");
        if (s.type === 'text') {
          const lines = s.label.split('\n');
          const tspans = lines
            .map((line, idx) => `<tspan x="${tx}" dy="${idx === 0 ? 0 : Math.round(fs * 1.3)}">${(line || ' ').replace(/</g, '&lt;')}</tspan>`)
            .join('');
          bodyParts.push(`<text x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="${domBaseline}" font-family="${ff}" font-size="${fs}"${fw} fill="${textFill}">${tspans}</text>`);
        } else {
          bodyParts.push(`<text x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="${domBaseline}" font-family="${ff}" font-size="${fs}"${fw} fill="${textFill}">${s.label.replace(/</g, '&lt;')}</text>`);
        }
      }
    });
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`];
    if (defsParts.length > 0) parts.push(`<defs>${defsParts.join('')}</defs>`);
    parts.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);
    parts.push(...bodyParts);
    parts.push('</svg>');
    return parts.join('\n');
  }

  async function exportPngBlob(targetShapes = shapes) {
    const svgText = exportSvgString(targetShapes);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function exportPngBytes() {
    const pngBlob = await exportPngBlob(shapes);
    return new Uint8Array(await pngBlob.arrayBuffer());
  }

  async function copySelectionAsPng() {
    const targets = selectedIds.size > 0 ? expandWithFrameContents(getSelectedShapes()) : shapes;
    if (targets.length === 0) return false;
    const pngBlob = await exportPngBlob(targets);
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      return true;
    }
    return false;
  }

  applyViewportTransform();

  return {
    insertShape,
    insertImage,
    setZoomPercent,
    fitToScreen: () => fitToShapes(shapes),
    fitSelection: () => fitToShapes(getSelectedShapes()),
    getFrames: () => shapes.filter((s) => s.type === 'frame'),
    focusShape: (id) => {
      const target = shapes.find((s) => s.id === id);
      if (!target) return;
      selectShape(id);
      fitToShapes([target]);
    },
    resetView: () => {
      panX = 0;
      panY = 0;
      setZoomPercent(100, { notify: true });
    },
    getData: () => ({ version: 1, panX, panY, zoom, shapes: JSON.parse(JSON.stringify(shapes)) }),
    loadData: (data) => {
      shapes = Array.isArray(data?.shapes) ? JSON.parse(JSON.stringify(data.shapes)) : [];
      panX = typeof data?.panX === 'number' ? data.panX : 0;
      panY = typeof data?.panY === 'number' ? data.panY : 0;
      zoom = typeof data?.zoom === 'number' ? data.zoom : 1;
      selectedIds.clear();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      applyViewportTransform();
      hideMiniBar();
      render();
      onZoomChange?.(Math.round(zoom * 100));
    },
    clear: () => {
      shapes = [];
      panX = 0;
      panY = 0;
      zoom = 1;
      selectedIds.clear();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      applyViewportTransform();
      hideMiniBar();
      render();
      onZoomChange?.(Math.round(zoom * 100));
    },
    exportSvgString,
    exportPngBytes,
    copySelectionAsPng,
    setSnapToGrid: (enabled) => {
      snapToGrid = Boolean(enabled);
    },
    setGridSize: (size) => {
      gridSize = Math.max(8, Number(size) || 24);
      applyViewportTransform();
    },
    setMinimapEnabled: (enabled) => {
      minimapEnabled = Boolean(enabled);
      renderMinimap();
    },
    setAlignGuidesEnabled: (enabled) => {
      alignGuidesEnabled = Boolean(enabled);
      if (!alignGuidesEnabled) activeAlignGuides = [];
    },
    undo,
    redo,
    deleteSelected,
    groupSelected,
    ungroupSelected,
  };
}
