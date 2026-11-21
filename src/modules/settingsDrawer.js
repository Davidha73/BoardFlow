import { getVersion } from '@tauri-apps/api/app';
import { initNotesModal } from './notesModal.js';
import { saveSettings } from './settingsStore.js';

export function createSettingsDrawer({
  getStartIn,
  getDefaultZoom,
  getGridEnabled,
  getSnapToGrid,
  getGridSize,
  getMinimapEnabled,
  getAlignGuidesEnabled,
  getTheme,
  getAutoSaveInterval,
  onStartInChange,
  onDefaultZoomChange,
  onGridEnabledChange,
  onSnapToGridChange,
  onGridSizeChange,
  onMinimapEnabledChange,
  onAlignGuidesEnabledChange,
  onThemeChange,
  onAutoSaveIntervalChange,
  onClearRecentDocuments,
  onResetWorkspaceLayout,
} = {}) {
  const triggerEl = document.getElementById('btn-settings');
  const closeEl = document.getElementById('btn-close-settings');
  const cancelEl = document.getElementById('btn-cancel-settings');
  const saveEl = document.getElementById('btn-save-settings');
  const drawerEl = document.getElementById('settings-drawer');
  const backdropEl = document.getElementById('settings-backdrop');
  const startInSelectEl = document.getElementById('settings-start-in');
  const defaultZoomSelectEl = document.getElementById('settings-default-zoom');
  const gridEnabledEl = document.getElementById('settings-grid-enabled');
  const snapToGridEl = document.getElementById('settings-snap-grid');
  const gridSizeEl = document.getElementById('settings-grid-size');
  const alignGuidesEl = document.getElementById('settings-align-guides');
  const minimapEnabledEl = document.getElementById('settings-minimap-enabled');
  const themeSelectEl = document.getElementById('settings-theme');
  const autoSaveSelectEl = document.getElementById('settings-autosave');
  const clearRecentBtnEl = document.getElementById('btn-settings-clear-recent');
  const clearRecentStatusEl = document.getElementById('settings-clear-recent-status');
  const resetLayoutBtnEl = document.getElementById('btn-settings-reset-layout');
  const resetLayoutStatusEl = document.getElementById('settings-reset-layout-status');
  const versionEl = document.getElementById('settings-version');

  initNotesModal();

  function flashInlineStatus(el, text) {
    if (!el) return;
    el.textContent = text;
    window.setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 2200);
  }

  if (versionEl) {
    getVersion()
      .then((ver) => {
        if (ver) versionEl.textContent = `v${ver}`;
      })
      .catch(() => {});
  }

  function syncValues() {
    if (startInSelectEl && getStartIn) {
      const val = getStartIn();
      if (val) startInSelectEl.value = val;
    }
    if (defaultZoomSelectEl && getDefaultZoom) {
      const val = getDefaultZoom();
      if (val) defaultZoomSelectEl.value = String(val);
    }
    if (gridEnabledEl && getGridEnabled) {
      gridEnabledEl.checked = Boolean(getGridEnabled());
    }
    if (snapToGridEl && getSnapToGrid) {
      snapToGridEl.checked = Boolean(getSnapToGrid());
    }
    if (gridSizeEl && getGridSize) {
      gridSizeEl.value = String(getGridSize() || 24);
    }
    if (alignGuidesEl && getAlignGuidesEnabled) {
      alignGuidesEl.checked = Boolean(getAlignGuidesEnabled());
    }
    if (minimapEnabledEl && getMinimapEnabled) {
      minimapEnabledEl.checked = Boolean(getMinimapEnabled());
    }
    if (themeSelectEl && getTheme) {
      const val = getTheme();
      if (val) themeSelectEl.value = val;
    }
    if (autoSaveSelectEl && getAutoSaveInterval) {
      autoSaveSelectEl.value = String(getAutoSaveInterval() ?? 0);
    }
  }

  function setOpen(isOpen) {
    if (!drawerEl || !backdropEl) return;
    if (isOpen) syncValues();
    drawerEl.classList.toggle('is-open', isOpen);
    backdropEl.classList.toggle('is-open', isOpen);
    drawerEl.setAttribute('aria-hidden', String(!isOpen));
    backdropEl.setAttribute('aria-hidden', String(!isOpen));
    triggerEl?.setAttribute('aria-expanded', String(isOpen));
  }

  async function commitSettings() {
    const patch = {};
    if (startInSelectEl) patch.startIn = startInSelectEl.value;
    if (defaultZoomSelectEl) patch.defaultZoom = Number(defaultZoomSelectEl.value) || 100;
    if (gridEnabledEl) patch.gridEnabled = gridEnabledEl.checked;
    if (snapToGridEl) patch.snapToGrid = snapToGridEl.checked;
    if (gridSizeEl) patch.gridSize = Number(gridSizeEl.value) || 24;
    if (alignGuidesEl) patch.alignGuidesEnabled = alignGuidesEl.checked;
    if (minimapEnabledEl) patch.minimapEnabled = minimapEnabledEl.checked;
    if (themeSelectEl) patch.theme = themeSelectEl.value;
    if (autoSaveSelectEl) patch.autoSaveInterval = Number(autoSaveSelectEl.value) || 0;

    await saveSettings(patch);

    if (patch.startIn) onStartInChange?.(patch.startIn);
    if (patch.defaultZoom) onDefaultZoomChange?.(patch.defaultZoom);
    if (typeof patch.gridEnabled === 'boolean') onGridEnabledChange?.(patch.gridEnabled);
    if (typeof patch.snapToGrid === 'boolean') onSnapToGridChange?.(patch.snapToGrid);
    if (patch.gridSize) onGridSizeChange?.(patch.gridSize);
    if (typeof patch.alignGuidesEnabled === 'boolean') onAlignGuidesEnabledChange?.(patch.alignGuidesEnabled);
    if (typeof patch.minimapEnabled === 'boolean') onMinimapEnabledChange?.(patch.minimapEnabled);
    if (patch.theme) onThemeChange?.(patch.theme);
    if (typeof patch.autoSaveInterval === 'number') {
      onAutoSaveIntervalChange?.(patch.autoSaveInterval);
    }

    setOpen(false);
  }

  clearRecentBtnEl?.addEventListener('click', async () => {
    await onClearRecentDocuments?.();
    flashInlineStatus(clearRecentStatusEl, 'Cleared');
  });

  resetLayoutBtnEl?.addEventListener('click', () => {
    onResetWorkspaceLayout?.();
    flashInlineStatus(resetLayoutStatusEl, 'Reset');
  });

  saveEl?.addEventListener('click', () => commitSettings());
  cancelEl?.addEventListener('click', () => setOpen(false));
  triggerEl?.addEventListener('click', () => {
    setOpen(!drawerEl?.classList.contains('is-open'));
  });
  closeEl?.addEventListener('click', () => setOpen(false));
  backdropEl?.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerEl?.classList.contains('is-open')) {
      setOpen(false);
    }
  });

  syncValues();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
  };
}
