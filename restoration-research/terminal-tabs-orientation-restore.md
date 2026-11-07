# Terminal tab-list orientation on reload

Baseline: f405fe233bbd3fd0647968e9356c2816362b2b3d (Insiders source).
Environment: local Linux on ArchSurface X :2; isolated profile, extensions disabled.

## Observations

Move terminal panel bottom → right, reload. With a 292 px panel and no saved tab-list widths, the tab list changes from 46 px icon-only to 120 px text mode; terminal content shrinks 244 → 170 px. Reproduced twice. Documents retain positions. Evidence is in the project `layout-loop-20261107` directory, `improv-right-panel-*` and `width-repro-*` JSON/PNG.

The separate known terminal-editor custom-name bug also reproduced on this unpatched baseline. It is not part of this layout patch.

## Unit regression

A real TerminalTabbedView and SplitView with isolated services receives layout then vertical orientation. Current width remains 120 instead of 46. Electron test failed at that assertion. This covers a late-event gap; investigate missed initial events too: TerminalGroup fires in its constructor, before TerminalGroupService.createGroup installs its forwarding listener. Do not assume an orientation event is guaranteed during reload.

## Online research (2026-11-07)

- https://github.com/microsoft/vscode/issues/121833 — explicit requirement to retain separate tab widths when switching panel orientations.
- https://github.com/microsoft/vscode/pull/123516 — merged implementation of horizontal/vertical stored widths. Current baseline already contains its mechanism. Build on this existing design; do not cherry-pick an already present historical patch.
- https://github.com/microsoft/vscode/issues/124716 — upstream test plan explicitly asks for tab width persistence on reload and orientation changes. This establishes expected behavior.
- https://github.com/microsoft/vscode/pull/334344 — related terminal sizing fix, but concerns remote PTY A-B-A resize deduplication. It does not fix local tab-list width or orientation initialization, so do not reuse it for this issue.

Searches used GitHub issue search for terminal tabs width/reload/orientation and title-specific width/resize queries. Raw responses are saved in research-api.json and research-specific.json in the evidence directory. No directly applicable newer fix was found in these searches; that is not a claim of exhaustive absence.

## Placement decision

New independent patch: vibecoded/layout/terminal-tabs-orientation-restore/{exploration,unit-test,fix}. It is distinct from the custom-name patch (different state and lifecycle) and needs no super-patch. Fix the existing VS Code terminal layout implementation, retaining its per-orientation storage design. Cover current panel/view location at startup, delayed notifications, orientation switches and preservation of separately saved widths. Avoid unnecessary synchronous reentrant SplitView mutations. Review test realism against the UI reproduction before accepting.

## Implementation and review

Insiders fix: `4cd29688c3efa705cd3bdf720c9783d39f50ea47`. One Sol Medium implementation/review iteration; the reviewer requested startup, stored-width, rapid-event, hidden/disposed and sidebar coverage during that iteration. The fix initializes orientation from actual view location and panel position, refreshes it during layout, and coalesces late event-driven width updates in a microtask. It preserves the existing width storage keys and does not write storage during passive resizing. Disposal and hidden tabs are guarded.

The expanded regression uses real TerminalTabbedView/SplitView objects and tests missed startup events, late events, events during layout, distinct saved widths, rapid orientation switches, sidebar locations, hidden tabs and disposal. Build, full client typechecking, ESLint, and the terminal browser suite passed (542 passing, 2 pending). Repeated UI checks covered document grids, mixed editor/panel terminals, unequal panes, hidden/revealed/maximized panels, pinned/reordered tabs and top/right/bottom/left panel positions.

Combined with the independent terminal custom-name patch, the Insiders terminal browser suite passed 562 tests (2 pending). The combined UI matrix passed 32 reload checks and a further 12 improvised checks covering multiple named terminal editors, repeated Unicode rename, editor/panel round trips and panel hide/reveal. No interaction defect was observed.

## Stable correspondence

Stable baseline: `c4453f8ea430795f941c1b2ff6c9321135a74a02` (`release/1.145`, 1.145.2). Its exact lockfile dependencies, Electron 43.8.3, and same-commit native/built-in extension assets were used. The same UI defect reproduced; four layout unit regressions failed on the unpatched baseline. Stable layout fix `322a8367f1de385dcdf4fc28cb83c81cc8e29d0b` uses exactly the same production and test blobs as the Insiders master. No Stable-specific layout implementation was required.

Independent Stable checks passed: build, full typecheck, ESLint, terminal browser suite (478 passing, 2 pending), original UI regression (5 reloads), full matrix (32 reloads), and new visible-terminal secondary-sidebar/return-to-panel/left-tab-list cases (9 reloads). Earlier sidebar container-only checks are not counted as visible-terminal coverage.

Combined Stable validation is in progress; its final outcome is recorded in the project evidence directory. A full combined typecheck exposed an existing name-test data typing error on both releases, corrected in the name patch alone by explicitly specifying the pending flag in each row. This changes no production code and does not constitute a layout interaction or super-patch.

## Coverage limits

These are local Linux VS Code processes on X :2. SSH is only the transport for controlling that desktop; this is not Remote SSH workspace validation. Scope is window reload, with extensions disabled and no Terminal Sessions extension. This run does not establish close/reopen, remote-server, Remote SSH, Windows-client or tmux persistence behavior. Non-layout observations and harness corrections are retained separately in the project evidence directory.
