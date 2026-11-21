import { invoke } from '@tauri-apps/api/core';

const MAX_RECENT_BOARDS = 25;
const DEFAULTS = {
  startIn: 'board',
  theme: 'light',
  defaultZoom: 100,
  zoom: 100,
  gridEnabled: true,
  snapToGrid: false,
  gridSize: 24,
  minimapEnabled: true,
  alignGuidesEnabled: true,
  autoSaveInterval: 0,
  customTemplates: [],
  recentDocuments: [],
  lastSeenVersion: '',
  toolbarLayout: {},
  toolbarHidden: [],
  window: {
    width: 1120,
    height: 760,
    x: null,
    y: null,
    maximized: false,
  },
};

function cloneDefaults() {
  return {
    ...DEFAULTS,
    customTemplates: [],
    recentDocuments: [],
    toolbarLayout: {},
    toolbarHidden: [],
    window: { ...DEFAULTS.window },
  };
}

let cachedSettings = cloneDefaults();

export function getSettingsSnapshot() {
  return {
    ...cachedSettings,
    customTemplates: [...(cachedSettings.customTemplates || [])],
    recentDocuments: [...(cachedSettings.recentDocuments || [])],
    toolbarLayout: { ...(cachedSettings.toolbarLayout || {}) },
    toolbarHidden: [...(cachedSettings.toolbarHidden || [])],
    window: { ...DEFAULTS.window, ...(cachedSettings.window || {}) },
  };
}

export async function loadSettings() {
  try {
    const raw = await invoke('read_settings_file');
    if (!raw || !raw.trim()) {
      cachedSettings = cloneDefaults();
      await saveSettings(cachedSettings);
      return getSettingsSnapshot();
    }
    const parsed = JSON.parse(raw);
    const valid = parsed && typeof parsed === 'object' ? parsed : {};
    cachedSettings = {
      ...cloneDefaults(),
      ...valid,
      toolbarLayout:
        valid.toolbarLayout && typeof valid.toolbarLayout === 'object'
          ? { ...valid.toolbarLayout }
          : {},
      toolbarHidden: Array.isArray(valid.toolbarHidden) ? [...valid.toolbarHidden] : [],
      window: {
        ...DEFAULTS.window,
        ...(valid.window && typeof valid.window === 'object' ? valid.window : {}),
      },
    };
    return getSettingsSnapshot();
  } catch {
    cachedSettings = cloneDefaults();
    return getSettingsSnapshot();
  }
}

export async function saveSettings(patch) {
  cachedSettings = {
    ...cachedSettings,
    ...patch,
    window: patch?.window
      ? { ...cachedSettings.window, ...patch.window }
      : { ...cachedSettings.window },
  };
  try {
    await invoke('write_settings_file', {
      contents: JSON.stringify(cachedSettings, null, 2),
    });
  } catch {
    // Ignore write errors outside Tauri runtime
  }
  return getSettingsSnapshot();
}

export function getRecentDocuments() {
  return Array.isArray(cachedSettings.recentDocuments) ? [...cachedSettings.recentDocuments] : [];
}

export async function addRecentDocument(filePath, metadata = {}) {
  if (!filePath || typeof filePath !== 'string') return getRecentDocuments();
  const parts = filePath.split(/[/\\]/);
  const name = parts[parts.length - 1] || filePath;
  const entry = {
    path: filePath,
    name,
    mode: metadata.mode || 'board',
    size: typeof metadata.size === 'number' ? metadata.size : null,
    modifiedAt: metadata.modifiedAt || null,
    openedAt: new Date().toISOString(),
  };
  const next = [
    entry,
    ...getRecentDocuments().filter((item) => item?.path && item.path !== filePath),
  ].slice(0, MAX_RECENT_BOARDS);
  await saveSettings({ recentDocuments: next });
  return next;
}

export async function removeRecentDocument(filePath) {
  if (!filePath || typeof filePath !== 'string') return getRecentDocuments();
  const next = getRecentDocuments().filter((item) => item?.path && item.path !== filePath);
  await saveSettings({ recentDocuments: next });
  return next;
}

export async function clearRecentDocuments() {
  await saveSettings({ recentDocuments: [] });
  return [];
}

export function getCustomTemplates() {
  return Array.isArray(cachedSettings.customTemplates) ? [...cachedSettings.customTemplates] : [];
}

export async function addCustomTemplate({ title, desc = '', shapes = [] }) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return getCustomTemplates();
  const entry = {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTitle,
    desc: String(desc || '').trim() || 'Saved board template',
    shapes: Array.isArray(shapes) ? shapes : [],
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...getCustomTemplates().filter((t) => t?.title !== cleanTitle)];
  await saveSettings({ customTemplates: next });
  return next;
}

export async function removeCustomTemplate(id) {
  if (!id) return getCustomTemplates();
  const next = getCustomTemplates().filter((t) => t?.id !== id);
  await saveSettings({ customTemplates: next });
  return next;
}
