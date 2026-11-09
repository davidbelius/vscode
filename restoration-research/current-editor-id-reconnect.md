# Current editor process identity during reload

Baseline: Insiders f405fe233bbd3fd0647968e9356c2816362b2b3d. Red regression: d3309c824d1. Source issue exists unchanged in five-patch combined56dd.

Earlier UI evidence (now in scope) seeded a revived editor old ID6→current ID1, then created a new current terminal ID6 and moved it to an editor. Reload preserved visible layout/names but changed the shellPID. The baseline regression confirms attachToRevivedProcess(6,606) incorrectly follows retained6→1 and attaches1 without validatingPID606. This is independent of the panel layout normalization patch.

## Research after red regression

- https://github.com/microsoft/vscode/issues/341502 documents editor tabs attaching to another window's process after PTY IDs are reused.
- https://github.com/microsoft/vscode/pull/341692 is merged and already present in our baselines. It passes the savedPID and validates literal-ID fallback, but deliberately does not validate revived process IDs (a genuinely revived process has a new OS PID). It retains unknownPID0 behavior.
- Its mapping-first ordering leaves this case: a currently live terminal matches the savedPID but its numericID also exists as a historical mapping key. This is a further case beyond the upstream fix, not grounds to remove genuine-revival fallback.

## Placement and implementation decision

Create independent vibecoded/terminal-process/current-editor-id-reconnect/{exploration,unit-test,fix} branches on the recorded baseline. Extend the existing upstream PID safeguard: prefer the matching live process when the saved PID establishes its identity; otherwise retain legitimate revival and unknownPID semantics. Preserve cross-window ownership protection and avoid attaching twice or leaking local proxies. This is a sixth patch family, not a demonstrated interaction super-patch. Start with the reproduced local path. Remote code drops the PID in its channel; remote changes require separate regression/reproduction and placement review. Stable port follows authoritative Insiders review.

Validation: targeted routing regression red on baseline, complementary genuine-revival/missing/unknownPID cases, parent implementation review, UI identity stress with top and isolated tmux, affected names/layout integration reruns. Process survival alone is insufficient: verify the intended tab still controls the intended process/TTY. The current five-patch Insiders build reproduced the same wrong attachment: the current editor shell changed from PID 3123772 to 3123061 after reload, while both reload layout comparisons and both close/reopen layout comparisons passed. Evidence: `process-loop-20261109/local-insiders-current-id-reproduction.log`. The independent fix has not yet passed UI validation.
