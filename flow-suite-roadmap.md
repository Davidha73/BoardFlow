# Flow Suite Roadmap & Architecture Notes

## 1. Implemented Foundation
- **WordFlow** (`/Users/davidharries/Projects/WordFlow`) — `.docx`, `.md`, `.html`, `.txt` document editor with native page shapes, grouping, spellcheck/grammar, and `.docx` export.
- **BoardFlow** (`/Users/davidharries/Projects/BoardFlow`) — Infinite pan/zoom whiteboard with sticky notes, shapes, connectors, freehand pen/highlighter, frames, minimap, alignment guides, and `.board`/`.png`/`.svg`/`.pdf` export.
- **Cross-App Linking (`flowLink.js` + Rust `lib.rs`):**
  - **One-Click Handoff:** `write_flow_handoff` / `consume_flow_handoff` via shared `FlowSuite/handoff-<target>.json`, bringing the target app into focus on macOS (`System Events` / `open -a`) and showing toast notifications (`showFlowToast`).
  - **Smart Clipboard:** `<!--FLOW_SUITE:...-->` payload embedded in `text/html` alongside plain-text fallback so `Cmd/Ctrl+C` in BoardFlow pastes as grouped, page-scaled editable shapes in WordFlow, and text from WordFlow pastes as a styled Text Box in BoardFlow.

---

## 2. Central Hub: Flow Dashboard (Launcher)
- **Memory-Saving Design:** Keep only the lightweight **Flow Dashboard** running in the background and open/close suite apps on demand.
- **Core Features:**
  - App launcher cards showing live running status (*Running* / *Closed*) with **Launch**, **Focus**, and **Quit** actions.
  - **Unified Recent Work:** Aggregates per-app recent files (`recents-wordflow.json`, `recents-boardflow.json`, `recents-taskflow.json`) into one sorted list that opens the right app + file directly.
  - **Shared Theme & Suite Preferences:** Sync Light / Dark / System theme across all Flow apps.
  - **At-a-Glance Tasks:** Surface "Due Today" / "In Progress" items from TaskFlow.

---

## 3. Suite Apps Roadmap
- **TaskFlow (Task Tracker PWA → Tauri v2):** Wrap existing Kanban Task Tracker PWA in Tauri v2 with file-based storage, shared UI/settings pattern, and cross-linking (promote notes/board stickies to tasks).
- **NoteFlow (Quick Card-Based Notes):** Google Keep / Apple Notes-style fast capture with cards, checklists, and tags; send cards to BoardFlow as sticky notes, TaskFlow as tasks, or WordFlow to expand into documents.
- **CADFlow (3D Parametric CAD):** Existing 3D parametric CAD app; integrate handoff to send 3D viewport renders or dimensioned orthographic views directly into WordFlow specs and BoardFlow design reviews.

### Future Candidates
- **SheetFlow:** Lightweight spreadsheets, formulas, CSV/XLSX import/export, and charts that can be sent to WordFlow or BoardFlow.
- **SlideFlow:** Presentation decks reusing the BoardFlow/WordFlow shape & text engine (e.g., exporting BoardFlow Frames as slides).
- **TimeFlow:** Minimal timer / Pomodoro tracker linked to TaskFlow tasks, feeding daily focus summaries to the Dashboard.
- **ClipFlow:** Shared snippet, SVG, image, and palette vault accessible across all Flow apps.
