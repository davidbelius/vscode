# VS Code terminal editor/panel restoration corruption: ArchSurface reproducer

> **Project status:** This is a vibe-coded regression-test project for apparent
> VS Code terminal-restoration bugs. It is experimental, AI-assisted work and
> is not an official Microsoft test suite or confirmation of a VS Code defect.
> The evidence and tests are intended to make the suspected behavior
> reproducible and independently reviewable.

Date: 2026-08-30

## Current official-build confirmation

The invalid state also reproduces with extensions disabled in clean profiles of
both current official Microsoft builds downloaded on 2026-08-30:

| Build | Commit | Shutdown delay that reproduced overlap |
| --- | --- | --- |
| VS Code 1.135.0 | `08d4889f9ec4a1685d257b9b95de036c8e1ce1e5` | 5 ms |
| VS Code 1.136.0-insider | `d5ceefbe0b296c4d8fbbf3664aff8cad73cd1b5d` | 10 ms |
| VS Code OSS development build | `d5ceefbe0b296c4d8fbbf3664aff8cad73cd1b5d` | overlap remained after 7+ seconds |

For each build, two terminals were moved into the editor area and serialized by
a full exit/reopen. The active terminal was then moved back into the panel and
the clean test instance was terminated during the asynchronous layout writes.
The resulting database stored terminal ID `2` in both the panel layout and the
terminal-editor memento. This was reproduced after actually killing the exact
test build's Electron process tree, not merely by opening another window.

Reopening the captured corrupt database normalized both terminals into editor
tabs in the final replay runs, with their custom names replaced by `bash`. An
earlier startup normalized both into the panel. This confirms that the durable
dual registration remains present in current Stable and Insiders, while the
visible result remains timing-dependent.

The unmodified source checkout of the same Insiders commit was also compiled
and tested on ArchSurface. A clean, extension-free profile restored two
terminal editor tabs, then moving the active terminal into the panel stored
terminal ID `2` in both records. Unlike the narrow packaged-build shutdown
race, this overlap was still present when inspected after two seconds and
again more than five seconds later. Killing the exact development-build
Electron process tree and reopening that database normalized the result to two
editor tabs named `bash`. This confirms the bug in the source build that will
be used for the fix, before any code changes.

Artifacts are under:

- `evidence/stable-1.135.0/`
- `evidence/insiders-1.136.0/`
- `evidence/source-build-d5ceefbe/`

The decisive database captures are named `true-race-overlap-5ms.vscdb` and
`true-race-overlap-10ms.vscdb` respectively.

## Result

The underlying VS Code state corruption is reproducible using only native VS
Code terminal moves. Terminal Sessions Native First 0.22.0 performs no startup
restoration in this test.

VS Code can retain one logical terminal in both:

- `terminal.integrated.layoutInfo` (terminal panel), and
- `memento/workbench.parts.editor` (terminal editor tab).

On restart, both UI locations compete for the persistent pty. Depending on
timing, the result is a duplicated tab, a live panel terminal plus a
history-only editor tab, or normalization to just one location.

## Natural UI reproducer

Use a dedicated VS Code profile with persistent sessions enabled.

1. Create two persistent terminals and rename them `a` and `b`.
2. Drag `a` from the terminal panel into the editor area.
3. Drag `b` to the right edge of the editor area, creating a second, locked
   editor group.
4. Restart VS Code once so both terminal-editor entries are serialized.
5. Move `b` back into the terminal panel.
6. While the panel visibly contains `b`, inspect the workspace database. VS
   Code still retains `b` in the editor memento while registering it in the
   panel layout.
7. Terminate/restart the window before VS Code's later layout cleanup wins.

The critical state from step 6 is deterministic. The visible result after step
7 is race-dependent.

## Detect the invalid state

Find the workspace database beneath the active user-data directory:

```bash
find USER_DATA/User/workspaceStorage -name state.vscdb
```

Read both layout records:

```bash
sqlite3 state.vscdb \
  "select key, cast(value as text) from ItemTable where key in ('terminal.integrated.layoutInfo','memento/workbench.parts.editor');"
```

A corrupted state contains the same logical terminal in the panel layout and
as a `workbench.editors.terminal` entry. Across revival, numeric IDs may be
renumbered, so the terminal title, saved PID, shell-integration nonce and pty
logs are also relevant identity evidence.

## Exact captured failure

The normal-profile capture stored terminal ID `1` in both collections:

- panel: `activePersistentProcessId: 1`, terminal `1`;
- editor: `workbench.editors.terminal`, ID `1`, title `a`.

The pty-host log then reported:

```text
Expanding terminal instance ... -> new id 1
Persistent process "1": Process had no disconnect runners but was an orphan
Persistent process reconnection "1"
Persistent process "1": Replaying ... chars
```

