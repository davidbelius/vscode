# Tmux Native Profile prototype

This workspace extension creates a detached tmux session with a random immutable
identity on the user's standard tmux server (`-L default`). It then gives VS Code
a native terminal launch: an absolute tmux executable, the server's actual socket
path, and `-N -S <actual socket> attach-session -t =<identity>`. VS Code owns terminal revival, placement,
renaming, and layout. The extension creates no startup terminals and does not move
terminals or write to them. Closing a tab, reloading, closing VS Code, or
deactivating the extension does not terminate a managed tmux session.

Use **Tmux Native Profile: New Persistent Terminal** or choose **Tmux Native
Persistent** in the terminal profile picker. A new session starts in the active
editor's workspace folder, or the first workspace folder. Move the terminal to an
editor group with VS Code's normal action. To end a session deliberately, use
**Tmux Native Profile: Terminate Session**. The picker includes only sessions with
the extension's UUID name and a matching workspace ownership tag. Closing a
terminal tab only detaches.

`tmuxNativeProfile.tmuxPath` selects the executable; it is resolved to an absolute
path before creating a terminal. This prototype supports Linux hosts with tmux.
It runs as a **workspace extension**, including on the remote extension host for
Remote SSH, and requires a trusted workspace. The extension never alters tmux
configuration, kills the server, or touches unrelated sessions. The user's tmux
configuration applies to the standard server. Settings such as `exit-unattached`
or `destroy-unattached` may prevent detached-session persistence and need to be
managed by the user.

Enable VS Code terminal session persistence and window-close revival:

```json
{
  "terminal.integrated.enablePersistentSessions": true,
  "terminal.integrated.persistentSessionReviveProcess": "onExitAndWindowClose"
}
```

The exact tmux session name and actual socket path remain in VS Code's saved
native terminal arguments. If that tmux session is missing on revival,
`attach-session` exits visibly rather than creating an empty replacement. This
prototype does not track which VS Code tab belongs to which session, clean up
detached sessions automatically, or manage tmux sessions entered by typing `tmux`
into an ordinary terminal. The terminate picker shows identities because VS Code
tab titles can be changed independently.

The earlier [Terminal Sessions extension](https://github.com/visul/terminal-sessions)
informed the problem analysis. This prototype uses no code from that extension.

Run tests with Node 24 and `npm test`. There are no runtime dependencies.

## Prototype validation and current limit

This is an experimental prototype, not a completed remote-restoration solution.
It was tested against the project's six-patch VS Code builds:
Insiders `114b011ca29bc4bcc451ba63d81cae447789671a` and
Stable `30f0762e0a7c43405d4b6856152473121016718b`.

- Local Insiders and Stable each passed three reloads and four real graceful
  close/reopen cycles, using panel and editor terminals, both creation routes,
  renaming, moving, and duplicate custom names. Each run recorded 20 keyboard
  identity proofs; original tmux pane shells and foreground `top` processes
  survived the client exits.
- Persistent Remote Insiders passed both initial reloads, but its first
  close/reopen restored the editor terminal as plain Bash. The original tmux
  session and running program survived, and the panel reattached correctly.
  The saved VS Code state contains the correct tmux launch arguments for both
  terminals. Native remote editor restoration attempts the obsolete PTY ID;
  its remapping RPC also omits the workspace ID required by the server.
- Remote Stable and Remote SSH validation have not been reached. Stock unpatched
  VS Code has not been qualified by these prototype runs.
- Eight extension tests pass, including concurrent session allocation on the
  standard tmux server, ownership filtering, missing-session behavior, remote
  workspace paths, and cancellation cleanup.

The remote editor failure needs a separate VS Code fix. This prototype does not
recreate tabs or inject attachment commands to work around it. Process survival
requires the tmux server to remain alive; machine-reboot recovery is outside scope.
