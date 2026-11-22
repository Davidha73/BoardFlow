import { invoke } from '@tauri-apps/api/core';

const WORD_CHAR_RE = /[A-Za-z0-9_]/;
let menuEl = null;

function ensureMenuEl() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.className = 'bf-spelling-menu hidden';
  menuEl.setAttribute('role', 'menu');
  document.body.appendChild(menuEl);
  document.addEventListener('mousedown', (e) => {
    if (menuEl && !menuEl.contains(e.target)) {
      closeBoardSpellingMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBoardSpellingMenu();
  });
  return menuEl;
}

export function closeBoardSpellingMenu() {
  if (!menuEl) return;
  menuEl.classList.add('hidden');
  menuEl.innerHTML = '';
}

function resolveDomPoint(segments, globalOffset, isEnd = false) {
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (isEnd ? globalOffset <= seg.end : globalOffset < seg.end) {
      return { node: seg.node, offset: Math.max(0, globalOffset - seg.start) };
    }
  }
  const last = segments[segments.length - 1];
  return last ? { node: last.node, offset: last.node.textContent.length } : null;
}

function isBoundaryMatch(fullText, idx, target) {
  if (WORD_CHAR_RE.test(target[0]) && idx > 0 && WORD_CHAR_RE.test(fullText[idx - 1])) {
    return false;
  }
  const endIdx = idx + target.length;
  if (
    WORD_CHAR_RE.test(target[target.length - 1]) &&
    endIdx < fullText.length &&
    WORD_CHAR_RE.test(fullText[endIdx])
  ) {
    return false;
  }
  return true;
}

function findBestMatchIndex(fullText, target, approxStart) {
  let bestIdx = -1;
  let bestDist = Infinity;
  let pos = 0;
  while (pos <= fullText.length - target.length) {
    const idx = fullText.indexOf(target, pos);
    if (idx < 0) break;
    if (isBoundaryMatch(fullText, idx, target)) {
      const dist = Math.abs(idx - approxStart);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }
    pos = idx + 1;
  }
  return bestIdx;
}

const activeEntriesByEl = new WeakMap();

export function attachLiveSpellcheck(editableEl) {
  if (!editableEl) return () => {};
  editableEl.setAttribute('spellcheck', 'false');

  const host = editableEl.parentElement;
  let layer = null;
  let timer = null;
  let destroyed = false;

  const clearLayer = () => {
    activeEntriesByEl.delete(editableEl);
    if (layer) layer.innerHTML = '';
  };

  const renderIssues = (issues) => {
    if (destroyed || !host || !Array.isArray(issues) || issues.length === 0) {
      clearLayer();
      return;
    }

    const segments = [];
    let fullText = '';
    const walker = document.createTreeWalker(editableEl, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent ? node.textContent.length : 0;
      if (len > 0) {
        const start = fullText.length;
        fullText += node.textContent;
        segments.push({ node, start, end: fullText.length });
      }
      node = walker.nextNode();
    }
    if (segments.length === 0) {
      clearLayer();
      return;
    }

    if (!layer || layer.parentElement !== host) {
      layer?.remove();
      layer = document.createElement('div');
      layer.className = 'bf-spell-underline-layer';
      layer.setAttribute('aria-hidden', 'true');
      host.appendChild(layer);
    }
    layer.innerHTML = '';

    const hostRect = host.getBoundingClientRect();
    const scaleX = host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1;
    const scaleY = host.offsetHeight > 0 ? hostRect.height / host.offsetHeight : 1;
    const entries = [];
    const frag = document.createDocumentFragment();

    for (const issue of issues) {
      if (!issue?.problem_text) continue;
      const idx = findBestMatchIndex(fullText, issue.problem_text, issue.start || 0);
      if (idx < 0) continue;
      const startPt = resolveDomPoint(segments, idx, false);
      const endPt = resolveDomPoint(segments, idx + issue.problem_text.length, true);
      if (!startPt || !endPt) continue;

      const range = document.createRange();
      range.setStart(startPt.node, startPt.offset);
      range.setEnd(endPt.node, endPt.offset);
      entries.push({ issue, range });

      const rects = range.getClientRects();
      const markClass =
        issue.kind === 'Spelling' ? 'bf-spelling-underline-mark' : 'bf-grammar-underline-mark';
      for (let i = 0; i < rects.length; i += 1) {
        const r = rects[i];
        if (r.width < 1 || r.height < 1) continue;
        const mark = document.createElement('span');
        mark.className = markClass;
        mark.style.left = `${(r.left - hostRect.left) / scaleX}px`;
        mark.style.top = `${(r.bottom - hostRect.top) / scaleY - 1}px`;
        mark.style.width = `${r.width / scaleX}px`;
        frag.appendChild(mark);
      }
    }

    activeEntriesByEl.set(editableEl, entries);
    layer.appendChild(frag);
  };

  const runCheck = async () => {
    if (destroyed) return;
    const text = editableEl.innerText || '';
    if (!text.trim()) {
      clearLayer();
      return;
    }
    try {
      const issues = await invoke('check_grammar', { text });
      renderIssues(issues);
    } catch {
      clearLayer();
    }
  };

  const scheduleCheck = (immediate = false) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (immediate) runCheck();
    else timer = setTimeout(runCheck, 350);
  };

  const onInput = () => scheduleCheck(false);
  editableEl.addEventListener('input', onInput);
  editableEl._bfRefreshSpellcheck = () => scheduleCheck(true);
  scheduleCheck(true);

  return () => {
    destroyed = true;
    if (timer) clearTimeout(timer);
    editableEl.removeEventListener('input', onInput);
    delete editableEl._bfRefreshSpellcheck;
    clearLayer();
    layer?.remove();
    closeBoardSpellingMenu();
  };
}

