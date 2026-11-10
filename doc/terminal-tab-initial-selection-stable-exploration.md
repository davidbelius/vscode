# Stable terminal tab initial selection exploration

Release baseline: Stable `c4453f8ea430795f941c1b2ff6c9321135a74a02` (1.145.2). This is an independent variant of the Insiders initial-selection patch; it has no product fix on this branch.

The Stable `TerminalTabList` constructor has the same event-only selection path: it listens to `onDidChangeActiveInstance`, then calls `refresh()` and returns. If an active instance exists before list construction (as after hidden-panel restoration), no change event selects its row. The existing active-instance setter returns early for an already active terminal. The six-line Insiders product fix has the same insertion point after the constructor refresh; Stable implementation remains deferred until Insiders improvised UI validation completes.

The Stable baseline has no `terminalTabsList.test.ts` file, and its `TerminalTabsAccessibilityProvider` is private. A sibling `unit-test` branch adds six focused selection/guard tests in a new browser test file: active second and first rows, unchanged keyboard focus, absent active instance, active instance missing from the list, and intentional multi-selection surviving generic refresh. This is a release-specific test adaptation, not a cherry-pick of Insiders' whole test file.

Related upstream discussion and decision evidence in the shared workspace:

- `windows-loop-20261110/terminal-tab-selection-online-search-focused.json`
- `windows-loop-20261110/terminal-tab-selection-upstream-discussions.json`
- `windows-loop-20261110/terminal-tab-selection-upstream-fixes.json`
- `windows-loop-20261110/terminal-tab-selection-patch-decision.json`
- `terminal-tab-selection-loop-20261110/stable-feasibility.md`

The upstream fixes concern active-change events or older reload behavior, not initializing a list whose active instance was restored before construction. Keep this patch independent of terminal naming, tmux, and process persistence.
