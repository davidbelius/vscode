# Current editor process identity during reload

Baseline: Insiders f405fe233bbd3fd0647968e9356c2816362b2b3d. Red regression: d3309c824d1. Source issue exists unchanged in five-patch combined56dd.

Earlier UI evidence (now in scope) seeded a revived editor old ID6→current ID1, then created a new current terminal ID6 and moved it to an editor. Reload preserved visible layout/names but changed the shellPID. The baseline regression confirms attachToRevivedProcess(6,606) incorrectly follows retained6→1 and attaches1 without validatingPID606. This is independent of the panel layout normalization patch.

## Research after red regression

- https://github.com/microsoft/vscode/issues/341502 documents editor tabs attaching to another window's process after PTY IDs are reused.
- https://github.com/microsoft/vscode/pull/341692 is merged and already present in our baselines. It passes the savedPID and validates literal-ID fallback, but deliberately does not validate revived process IDs (a genuinely revived process has a new OS PID). It retains unknownPID0 behavior.
- Its mapping-first ordering leaves this case: a currently live terminal matches the savedPID but its numericID also exists as a historical mapping key. This is a further case beyond the upstream fix, not grounds to remove genuine-revival fallback.

## Placement and implementation decision

Create independent vibecoded/terminal-process/current-editor-id-reconnect/{exploration,unit-test,fix} branches on the recorded baseline. Extend the existing upstream PID safeguard: prefer the matching live process when the saved PID establishes its identity; otherwise retain legitimate revival and unknownPID semantics. Preserve cross-window ownership protection and avoid attaching twice or leaking local proxies. This is a sixth patch family, not a demonstrated interaction super-patch. Start with the reproduced local path. Remote code drops the PID in its channel; remote changes require separate regression/reproduction and placement review. The Stable port was made from its recorded release baseline after the Insiders fix review.

## Validation status

The current five-patch Insiders build reproduced the wrong attachment: the current editor shell changed from PID 3123772 to 3123061 after reload, while both reload layout comparisons and both close/reopen layout comparisons passed. Evidence: `process-loop-20261109/local-insiders-current-id-reproduction.log`.

The independent Insiders fix 308c0fb0528 passed three further reloads with the same shell PID, start time and TTY, then six program reloads: three with direct `top` and three with `top` and a heartbeat inside an isolated tmux session. The checks verified the tab's attachment to the intended process/TTY, not only that the process survived. Evidence: `process-loop-20261109/independent-parent-identity.json` and `process-loop-20261109/runs/independent-collision-insiders-5e4bbaa1/evidence.jsonl`. The tested independent branch lacks the separate name patch, so its known historical/current custom-name loss remained; the identity checks used the unchanged active second editor group and a shell proof.

## Completed validation — November 9, 2026

The six-patch combined candidates remain Insiders `114b011ca29bc4bcc451ba63d81cae447789671a` and Stable `30f0762e0a7c43405d4b6856152473121016718b`. Focused combined suites passed 161 and 158 tests respectively, with two pending on each release.

The complete local → persistent Remote → Remote SSH progression passed for Insiders then Stable. Each pair passed a fresh full program stress run (14 reloads, 60 keyboard identity proofs) and the combined naming/layout gate (32 reload comparisons and 32 real graceful close/reopen comparisons). Total: 84 program reloads, 360 keyboard proofs, 192 naming/layout reload comparisons and 192 close/reopen comparisons. Process stress included direct foreground top, top/heartbeat inside isolated tmux, panel and editor terminals, repeated renames, moves, hidden panels, document-covered terminals, split panels, grid layouts and alternate tmux windows. Remote server PID/start time remained fixed during measured process reloads; naming/layout gates checked persistent server identity and actual client exits.

The independent process patch passed seeded collision checks in all six pairs. Remote and Remote SSH combined candidates additionally passed explicit collision seed plus program checks. Independent name loss from the deliberately omitted naming patch remains separately recorded, not treated as a process failure. Setup-only server restarts prepared revival mappings before the measured baseline.

| Environment | Release | Full process evidence | Combined naming/layout evidence |
| --- | --- | --- | --- |
| local | Insiders | `process-loop-20261109/runs/local-insiders-60c3b34a/evidence.jsonl` | `unified-loop-20261108/local-insiders-combined-20261109T145944037778Z-evidence.json` |
| local | Stable | `process-loop-20261109/runs/local-stable-a492b161/evidence.jsonl` | `unified-loop-20261108/local-stable-combined-20261109T154006683603Z-evidence.json` |
| Remote | Insiders | `process-loop-20261109/runs/Remote-insiders-44415c10/evidence.jsonl` | `unified-loop-20261108/remote-insiders-combined-20261109T163816084215Z-evidence.json` |
| Remote | Stable | `process-loop-20261109/runs/Remote-stable-52dc9890/evidence.jsonl` | `unified-loop-20261108/remote-stable-combined-20261109T173135443951Z-evidence.json` |
| Remote SSH | Insiders | `process-loop-20261109/runs/Remote-SSH-insiders-6b64d915/evidence.jsonl` | `unified-loop-20261108/ssh-insiders-combined-ssh-auto-20261109T183130892338Z-evidence.json` |
| Remote SSH | Stable | `process-loop-20261109/runs/Remote-SSH-stable-9e9a8fd1/evidence.jsonl` | `unified-loop-20261108/ssh-stable-combined-ssh-auto-20261109T193056720337Z-evidence.json` |

The evidence paths above refer to the project report workspace. A compact machine-readable copy is committed alongside this research as `current-editor-id-reconnect-validation.json`. Detailed targeted collision references remain in `process-loop-20261109/coverage.json`.

### Harness findings and limits

Earlier incomplete setups and failed harness runs are preserved and excluded from the successful totals. Corrections verified actual serialized backend IDs rather than DOM resource IDs, accounted for SSH extension startup PTYs, dismissed a tooltip before hit-testing, and made the terminal locator handle the specific stale-environment accessibility warning without selecting sticky-scroll previews or ambiguous panes. The last locator change received red DOM regressions, implementation/review, 39 passing harness tests, four live keyboard proofs, and a fresh complete SSH Stable stress rerun. No additional product patch was required by these harness findings.

Process identity/survival claims cover window reload only; close/reopen coverage asserts names/layout, not preservation of running programs. Windows is excluded. Stable full client typecheck retains three preexisting errors in untouched Sinon tests, also confirmed on the red baseline. Remote SSH Insiders uses official runtime `29ce94ad8d36c62affc08484e262d5c4fbdd0b3d` with verified source overlays; runtime/source provenance is recorded separately. These are bounded passing stress tests, not a claim that every possible interaction is covered.

Active worktrees and builds live in the ArchSurface agent account. The Dropbox repository remains dormant; GitHub is the synchronization remote.
