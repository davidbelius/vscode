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
