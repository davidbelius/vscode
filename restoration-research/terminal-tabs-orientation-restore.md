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
