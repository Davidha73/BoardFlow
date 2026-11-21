import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { readFile } from '@tauri-apps/plugin-fs';
import { initIcons } from './modules/icons.js';
import {
  addCustomTemplate,
  clearRecentDocuments,
  getCustomTemplates,
  getRecentDocuments,
  loadSettings,
  removeCustomTemplate,
  removeRecentDocument,
  saveSettings,
} from './modules/settingsStore.js';
import { createStatusBar } from './modules/statusBar.js';
import { createSettingsDrawer } from './modules/settingsDrawer.js';
import { createRecentDocsView, STARTER_TEMPLATES } from './modules/recentDocsView.js';
import { initWindowState } from './modules/windowState.js';
import { initDockableToolbars } from './modules/dockableToolbars.js';
import { createBoardCanvas } from './modules/boardCanvas.js';
import { createFileService } from './modules/fileService.js';

async function initApp() {
  initIcons();
  const initialSettings = await loadSettings();
  const appShellEl = document.querySelector('.app-shell');

  let board = null;
  let fileService = null;
  let autoSaveInterval = Number(initialSettings.autoSaveInterval) || 0;
  let autoSaveTimerId = 0;
  let lastAutoSavedAt = null;
  let isAutoSaving = false;
  let currentStartIn = initialSettings.startIn || 'board';
  let currentDefaultZoom = initialSettings.defaultZoom || 100;
  let gridEnabled = initialSettings.gridEnabled !== false;
  let snapToGrid = Boolean(initialSettings.snapToGrid);
  let gridSize = Number(initialSettings.gridSize) || 24;
  let minimapEnabled = initialSettings.minimapEnabled !== false;
  let alignGuidesEnabled = initialSettings.alignGuidesEnabled !== false;

  const statusBar = createStatusBar({
    onZoomChange: (zoom) => {
      board?.setZoomPercent(zoom);
      saveSettings({ zoom });
    },
  });
  if (initialSettings.theme) statusBar.setTheme(initialSettings.theme);
  statusBar.setDefaultZoom(currentDefaultZoom);
  statusBar.setZoom(currentDefaultZoom);

  initWindowState(initialSettings.window, (windowPatch) => saveSettings({ window: windowPatch }));

  const viewportEl = document.getElementById('board-viewport');
  viewportEl?.setAttribute('data-grid', String(gridEnabled));

  board = createBoardCanvas({
    viewportEl,
    stageEl: document.getElementById('board-stage'),
    layerEl: document.getElementById('board-shapes-layer'),
    miniBarEl: document.getElementById('shape-mini-toolbar'),
    onMutate: () => fileService?.markDirty(true),
    onZoomChange: (zoom) => {
      statusBar.setZoom(zoom);
      saveSettings({ zoom });
    },
    onItemCountChange: (count) => statusBar.updateItemCount(count),
  });
  board.setZoomPercent(currentDefaultZoom);
  board.setSnapToGrid(snapToGrid);
  board.setGridSize(gridSize);
  board.setMinimapEnabled(minimapEnabled);
  board.setAlignGuidesEnabled(alignGuidesEnabled);

  const dockableToolbars = initDockableToolbars({ appShellEl });

  function syncAutoSaveStatus() {
    statusBar.setAutoSaveStatus({
      intervalSeconds: autoSaveInterval,
      isSaving: isAutoSaving,
      hasFilePath: Boolean(fileService?.hasFilePath?.()),
      lastSavedAt: lastAutoSavedAt,
    });
  }

  function applyAutoSaveInterval(seconds) {
    autoSaveInterval = Number(seconds) || 0;
    if (autoSaveTimerId) {
      window.clearInterval(autoSaveTimerId);
      autoSaveTimerId = 0;
    }
    if (autoSaveInterval > 0) {
      autoSaveTimerId = window.setInterval(async () => {
        if (isAutoSaving || !fileService?.isDirty() || !fileService?.hasFilePath()) return;
        isAutoSaving = true;
        syncAutoSaveStatus();
        try {
          if (await fileService.saveDocument(false)) lastAutoSavedAt = new Date();
        } finally {
          isAutoSaving = false;
          syncAutoSaveStatus();
        }
      }, autoSaveInterval * 1000);
    }
    syncAutoSaveStatus();
  }
  applyAutoSaveInterval(autoSaveInterval);

  const recentDocsView = createRecentDocsView({
    containerEl: document.getElementById('recent-docs-view'),
    onOpenFile: (path) => fileService?.openFileByPath(path),
    onNewDocument: () => fileService?.newDocument(),
    onNewTemplate: (tpl) => fileService?.newFromTemplate(tpl),
    getCustomTemplates,
    onDeleteTemplate: async (id) => {
      await removeCustomTemplate(id);
      recentDocsView.render(getRecentDocuments());
    },
    onOpenDialog: () => fileService?.openDocument(),
    onClearRecent: async () => {
      await clearRecentDocuments();
      recentDocsView.render([]);
    },
    onRemoveRecent: async (path) => {
      const next = await removeRecentDocument(path);
      recentDocsView.render(next);
    },
    onCopyPath: (path) => path && navigator.clipboard?.writeText(path),
    onShowInExplorer: (path) => path && invoke('show_in_explorer', { path }).catch(() => {}),
  });

  createSettingsDrawer({
    getStartIn: () => currentStartIn,
    getDefaultZoom: () => currentDefaultZoom,
    getGridEnabled: () => gridEnabled,
    getSnapToGrid: () => snapToGrid,
    getGridSize: () => gridSize,
    getMinimapEnabled: () => minimapEnabled,
    getAlignGuidesEnabled: () => alignGuidesEnabled,
    getTheme: () => statusBar.getTheme?.() || 'light',
    getAutoSaveInterval: () => autoSaveInterval,
    onStartInChange: (startIn) => {
      currentStartIn = startIn;
    },
    onDefaultZoomChange: (zoom) => {
      currentDefaultZoom = zoom;
      statusBar.setDefaultZoom(zoom);
      statusBar.setZoom(zoom);
      board.setZoomPercent(zoom);
      saveSettings({ zoom });
    },
    onGridEnabledChange: (enabled) => {
      gridEnabled = Boolean(enabled);
      viewportEl?.setAttribute('data-grid', String(gridEnabled));
    },
    onSnapToGridChange: (enabled) => {
      snapToGrid = Boolean(enabled);
      board.setSnapToGrid(snapToGrid);
    },
    onGridSizeChange: (size) => {
      gridSize = Number(size) || 24;
      board.setGridSize(gridSize);
    },
    onMinimapEnabledChange: (enabled) => {
      minimapEnabled = Boolean(enabled);
      board.setMinimapEnabled(minimapEnabled);
    },
    onAlignGuidesEnabledChange: (enabled) => {
      alignGuidesEnabled = Boolean(enabled);
      board.setAlignGuidesEnabled(alignGuidesEnabled);
    },
    onThemeChange: (theme) => statusBar.setTheme(theme),
    onAutoSaveIntervalChange: (seconds) => applyAutoSaveInterval(seconds),
    onClearRecentDocuments: async () => {
      await clearRecentDocuments();
      recentDocsView.render([]);
    },
    onResetWorkspaceLayout: () => {
      dockableToolbars?.resetLayout?.();
      dockableToolbars?.syncDividers?.();
    },
  });

  const saveBtnEl = document.getElementById('btn-save');
  const saveAsBtnEl = document.getElementById('btn-save-as');
  const saveTemplateBtnEl = document.getElementById('btn-save-template');
  const duplicateBtnEl = document.getElementById('btn-duplicate');
  const renameBtnEl = document.getElementById('btn-rename');
  const revertBtnEl = document.getElementById('btn-revert');
  const showFinderBtnEl = document.getElementById('btn-show-finder');
  const convertBtnEl = document.getElementById('btn-convert');
  const convertPopoverEl = document.getElementById('convert-popover');
  const closeBtnEl = document.getElementById('btn-close');
  const printBtnEl = document.getElementById('btn-print');

  fileService = createFileService({
    board,
    initialHasOpenDocument: currentStartIn !== 'start-page',
    onStateChange: ({ fileName, isDirty, hasOpenDocument }) => {
      appShellEl?.setAttribute('data-has-document', String(hasOpenDocument));
      if (saveBtnEl) saveBtnEl.disabled = !hasOpenDocument;
      if (saveAsBtnEl) saveAsBtnEl.disabled = !hasOpenDocument;
      if (saveTemplateBtnEl) saveTemplateBtnEl.disabled = !hasOpenDocument;
      if (duplicateBtnEl) duplicateBtnEl.disabled = !hasOpenDocument;
      if (renameBtnEl) renameBtnEl.disabled = !hasOpenDocument;
      const hasSavedFile = Boolean(hasOpenDocument && fileService?.hasFilePath?.());
      if (revertBtnEl) revertBtnEl.disabled = !hasSavedFile;
      if (showFinderBtnEl) showFinderBtnEl.disabled = !hasSavedFile;
      if (convertBtnEl) convertBtnEl.disabled = !hasOpenDocument;
      if (closeBtnEl) closeBtnEl.disabled = !hasOpenDocument;
      if (printBtnEl) printBtnEl.disabled = !hasOpenDocument;

      const pillNameEl = document.getElementById('doc-pill-name');
      const pillDirtyEl = document.getElementById('doc-pill-dirty');
      if (pillNameEl) pillNameEl.textContent = hasOpenDocument ? fileName : 'No Board';
      if (pillDirtyEl) pillDirtyEl.classList.toggle('is-dirty', Boolean(hasOpenDocument && isDirty));
      recentDocsView.render(getRecentDocuments());
      statusBar.updateFile({ fileName, isDirty });
      syncAutoSaveStatus();
      document.title = '';
    },
  });

  // Pill menu + submenus
  const pillMenuWrapEl = document.getElementById('doc-pill-menu-wrap');
  const pillTriggerEl = document.getElementById('doc-pill-trigger');
  const pillMenuEl = document.getElementById('doc-pill-menu');
  const templateBtnEl = document.getElementById('btn-new-template');
  const templatePopoverEl = document.getElementById('template-popover');
  const recentBtnEl = document.getElementById('btn-open-recent');
  const recentPopoverEl = document.getElementById('recent-popover');

  const closePillMenu = () => {
    pillMenuEl?.classList.remove('is-open');
    pillTriggerEl?.setAttribute('aria-expanded', 'false');
    templatePopoverEl?.classList.remove('is-open');
    recentPopoverEl?.classList.remove('is-open');
    convertPopoverEl?.classList.remove('is-open');
  };

  pillTriggerEl?.addEventListener('click', () => {
    const willOpen = !pillMenuEl?.classList.contains('is-open');
    closePillMenu();
    if (willOpen) {
      pillMenuEl?.classList.add('is-open');
      pillTriggerEl.setAttribute('aria-expanded', 'true');
    }
  });

  pillMenuEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || ['btn-convert', 'btn-new-template', 'btn-open-recent'].includes(btn.id)) return;
    closePillMenu();
  });

  document.addEventListener('mousedown', (e) => {
    if (pillMenuWrapEl && !pillMenuWrapEl.contains(e.target)) closePillMenu();
  });

  document.getElementById('btn-new')?.addEventListener('click', () => fileService.newDocument());
  document.getElementById('btn-open')?.addEventListener('click', () => fileService.openDocument());
  saveBtnEl?.addEventListener('click', () => fileService.saveDocument(false));
  saveAsBtnEl?.addEventListener('click', () => fileService.saveDocument(true));
  duplicateBtnEl?.addEventListener('click', () => fileService.duplicateDocument());
  revertBtnEl?.addEventListener('click', () => fileService.revertDocument());
  showFinderBtnEl?.addEventListener('click', () => {
    const p = fileService.getCurrentPath();
    if (p) invoke('show_in_explorer', { path: p }).catch(() => {});
  });
  closeBtnEl?.addEventListener('click', () => fileService.closeDocument());
  printBtnEl?.addEventListener('click', () => fileService.printDocument());

  convertBtnEl?.addEventListener('click', () => {
    const willOpen = !convertPopoverEl?.classList.contains('is-open');
    templatePopoverEl?.classList.remove('is-open');
    recentPopoverEl?.classList.remove('is-open');
    convertPopoverEl?.classList.toggle('is-open', willOpen);
  });

  convertPopoverEl?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-export-format]');
    if (!item) return;
    closePillMenu();
    const fmt = item.dataset.exportFormat;
    if (fmt === 'pdf') fileService.printDocument();
    else fileService.exportBoard(fmt);
  });

  templateBtnEl?.addEventListener('click', () => {
    if (!templatePopoverEl) return;
    templatePopoverEl.innerHTML = '';
    [...STARTER_TEMPLATES, ...getCustomTemplates()].forEach((tpl) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'convert-menu-item';
      btn.textContent = tpl.title;
      btn.addEventListener('click', () => {
        closePillMenu();
        fileService.newFromTemplate(tpl);
      });
      templatePopoverEl.appendChild(btn);
    });
    recentPopoverEl?.classList.remove('is-open');
    convertPopoverEl?.classList.remove('is-open');
    templatePopoverEl.classList.toggle('is-open');
  });

  recentBtnEl?.addEventListener('click', () => {
    if (!recentPopoverEl) return;
    recentPopoverEl.innerHTML = '';
    const recents = getRecentDocuments().slice(0, 8);
    if (recents.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'convert-menu-empty';
      empty.textContent = 'No recent boards';
      recentPopoverEl.appendChild(empty);
    } else {
      recents.forEach((doc) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'convert-menu-item';
        btn.textContent = doc.name || doc.path;
        btn.addEventListener('click', () => {
          closePillMenu();
          fileService.openFileByPath(doc.path);
        });
        recentPopoverEl.appendChild(btn);
      });
    }
    templatePopoverEl?.classList.remove('is-open');
    convertPopoverEl?.classList.remove('is-open');
    recentPopoverEl.classList.toggle('is-open');
  });

  // Rename & Save-as-Template modals
  const renameModalEl = document.getElementById('rename-modal');
  const renameBackdropEl = document.getElementById('rename-modal-backdrop');
  const renameInputEl = document.getElementById('rename-input');
  const closeRename = () => {
    renameModalEl?.classList.remove('is-open');
    renameBackdropEl?.classList.remove('is-open');
  };
  renameBtnEl?.addEventListener('click', () => {
    if (!renameInputEl) return;
    renameInputEl.value = fileService.getCurrentFileName() || 'Untitled.board';
    renameModalEl?.classList.add('is-open');
    renameBackdropEl?.classList.add('is-open');
    renameInputEl.focus();
    renameInputEl.select();
  });
  document.getElementById('btn-close-rename')?.addEventListener('click', closeRename);
  document.getElementById('btn-cancel-rename')?.addEventListener('click', closeRename);
  renameBackdropEl?.addEventListener('click', closeRename);
  document.getElementById('btn-confirm-rename')?.addEventListener('click', async () => {
    if (await fileService.renameDocument(renameInputEl?.value)) closeRename();
  });

  const tplModalEl = document.getElementById('template-modal');
  const tplBackdropEl = document.getElementById('template-modal-backdrop');
  const tplNameEl = document.getElementById('template-name-input');
  const tplDescEl = document.getElementById('template-desc-input');
  const closeTpl = () => {
    tplModalEl?.classList.remove('is-open');
    tplBackdropEl?.classList.remove('is-open');
  };
  saveTemplateBtnEl?.addEventListener('click', () => {
    if (!tplNameEl) return;
    tplNameEl.value = (fileService.getCurrentFileName() || 'My Template').replace(/\.[a-z0-9]+$/i, '');
    if (tplDescEl) tplDescEl.value = '';
    tplModalEl?.classList.add('is-open');
    tplBackdropEl?.classList.add('is-open');
    tplNameEl.focus();
  });
  document.getElementById('btn-close-template')?.addEventListener('click', closeTpl);
  document.getElementById('btn-cancel-template')?.addEventListener('click', closeTpl);
  tplBackdropEl?.addEventListener('click', closeTpl);
  document.getElementById('btn-confirm-template')?.addEventListener('click', async () => {
    const title = tplNameEl?.value?.trim();
    if (!title) return;
    await addCustomTemplate({
      title,
      desc: tplDescEl?.value?.trim() || '',
      shapes: board.getData().shapes,
    });
    recentDocsView.render(getRecentDocuments());
    closeTpl();
  });

  // Insert & Arrange actions
  document.getElementById('btn-insert-sticky')?.addEventListener('click', () => board.insertShape('sticky'));
  document.getElementById('btn-insert-text')?.addEventListener('click', () => board.insertShape('text'));
  document.getElementById('btn-insert-frame')?.addEventListener('click', () => board.insertShape('frame'));
  document.getElementById('btn-board-copy-png')?.addEventListener('click', () => board.copySelectionAsPng());
  const shapesBtnEl = document.getElementById('btn-insert-shape');
  const shapesPopoverEl = document.getElementById('shapes-popover');
  shapesBtnEl?.addEventListener('click', () => shapesPopoverEl?.classList.toggle('is-open'));
  shapesPopoverEl?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-shape-type]');
    if (!item) return;
    shapesPopoverEl.classList.remove('is-open');
    board.insertShape(item.dataset.shapeType);
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#shapes-insert-wrap')) shapesPopoverEl?.classList.remove('is-open');
  });

  document.getElementById('btn-fit-screen')?.addEventListener('click', () => board.fitToScreen());
  document.getElementById('btn-reset-view')?.addEventListener('click', () => board.resetView());

  const frameNavBtnEl = document.getElementById('btn-frame-nav');
  const frameNavPopoverEl = document.getElementById('frame-nav-popover');
  const closeFrameNav = () => {
    frameNavPopoverEl?.classList.remove('is-open');
    frameNavBtnEl?.setAttribute('aria-expanded', 'false');
  };
  frameNavBtnEl?.addEventListener('click', () => {
    const willOpen = !frameNavPopoverEl?.classList.contains('is-open');
    if (!willOpen) {
      closeFrameNav();
      return;
    }
    if (frameNavPopoverEl) {
      const frames = board.getFrames();
      frameNavPopoverEl.innerHTML = '';
      if (frames.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'frame-nav-empty';
        empty.textContent = 'No frames on board';
        frameNavPopoverEl.appendChild(empty);
      } else {
        frames.forEach((f) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'shape-menu-item';
          btn.textContent = f.label || 'Frame';
          btn.addEventListener('click', () => {
            closeFrameNav();
            board.focusShape(f.id);
          });
          frameNavPopoverEl.appendChild(btn);
        });
      }
      frameNavPopoverEl.classList.add('is-open');
      frameNavBtnEl.setAttribute('aria-expanded', 'true');
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#frame-nav-wrap')) closeFrameNav();
  });

  // Image insert, paste & drop
  const imageInputEl = document.getElementById('image-file-input');
  const embedImageDataUrl = (dataUrl, alt = 'Image') => {
    const img = new Image();
    img.onload = () => {
      const scale = img.naturalWidth > 480 ? 480 / img.naturalWidth : 1;
      board.insertImage({
        src: dataUrl,
        alt,
        width: Math.round((img.naturalWidth || 240) * scale),
        height: Math.round((img.naturalHeight || 180) * scale),
      });
    };
    img.src = dataUrl;
  };
  document.getElementById('btn-insert-image')?.addEventListener('click', () => {
    if (imageInputEl) {
      imageInputEl.value = '';
      imageInputEl.click();
    }
  });
  imageInputEl?.addEventListener('change', () => {
    Array.from(imageInputEl.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' && embedImageDataUrl(reader.result, file.name);
      reader.readAsDataURL(file);
    });
  });
  document.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type?.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' && embedImageDataUrl(reader.result, file.name);
      reader.readAsDataURL(file);
    });
  });

  // Focus mode
  const focusBtn = document.getElementById('btn-focus-mode');
  let focusMode = false;
  focusBtn?.addEventListener('click', () => {
    focusMode = !focusMode;
    appShellEl?.setAttribute('data-focus-mode', String(focusMode));
    focusBtn.classList.toggle('is-active', focusMode);
    focusBtn.setAttribute('aria-pressed', String(focusMode));
  });

  // Tauri file drop
  const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  getCurrentWebview()
    .onDragDropEvent(async (event) => {
      if (event.payload.type !== 'drop') return;
      const paths = event.payload.paths || [];
      if (paths.length === 0) return;
      const hasOpen = appShellEl?.getAttribute('data-has-document') !== 'false';
      const imgPaths = paths.filter((p) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p || ''));
      if (hasOpen && imgPaths.length > 0) {
        for (const p of imgPaths) {
          const ext = p.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
          const mime = MIME_BY_EXT[ext];
          if (!mime) continue;
          const bytes = await readFile(p);
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          }
          embedImageDataUrl(`data:${mime};base64,${btoa(bin)}`, p.split(/[/\\]/).pop());
        }
      } else {
        fileService.openFileByPath(paths[0]);
      }
    })
    .catch(() => {});

  // Shortcuts
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') {
      e.preventDefault();
      fileService.saveDocument(e.shiftKey);
    } else if (k === 'o') {
      e.preventDefault();
      fileService.openDocument();
    } else if (k === 'n') {
      e.preventDefault();
      fileService.newDocument();
    } else if (k === 'w') {
      e.preventDefault();
      fileService.closeDocument();
    } else if (k === 'p') {
      e.preventDefault();
      fileService.printDocument();
    } else if (k === 'f' && e.shiftKey) {
      e.preventDefault();
      focusBtn?.click();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