Only one tmux client existed. Terminal Sessions did not create a replacement.

## ArchSurface artifacts

- Natural test profile: `~/vscode-terminal-editor-repro`
- Deterministic replay profile: `~/vscode-terminal-error-replay`
- Original corrupt replay seed:
  `~/vscode-terminal-error-replay/artifacts/corrupt-seed.vscdb`
- Natural-cycle evidence:
  `~/vscode-terminal-editor-repro/artifacts/`
- Replay evidence:
  `~/vscode-terminal-error-replay/artifacts/`

The replay profile is a copy of the isolated test account's user data. It does
not modify the normal Code OSS profile.

## Harness files in this directory

- `tools/cdp_driver.py` — command-palette and pointer-drag automation
- `scripts/stress-fast-restart.sh` — rapid forced-termination cycles
- `scripts/soak-restart.sh` — split-editor restart soak
- `scripts/soak-file-exit.sh` — real File: Exit soak
- `settings.json` — isolated settings

## Negative controls

- 20+ rapid restarts with one terminal editor: no overlap.
- 30+ rapid restarts with two split/locked terminal editors: no overlap while
  their locations remained unchanged.
- Multiple genuine File: Exit cycles with the stable split layout: no overlap.

This narrows the trigger to terminal location transitions combined with
shutdown/restoration, not tmux attachment or restart alone.

## Comparison with previous VS Code issues

- [#186922 — Terminal failing to reconnect](https://github.com/microsoft/vscode/issues/186922)
  - problem: A terminal sometimes fails to reconnect after reloading VS Code.
  - similarity: Its pty-host logs show the same duplicate expansion, orphan,
    reconnection, and replay sequence.
  - difference: It does not mention moving terminals, editor/panel duplication,
    or conflicting persisted layout records.
  - verdict: not same bug (closest backend match, but correspondence is not
    established).

- [#140429 — Terminal editor not restored](https://github.com/microsoft/vscode/issues/140429)
  - problem: Terminals in the editor area disappeared after restarting VS Code.
  - similarity: It concerns persistence and restoration of terminal editor tabs.
  - difference: The terminal simply disappeared rather than being serialized in
    both the editor and panel.
  - verdict: not same bug (related older bug fixed in 2022).

- [#139310 — Terminal duplication on remote host](https://github.com/microsoft/vscode/issues/139310)
  - problem: Remote-SSH terminals appeared duplicated after a VS Code update.
  - similarity: It involves duplicated terminals and carries the
    `terminal-editors` label.
  - difference: It provides no restart, movement, database, or pty-host evidence.
  - verdict: not same bug (the report is too incomplete to establish a match).

- [#138876 — Move Terminal into Panel error](https://github.com/microsoft/vscode/issues/138876)
  - problem: Moving a terminal from the editor area into the panel produced an
    error.
  - similarity: It exercises the same editor-to-panel transition where our
    corrupt state originates.
  - difference: It was an immediate command error, not a persistence or restart
    failure.
  - verdict: not same bug (relevant historical transition bug).

- [#328885 — Orphaned terminal causes memory leak](https://github.com/microsoft/vscode/issues/328885)
  - problem: An orphaned persistent terminal continues buffering output until VS
    Code runs out of memory.
  - similarity: It contains the same "no disconnect runners but was an orphan"
    pty-host warning.
  - difference: Its result is unbounded buffering and OOM, not duplicated
    terminal placement.
  - verdict: not same bug (possibly related ownership failure).

- [#319200 — Restored terminal uses another workspace's directory](https://github.com/microsoft/vscode/issues/319200)
  - problem: A restored terminal editor intermittently receives the working
    directory of another workspace.
  - similarity: It shows current terminal-editor restoration can associate saved
    state incorrectly.
  - difference: It mixes working directories rather than editor/panel locations
    or pty ownership.
  - verdict: not same bug.

- [#329750 — Terminal editor icon not preserved](https://github.com/microsoft/vscode/issues/329750)
  - problem: An extension-provided terminal icon is lost after reload or restart.
  - similarity: It demonstrates current loss of terminal-editor metadata during
    restoration.
  - difference: Only the icon is lost; terminal location and process association
    remain intact.
  - verdict: not same bug.

- [#327326 — Stable terminal session ID API](https://github.com/microsoft/vscode/issues/327326)
  - problem: Extensions lack a stable terminal identity across reloads and
    restarts.
  - similarity: Stable identity would help extensions detect or repair
    incorrectly restored terminals.
  - difference: It is an API feature request, not a report of native layout
    corruption.
  - verdict: not same bug (relevant only to extension workarounds).

