## [2026-11-22]

- **Status:**
  - Created **FlowDash** (`/Users/davidharries/Projects/FlowDash`) as the unified Flow Suite launcher & Start Page (left-hand filterable app cards, `3px` running accent bar, top-right corner switch-to badge, 3-dot `Close App` menu, 5-recent / 4-template `More…` modals, centered Settings modal).
  - Shared `FlowDash/src/styles/theme.css` across FlowDash, WordFlow, and BoardFlow via `@import` + `vite.config.js` `fs.allow`.
  - Shared `FlowSuite/custom_dictionary.txt` in WordFlow's `spellcheck.rs` + `grammar.rs`.
  - Removed duplicate Start Pages from BoardFlow & WordFlow; wired `return_to_flowdash`, `#btn-switch-flowdash` (`square-arrow-down-left-enter`), and FlowDash `new-document` / `new-template` / `open-file` handoffs.
- **Next Objectives:**
  - Test full FlowDash ↔ WordFlow ↔ BoardFlow launch, switch, and close-to-FlowDash flows (`npm run tauri dev` / `tauri build`), then add `TaskFlow` / `NoteFlow` / `CADFlow`.
