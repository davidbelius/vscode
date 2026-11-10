# Terminal tab selection after hidden-panel restoration

Baseline: Insiders `f405fe233bbd3fd0647968e9356c2816362b2b3d`.

Windows reproduction: `windows-loop-20261110/hidden-panel-two-terminal-reproduction.json` in the shared workspace. Before graceful close, the second panel terminal is active and its row selected. After reopening with the panel hidden and revealing it, the second xterm remains focused but neither tab row is selected.

`TerminalTabList` registers an active-instance change listener, then calls `refresh()`, which populates rows without selecting an already active instance. `TerminalGroupService.setActiveInstanceByIndex` returns early when the same instance is already active, so revealing the restored panel cannot generate the missing change event.

The focused baseline regression on the sibling `unit-test` branch constructs a list after the second terminal is active. It fails with selected rows `[]` rather than the second terminal; its generic-refresh multi-selection guard passes.

Related upstream reports: https://github.com/microsoft/vscode/issues/120824 confirms active-to-selected synchronization; https://github.com/microsoft/vscode/issues/127357 and https://github.com/microsoft/vscode/issues/127500 concern historical reload/group events; https://github.com/microsoft/vscode/issues/342071 concerns deselection after blank-area click. Their fixes do not cover construction after active-instance restoration.

Decision: a new independent patch owned by `TerminalTabList` initialization. Populate rows first, then initialize selection from an active instance present in the list. Preserve generic-refresh multi-selection and avoid changing keyboard focus or backend active instance. No product fix is made on this exploration branch.

Research and patch-placement records in the shared workspace:

- `windows-loop-20261110/terminal-tab-selection-online-search-focused.json`
- `windows-loop-20261110/terminal-tab-selection-upstream-discussions.json`
- `windows-loop-20261110/terminal-tab-selection-upstream-fixes.json`
- `windows-loop-20261110/terminal-tab-selection-patch-decision.json`

The records distinguish the active-before-list-construction case from the event-driven historical fixes and identify this as a new independent TerminalTabList patch.
