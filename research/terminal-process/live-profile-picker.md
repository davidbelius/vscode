# Live terminal profile picker: exploration

## Reproduction and placement

The Remote SSH Insiders prototype showed **0 Results** for “Tmux Native Persistent” after the remote extension host had registered the profile. Reopening the picker later showed **1 Results** with that profile. No extension command was invoked during the diagnostic; this was a discovery and picker visibility problem, not a failed tmux attach. Evidence: `extension-loop-20261109/live-profile-picker-diagnostic.json` in the project report workspace.

The test-only commit `f52f108313f80eb7d72e77d148c19af9042968b5`, based directly on official Insiders baseline `f405fe233bbd3fd0647968e9356c2816362b2b3d`, opens the real `TerminalProfileQuickpick` with an existing PowerShell profile, publishes a late contributed profile and `onDidChangeAvailableProfiles`, then requires that profile to become selectable without reopening. The focused browser run was red: **0 passed, 1 failed in 237 ms** at “late contributed profile must appear in the picker that is already open.” Four existing picker controls passed; full Insiders client typecheck passed. Initial runs before compiled test output existed were harness setup failures, not product results. See `extension-loop-20261109/live-profile-picker-unit-regression.json` in the project report workspace.

On the baseline, [`TerminalProfileQuickpick._createAndShow`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalProfileQuickpick.ts) snapshots `availableProfiles` and `contributedProfiles`, assembles `quickPickItems`, and calls `quickInputService.pick` once. It does not subscribe to profile changes while the picker is open. The separate `contributed-profile-startup` patch repairs service-to-cache event propagation. This failure persists directly on the official baseline and concerns the picker consumer for both native and contributed profiles; it belongs in an independent `live-profile-picker` patch. No patch interaction has been demonstrated, so there is no interaction super-patch to add yet.

## Related primary sources and bounded conclusion

- [VS Code issue #129612](https://github.com/microsoft/vscode/issues/129612) and [PR #129619](https://github.com/microsoft/vscode/pull/129619) concern refresh of the default-profile dropdown. That change adjusts default-name lookup and labels in the older terminal view menu; it does not update an already-open quick picker.
- [Issue #119592](https://github.com/microsoft/vscode/issues/119592) describes an intentional omission of a default shell from an older secondary menu. It does not establish that late profile contributions should be absent from an open picker.
- [PR #282054](https://github.com/microsoft/vscode/pull/282054) concerns workspace/user default-profile configuration targeting and grouping, not late item updates.
- [PR #293731](https://github.com/microsoft/vscode/pull/293731) fixes notification listener disposal and is already represented in the baseline. Its resource cleanup should be preserved.

Targeted public GitHub searches and these primary changes found no exact report or reusable live-picker fix. This is a bounded research result, not proof none exists. A scoped fix should use the existing available-profile change event and live QuickPick API while preserving the user's filter and highlight, key modifiers, configuration buttons, profile safety checks, and disposal. This branch records research only; it contains no implementation or test changes.