function getWordAtPoint(editableEl, clientX, clientY) {
  if (!document.caretRangeFromPoint) return null;
  const caretRange = document.caretRangeFromPoint(clientX, clientY);
  if (!caretRange || !editableEl.contains(caretRange.startContainer)) return null;
  const node = caretRange.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent || '';
  let start = caretRange.startOffset;
  let end = start;
  const isWordChar = (ch) => /[A-Za-z0-9'’-]/.test(ch);

  if (start > 0 && !isWordChar(text[start] || '') && isWordChar(text[start - 1] || '')) {
    start -= 1;
    end = start;
  }
  if (!isWordChar(text[start] || '')) return null;

  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;

  const word = text.slice(start, end).replace(/^['’-]+|['’-]+$/g, '');
  if (!word || word.length < 2) return null;

  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  return { word, range: wordRange };
}

function getIssueAtPoint(editableEl, clientX, clientY) {
  const entries = activeEntriesByEl.get(editableEl) || [];
  for (const entry of entries) {
    const rects = entry.range?.getClientRects?.();
    if (!rects) continue;
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (
        clientX >= r.left - 3 &&
        clientX <= r.right + 3 &&
        clientY >= r.top - 3 &&
        clientY <= r.bottom + 6
      ) {
        return entry;
      }
    }
  }
  return null;
}

function restoreRange(editableEl, range) {
  editableEl.focus({ preventScroll: true });
  if (!range || !editableEl.contains(range.commonAncestorContainer)) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

export function openBoardSpellingMenu(clientX, clientY, editableEl, { onMutate } = {}) {
  if (!editableEl) return;
  const menu = ensureMenuEl();
  closeBoardSpellingMenu();

  const sel = window.getSelection();
  const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  const hasSelection = Boolean(savedRange && !savedRange.collapsed);
  const wordInfo = getWordAtPoint(editableEl, clientX, clientY);
  const activeIssue = getIssueAtPoint(editableEl, clientX, clientY);

  const targetWord = activeIssue?.issue?.problem_text || wordInfo?.word || '';
  const targetRange = activeIssue?.range || wordInfo?.range || null;
  const issueSuggestions = Array.isArray(activeIssue?.issue?.suggestions)
    ? activeIssue.issue.suggestions
    : [];
  const isFlaggedSpelling = activeIssue?.issue?.kind === 'Spelling';

  if (targetWord && targetRange) {
    const lbl = document.createElement('div');
    lbl.className = 'bf-spelling-menu-label';
    lbl.textContent =
      activeIssue?.issue?.kind && activeIssue.issue.kind !== 'Spelling'
        ? `Grammar · ${targetWord}`
        : `Spelling · ${targetWord}`;
    menu.appendChild(lbl);

    const container = document.createElement('div');
    const loading = document.createElement('div');
    loading.className = 'bf-spelling-menu-status';
    loading.textContent = 'Checking…';
    container.appendChild(loading);
    menu.appendChild(container);

    const sep = document.createElement('div');
    sep.className = 'bf-spelling-menu-sep';
    menu.appendChild(sep);

    invoke('check_word_spelling', { word: targetWord })
      .catch(() => [])
      .then((spellSuggestions) => {
        if (menu.classList.contains('hidden')) return;
        container.innerHTML = '';
        const merged = Array.from(
          new Set([
            ...issueSuggestions,
            ...(Array.isArray(spellSuggestions) ? spellSuggestions : []),
          ])
        );

        if (merged.length === 0 && !activeIssue) {
          const ok = document.createElement('div');
          ok.className = 'bf-spelling-menu-status';
          ok.textContent = 'No spelling issues';
          container.appendChild(ok);
          return;
        }

        for (const sug of merged.slice(0, 5)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'bf-spelling-menu-item is-suggestion';
          btn.textContent = sug;
          btn.addEventListener('mousedown', (ev) => ev.preventDefault());
          btn.addEventListener('click', () => {
            restoreRange(editableEl, targetRange);
            document.execCommand('insertText', false, sug);
            onMutate?.();
            editableEl._bfRefreshSpellcheck?.();
            closeBoardSpellingMenu();
          });
          container.appendChild(btn);
        }

        if (isFlaggedSpelling || merged.length > 0) {
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'bf-spelling-menu-item';
          addBtn.textContent = `Add "${targetWord}" to Dictionary`;
          addBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
          addBtn.addEventListener('click', async () => {
            await invoke('add_word_to_dictionary', { word: targetWord }).catch(() => {});
            editableEl._bfRefreshSpellcheck?.();
            closeBoardSpellingMenu();
          });
          container.appendChild(addBtn);
        }
      });
  }

  const addAction = (label, onClick, disabled = false) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bf-spelling-menu-item';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener('mousedown', (ev) => ev.preventDefault());
    btn.addEventListener('click', () => {
      closeBoardSpellingMenu();
      onClick();
    });
    menu.appendChild(btn);
  };

  addAction(
    'Cut',
    () => {
      restoreRange(editableEl, savedRange);
      document.execCommand('cut');
      onMutate?.();
      editableEl._bfRefreshSpellcheck?.();
    },
    !hasSelection
  );
  addAction(
    'Copy',
    () => {
      restoreRange(editableEl, savedRange);
      document.execCommand('copy');
    },
    !hasSelection
  );
  addAction('Paste', async () => {
    restoreRange(editableEl, savedRange);
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        document.execCommand('insertText', false, text);
        onMutate?.();
        editableEl._bfRefreshSpellcheck?.();
      }
    } catch {
      document.execCommand('paste');
    }
  });

  menu.classList.remove('hidden');
  const rect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
