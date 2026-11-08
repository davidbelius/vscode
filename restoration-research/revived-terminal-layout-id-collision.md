# Current terminal layout collides with retained revival IDs

Insiders baseline: f405fe233bbd3fd0647968e9356c2816362b2b3d. Found during unified local reload/close-reopen testing on 2026-11-08, using the independent name patch. After a graceful application restart, create named panel splits and a named editor terminal, then reload. The panel splits disappear while the editor remains. PTY logs map a newly published current ID through a retained old editor revival mapping to an already removed process. Evidence: unified-loop-20261108/local-insiders-name.log and local-name-panel-loss-pty.log.

The independent baseline regression (3f48e12165e) revives editor ID 40 to 1, retains that lookup for editor restoration, publishes a current split with IDs 40/41, and reads it twice. The baseline incorrectly drops current ID 40 and consumes the editor lookup. This fails without either earlier patch, so it is not a demonstrated patch interaction.

## Research after the failing unit test

- https://github.com/microsoft/vscode/issues/341502 and merged https://github.com/microsoft/vscode/pull/341692 discuss reused persistent IDs attaching editors to another window's process. That fix checks an expected OS PID for local editor fallback attachment and is already present in our baseline. It does not distinguish current panel layout IDs from old revived IDs; do not cherry-pick it again.
- https://github.com/microsoft/vscode/issues/210792 discusses missing PTY errors in remote use. It is symptom context, not proof of this exact cause or an applicable fix.
- https://github.com/microsoft/vscode/issues/327326 requests stable extension-facing terminal identity; it is a separate API feature, not a repair of internal layout remapping.
- https://github.com/microsoft/vscode-docs/blob/main/docs/terminal/advanced.md documents reconnect on reload and process revival on restart. Process recreation is permitted; silently substituting/dropping a different current panel ID is not the intended identity relationship.

Searches included revivedPtyIdMap, revived terminal layout ID collision, and terminal disappearance after restart. No directly applicable upstream fix was found; this is not an exhaustive absence claim.

The historical local attempt has c80fa056fa2 (publish remote layout after revival), c962ebd0dd9 (remote revived ID lookup) and dae0b2f2f8f (workspace identity in that lookup). They address adjacent remote handoff/RPC issues. Publishing current layout alone cannot fix this reproduced case because the PTY service subsequently interprets those current IDs as old ones. They are evidence only; no legacy workflow or patch stack is adopted.

## Placement and approach

Create a new independent patch under vibecoded/layout/revived-terminal-layout-id-collision/{exploration,unit-test,fix}. It is distinct from custom-name initialization and tab-list orientation. Fix layout ID provenance/normalization at the PTY-service/backend boundary, preserving editor revival lookup and both local and remote restore paths. Avoid a global map clear or merely preferring any live ID: a current and historical ID can both resolve to live but different processes. Cover repeated reads, active split selection, background terminals and workspace isolation as warranted. Use a fresh implementation against the pinned baseline, informed by the existing revival design; do not import the old stack.

## Persistent remote close/reopen follow-up (2026-11-08)

The isolated Insiders fix a4bb9e17596 passed two reloads but lost a two-terminal panel split on the first graceful client close/reopen. The development server PID stayed 1644654. PTY logs show revival old IDs 1→4, 2→5, 3→6 followed by layout requests for missing old IDs 1 and 2. Document groups remained unchanged. Evidence is retained in the project’s unified-loop-20261108/remote-insiders-collision-cases.log and before/after screenshots/JSON.

RemoteTerminalBackend.setTerminalLayoutInfo only sends the current layout to the server. Unlike LocalTerminalBackend, it never writes TerminalStorageKeys.TerminalLayoutInfo. Its revival path reads that key before republishing a historical layout with isRevived=true, so no publication occurs. The collision fix deliberately moved historical-ID normalization out of getTerminalLayoutInfo to publication time; this exposed the missing remote producer. A persistent server retains the old layout in memory, but its terminal IDs have changed after client-close revival.

Regression 85e700a06cb on the unit-test branch constructs real remote backend instances around shared storage/channel fixtures. It publishes a 40/60 split with active ID and background terminal, replaces the backend as a new client would, provides saved buffers, and asserts revival → historical-layout publication → layout lookup. Verified red: the historical publication is absent. Production export of RemoteTerminalBackend exists solely to enable normal constructor-based testing.

Research after the red test:

- https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/remoteTerminalBackend.ts — current upstream still sends layout without storing it, while its revival path reads the missing key. No exact upstream implementation to cherry-pick was found.
- https://github.com/microsoft/vscode/issues/135687 — related broad request to restore terminal layouts, not evidence of a fix for this handoff.
- https://code.visualstudio.com/docs/terminal/advanced#_persistent-sessions — distinguishes reconnect on reload from process revival after restart. Server survival alone does not mean shell processes survive a graceful client close.
- https://github.com/microsoft/vscode-remote-release/issues/11648 — different stale connection-token/server-restart issue; not applicable to this reproduction with a continuously running server.

Placement decision: complete this existing patch's remote publication contract, rather than create a fifth patch or a super-patch. The failure is reproduced with this patch alone. Adapt the existing local backend's durable layout-storage pattern, test clearing the layout and ordinary reload without revival, and preserve the current-ID/historical-ID separation. Sol Medium implementation and parent review are required before acceptance. Local tests remain evidence for unchanged local behavior, but remote affected gates and the future remote combined gate must use the corrected revision.
