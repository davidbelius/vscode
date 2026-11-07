# Fix-loop run

## Regression / implementation / review

- Regression iteration 1, test commit de3acf9376f (unit-test branch equivalent f248fc83d42): actual xterm OSC input, actual TerminalInputSerializer, second restored TerminalInstance. Red baseline: 130 passing, 2 pending, 2 failing. Both failures preserve visible custom text but change provenance to Sequence; next restoration loses the static name.
- Implementation iteration 1, d61b502b2b0: guard deferred OSC-title listener installation with current staticTitle === undefined. This preserves restored/user-renamed title provenance while allowing cleared/dynamic titles to resume shell updates.
- Review iteration 1: approved after checking delayed execution uses current state and existing pending rename/reset controls. Full file 132 passing, 2 pending; build and targeted lint passed.

## UI testing

Live status and iteration counts are in index.html and events.json. Raw screenshots/DOM checkpoints remain in ../stress-20261107; machine assertions are in stress-*-checks.jsonl.

- Core local custom-name scenarios passed 12 checkpoints. Fresh hidden-terminal rerun (verified clicks) passed with four names across hidden reloads, reopen, reveal, reload.
- Initial remote transition was invalid due debugging-port collision with leftover local windows. Corrected with dedicated remote port, full application exit, focused renderer selection, and hit-target checks. No application failure attributed to that attempt.
- Initial panel disappearance needs isolated reproduction; see DEFERRED.md. Do not claim global restoration correctness.

Isolated remote core: 12/12 name checkpoints passed, and document layout matched all 12. Fresh exploratory duplicate Unicode names, separate groups, rapid renames to Japanese/emoji, and OSC churn all passed. Isolated remote panel experiment failed on reload (two named splits become one bash). Isolated local comparison passed reload → full application exit/reopen → reload with both new split names intact. Remote failure remains a separate TestResolver/server lifecycle observation; Remote SSH was not tested.

## Outcome

Custom editor-name scope passed after one regression/implementation/review iteration. Core local and isolated remote name suites each passed 12 checkpoints. Fresh exploratory name cases passed; four fresh hidden terminal names passed verified lazy-restoration checks. No further custom-name failure appeared. Separate TestResolver panel/session failure is retained in DEFERRED.md; this is not a claim that every workspace-restoration scenario passes. No merge performed.

# Separate restoration issues

## Panel split terminals disappear on application reopen

Under the reviewed d61b502b2b0 build, create two new panel splits, rename fresh-panel-A and fresh-panel-B, reload (both survive), then close/reopen application. Both disappear, leaving a bash panel terminal. Evidence: fresh-panel-1.log and ../stress-20261107/fresh-panel-{reload-0,reopen,reload-1}.{json,png}. A later harness review found multiple windows remained alive; therefore this requires isolated full-application-exit reproduction before attribution. This concerns process/panel layout persistence, not the editor custom-title provenance fix. Retained for a separate branch per the original instruction to record unrelated failures. No claim that the entire restoration system passes.

## Empty command-palette rename does not clear a name

Previously confirmed and source-backed; remains deferred. API clear behavior is tested by units; this UI route ignores empty input.

## Invalid hidden-tab trial

First hidden-tab trial used offscreen tab coordinates and unintentionally activated other controls. Excluded. Probe now scrolls target into view and checks elementFromPoint before sending real mouse events; rerun uses one wide editor group.

## Isolated TestResolver panel comparison

With a single client and dedicated debugging port, create terminal in editor, name isolated-panel-A, move to panel, split, name isolated-panel-B, reload. Both panel names/layout are replaced by one bash. The editor terminals duplicate Ω and final 日本語 🚀 remain correct. Evidence isolated-panel.log and ../stress-20261107/isolated-panel-{before,reload}.{json,png}. This confirms an observation in the TestResolver setup; it does not establish Remote SSH behavior. Local isolated comparison passed reload, full application exit/reopen, and another reload with both named splits preserved. This narrows the remaining failure to the tested remote/server setup; investigate TestResolver server lifetime versus actual Remote SSH before proposing a panel fix.
