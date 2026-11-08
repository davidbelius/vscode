# Restored normalized views below their minimum size

## Reproduction and regression

On Stable 1.145.2 baseline c4453f8ea43, reused editor groups that were at minimum width or height opt out of proportional layout. Applying a normalized three-row preset can then leave two rows at 1/3 pixel and the remaining row at 830 1/3 pixels in an 831-pixel area. Reload reconstructs the views and enforces minimums, producing 70, 70 and 691 pixels. Thus the visible layout changes across reload; the underlying defect occurs during preset application.

The independent Stable regression ea4c39f9d06 creates two non-proportional views with minimum size 70, one flexible view, and a descriptor with total size 1 and three equal sizes. It asserts initial and later resized geometry. It fails on untouched Stable and passes on untouched Insiders f405fe233bb (new regression commit 574f84cbef4). This rules out interaction between the terminal patches as the cause.

## Online research after the red regression

[Upstream PR #346039](https://github.com/microsoft/vscode/pull/346039), merged November 4, 2026 as c4e701c5287637464e32e6b129fe0d1dee233326, includes a shared SplitView fix: views that retain their sizes are constrained to their declared bounds during proportional layout. Its existing regression covers a view restored above its maximum; our editor-row regression covers the corresponding minimum violation. The PR also contains unrelated chat-window features and fixes. GitHub's web fetch timed out; the public GitHub API response verified the merge and description, and the local upstream commit verified the exact code.

[Issue #342124](https://github.com/microsoft/vscode/issues/342124) discusses deliberately hiding individual editor groups and notes the existing minimum-width constraint. It is related context, not a report or fix of this accidental subpixel-row defect. Search did not locate a separate report of the exact UI sequence; no exhaustive absence claim is made.

## Placement and reuse decision

Use a separate independent Stable backport, based on c4453f8ea43. Port only the upstream SplitView bounds clamp and its complementary maximum-bound regression, retaining the new minimum-bound regression. Do not cherry-pick the entire PR. This belongs in shared SplitView sizing, not terminal titles, terminal tab-list orientation, or PTY ID revival.

Insiders is authoritative and already contains the production fix. Its `fix` branch adds only the new regression to f405fe233bb; it is not a new Insiders production patch. Stable has a distinct production backport. No super-patch is warranted because the untouched Stable baseline reproduces the failure.

## Validation plan

Sol Medium implements the focused Stable backport; parent reviews it. Run SplitView and Grid regressions, then isolated UI reproduction with minimum-sized groups, preset changes, reload and graceful close/reopen. Validate the full Stable patch combination afterward. The terminal-orientation patch remains independent: its terminal geometry checks passed; its broader document-grid improvisation exposed this separate baseline defect.
