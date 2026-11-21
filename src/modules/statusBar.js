const ZOOM_MIN = 25;
const ZOOM_MAX = 300;
const ZOOM_STEP = 10;

export function createStatusBar({ onZoomChange } = {}) {
  const filenameEl = document.getElementById('status-filename');
  const autoSaveEl = document.getElementById('status-autosave');
  const itemsCountEl = document.getElementById('status-items');
  const zoomOutBtn = document.getElementById('btn-zoom-out');
  const zoomInBtn = document.getElementById('btn-zoom-in');
  const zoomSliderEl = document.getElementById('zoom-slider');
  const zoomResetBtn = document.getElementById('btn-zoom-reset');
  let defaultZoom = 100;
  let currentZoom = 100;
  let currentThemePref = 'light';

  const colorSchemeMedia =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  function clampZoom(percent) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(Number(percent) || 100)));
  }

  function applyZoom(percent, { notify = false } = {}) {
    const clamped = clampZoom(percent);
    currentZoom = clamped;
    if (zoomSliderEl) zoomSliderEl.value = String(clamped);
    if (zoomResetBtn) zoomResetBtn.textContent = `${clamped}%`;
    if (notify) onZoomChange?.(clamped);
  }

  function setDefaultZoom(percent) {
    defaultZoom = clampZoom(percent);
    if (zoomResetBtn) {
      zoomResetBtn.title = `Reset Zoom (${defaultZoom}%)`;
    }
  }

  function resolveEffectiveTheme(theme) {
    if (theme === 'system') {
      return colorSchemeMedia?.matches ? 'dark' : 'light';
    }
    return theme === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const normalized = theme === 'dark' || theme === 'system' ? theme : 'light';
    currentThemePref = normalized;
    document.documentElement.dataset.theme = resolveEffectiveTheme(normalized);
  }

  function initTheme() {
    applyTheme('light');
    colorSchemeMedia?.addEventListener('change', () => {
      if (currentThemePref === 'system') {
        document.documentElement.dataset.theme = resolveEffectiveTheme('system');
      }
    });
  }

  function updateFile({ fileName, isDirty }) {
    if (filenameEl) {
      filenameEl.textContent = isDirty ? `${fileName} *` : fileName;
    }
  }

  function updateItemCount(count) {
    if (itemsCountEl) {
      itemsCountEl.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
    }
  }

  function formatIntervalLabel(seconds) {
    if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
    return `${seconds}s`;
  }

  function setAutoSaveStatus({
    intervalSeconds = 0,
    isSaving = false,
    hasFilePath = false,
    lastSavedAt = null,
  } = {}) {
    if (!autoSaveEl) return;
    autoSaveEl.classList.remove('is-off', 'is-active', 'is-saving');

    if (!intervalSeconds || intervalSeconds <= 0) {
      autoSaveEl.textContent = 'Auto-Save: Off';
      autoSaveEl.title = 'Auto-Save is disabled (change in Settings)';
      autoSaveEl.classList.add('is-off');
      return;
    }

    const intervalLabel = formatIntervalLabel(intervalSeconds);
    if (isSaving) {
      autoSaveEl.textContent = 'Auto-Save: Saving…';
      autoSaveEl.title = `Auto-Saving every ${intervalLabel}`;
      autoSaveEl.classList.add('is-saving');
      return;
    }

    if (!hasFilePath) {
      autoSaveEl.textContent = `Auto-Save: ${intervalLabel} (save file first)`;
      autoSaveEl.title = 'Save this board once to enable automatic saving';
      autoSaveEl.classList.add('is-off');
      return;
    }

    autoSaveEl.classList.add('is-active');
    if (lastSavedAt instanceof Date && !Number.isNaN(lastSavedAt.getTime())) {
      const timeStr = lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      autoSaveEl.textContent = `Auto-Save: ${intervalLabel} • Saved ${timeStr}`;
      autoSaveEl.title = `Auto-Save enabled (every ${intervalLabel}). Last auto-saved at ${timeStr}.`;
    } else {
      autoSaveEl.textContent = `Auto-Save: ${intervalLabel}`;
      autoSaveEl.title = `Auto-Save enabled (every ${intervalLabel})`;
    }
  }

  initTheme();
  applyZoom(100);

  zoomOutBtn?.addEventListener('click', () => applyZoom(currentZoom - ZOOM_STEP, { notify: true }));
  zoomInBtn?.addEventListener('click', () => applyZoom(currentZoom + ZOOM_STEP, { notify: true }));
  zoomSliderEl?.addEventListener('input', () => applyZoom(zoomSliderEl.value, { notify: true }));
  zoomResetBtn?.addEventListener('click', () => applyZoom(defaultZoom, { notify: true }));

  return {
    updateFile,
    updateItemCount,
    setAutoSaveStatus,
    setTheme: (theme) => applyTheme(theme),
    getTheme: () => currentThemePref,
    setZoom: (percent) => applyZoom(percent),
    getZoom: () => currentZoom,
    setDefaultZoom,
  };
}
