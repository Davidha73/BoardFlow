import { invoke } from '@tauri-apps/api/core';
import { open, save, confirm, message } from '@tauri-apps/plugin-dialog';
import { exists, readTextFile, rename, stat, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { addRecentDocument, removeRecentDocument } from './settingsStore.js';

function getBasename(filePath) {
  if (!filePath) return 'Untitled.board';
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || 'Untitled.board';
}

export function createFileService({ board, onStateChange, initialHasOpenDocument = true }) {
  let currentPath = null;
  let customUntitledName = null;
  let isDirty = false;
  let hasOpenDocument = Boolean(initialHasOpenDocument);

  async function notify() {
    await onStateChange?.({
      filePath: currentPath,
      fileName: currentPath ? getBasename(currentPath) : customUntitledName || 'Untitled.board',
      isDirty,
      hasOpenDocument,
    });
  }

  function markDirty(dirty = true) {
    if (!hasOpenDocument) return;
    const next = Boolean(dirty);
    if (isDirty !== next) {
      isDirty = next;
      notify();
    }
  }

  async function recordRecentFile(filePath) {
    let size = null;
    let modifiedAt = null;
    try {
      const info = await stat(filePath);
      if (typeof info?.size === 'number') size = info.size;
      if (info?.mtime) {
        const d = info.mtime instanceof Date ? info.mtime : new Date(info.mtime);
        if (!Number.isNaN(d.getTime())) modifiedAt = d.toISOString();
      }
    } catch {
      // Ignore stat errors
    }
    await addRecentDocument(filePath, { mode: 'board', size, modifiedAt });
  }

  async function confirmDiscardIfDirty() {
    if (!isDirty) return true;
    return confirm('You have unsaved changes. Discard them and continue?', {
      title: 'Unsaved Changes',
      kind: 'warning',
    });
  }

  async function newDocument() {
    const ok = await confirmDiscardIfDirty();
    if (!ok) return;
    hasOpenDocument = true;
    currentPath = null;
    customUntitledName = null;
    isDirty = false;
    board.clear();
    await notify();
  }

  async function newFromTemplate(tpl) {
    const ok = await confirmDiscardIfDirty();
    if (!ok) return;
    hasOpenDocument = true;
    currentPath = null;
    customUntitledName = null;
    board.loadData({ shapes: tpl?.shapes || [] });
    isDirty = true;
    await notify();
  }

  async function duplicateDocument() {
    if (!hasOpenDocument) return;
    const data = board.getData();
    const baseName = getBasename(currentPath);
    hasOpenDocument = true;
    currentPath = null;
    customUntitledName = 'Copy of ' + baseName;
    board.loadData(data);
    isDirty = true;
    await notify();
  }

  async function openFileByPath(filePath) {
    if (!filePath) return;
    const ok = await confirmDiscardIfDirty();
    if (!ok) return;
    try {
      const raw = await readTextFile(filePath);
      const parsed = JSON.parse(raw);
      board.loadData(parsed);
      hasOpenDocument = true;
      currentPath = filePath;
      customUntitledName = null;
      isDirty = false;
      await recordRecentFile(filePath);
      await notify();
    } catch (err) {
      await message(`Failed to open board: ${err?.message || err}`, {
        title: 'Open Error',
        kind: 'error',
      });
    }
  }

  async function openDocument() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'BoardFlow Board', extensions: ['board', 'json'] }],
    });
    if (selected) {
      await openFileByPath(typeof selected === 'string' ? selected : selected.path);
    }
  }

  async function saveDocument(forceSaveAs = false) {
    if (!hasOpenDocument) return false;
    let targetPath = forceSaveAs ? null : currentPath;
    if (!targetPath) {
      targetPath = await save({
        defaultPath: customUntitledName || 'Untitled.board',
        filters: [{ name: 'BoardFlow Board', extensions: ['board'] }],
      });
      if (!targetPath) return false;
    }
    try {
      const json = JSON.stringify(board.getData(), null, 2);
      await writeTextFile(targetPath, json);
      currentPath = targetPath;
      customUntitledName = null;
      isDirty = false;
      await recordRecentFile(targetPath);
      await notify();
      return true;
    } catch (err) {
      await message(`Failed to save board: ${err?.message || err}`, {
        title: 'Save Error',
        kind: 'error',
      });
      return false;
    }
  }

  async function exportBoard(format) {
    if (!hasOpenDocument) return;
    const base = (currentPath ? getBasename(currentPath) : customUntitledName || 'Untitled').replace(/\.[a-z0-9]+$/i, '');
    const ext = format === 'svg' ? 'svg' : 'png';
    const targetPath = await save({
      defaultPath: `${base}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (!targetPath) return;
    try {
      if (ext === 'svg') {
        await writeTextFile(targetPath, board.exportSvgString());
      } else {
        const bytes = await board.exportPngBytes();
        await writeFile(targetPath, bytes);
      }
    } catch (err) {
      await message(`Failed to export ${ext.toUpperCase()}: ${err?.message || err}`, {
        title: 'Export Error',
        kind: 'error',
      });
    }
  }

  async function renameDocument(nextNameRaw) {
    if (!hasOpenDocument) return false;
    const trimmed = String(nextNameRaw || '').trim();
    if (!trimmed) return false;
    const finalName = /\.[a-z0-9]+$/i.test(trimmed) ? trimmed : `${trimmed}.board`;
    if (!currentPath) {
      customUntitledName = finalName;
      await notify();
      return true;
    }
    const sepIdx = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\'));
    const dir = sepIdx >= 0 ? currentPath.slice(0, sepIdx + 1) : '';
    const nextPath = `${dir}${finalName}`;
    if (nextPath === currentPath) return true;
    try {
      if (await exists(nextPath)) {
        await message(`A file named "${finalName}" already exists in this folder.`, {
          title: 'Rename Failed',
          kind: 'error',
        });
        return false;
      }
      const oldPath = currentPath;
      await rename(oldPath, nextPath);
      currentPath = nextPath;
      await removeRecentDocument(oldPath);
      await recordRecentFile(nextPath);
      await notify();
      return true;
    } catch (err) {
      await message(`Unable to rename file: ${err?.message || err}`, {
        title: 'Rename Error',
        kind: 'error',
      });
      return false;
    }
  }

  async function revertDocument() {
    if (!hasOpenDocument || !currentPath) return;
    const ok = await confirmDiscardIfDirty();
    if (!ok) return;
    isDirty = false;
    await openFileByPath(currentPath);
  }

  async function closeDocument() {
    if (!hasOpenDocument) return;
    const ok = await confirmDiscardIfDirty();
    if (!ok) return;
    hasOpenDocument = false;
    currentPath = null;
    customUntitledName = null;
    isDirty = false;
    board.clear();
    await notify();
  }

  async function printDocument() {
    if (!hasOpenDocument) return;
    try {
      await invoke('print_document');
    } catch {
      window.print();
    }
  }

  notify();

  return {
    newDocument,
    newFromTemplate,
    duplicateDocument,
    openDocument,
    openFileByPath,
    saveDocument,
    exportBoard,
    renameDocument,
    revertDocument,
    closeDocument,
    printDocument,
    markDirty,
    isDirty: () => isDirty,
    hasFilePath: () => Boolean(currentPath),
    getCurrentPath: () => currentPath,
    getCurrentFileName: () =>
      currentPath ? getBasename(currentPath) : customUntitledName || 'Untitled.board',
  };
}
