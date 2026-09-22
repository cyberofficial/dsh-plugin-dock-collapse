# dsh-plugin-dock-collapse

Collapse the composer's ambient **dock** under the chat — the strip of chips
holding the turn/step meter, token usage, and whatever pill or chip rows your
installed plugins have added (balance, cost meters, stats, toggles) — into a
single one-tap control, and remember that choice across reloads.

A browser-only DSH plugin: all of the work happens in the `dsh.client` browser
half. The host half is a deliberate no-op that exists only so the package
declares `dsh.bundle` and the harness mounts the client bundle. Installing it
appends a small pill to the dock that folds or unfolds the whole row.

## Why it exists

The dock is useful, but over a long session it is a persistent row of
real estate the conversation does not need. This plugin lets you hide it with
one click and bring it back the same way, instead of losing those controls
temporarily or leaving them always on.

## What it does

- Adds a **Collapse** pill (a chevron + word) to the end of the composer dock.
- Click it and the dock's chip row folds away (`display:none`), leaving just the
  pill behind. Click it again and the dock returns.
- Remembers the state in `localStorage` (`dsh-plugin-dock-collapse`), so a
  reload starts in whatever you left it — collapsed or expanded.

## Install

```sh
cd dsh-plugin-dock-collapse
dsh plugin --profile web install "link:$PWD"
```

Restart `dsh web` afterwards (a profile dependency change is not hot-reloaded),
then reload the page. The browser bundle ships built in `lib/`, so no compile
step is needed.

## How it works

| Piece | Where | Contract |
|---|---|---|
| Collapse rule | injected `<style>` | `[data-slot="conversation.composer.dock"][data-dsh-dock-collapsed="1"] { display:none !important }` |
| Control | appended to the slot's parent (the dock flex container) | `button.dsh-dock-collapse[data-dsh-dock-collapse-control]` |
| Detection | `MutationObserver` on `document.body` | re-scans when the slot appears, re-renders, or is removed |
| State | `localStorage` | `dsh-plugin-dock-collapse` = `"1"` (collapsed) or `"0"` (expanded) |

The dock is rendered by the host's closed composer component, and its chip row
is not a slot we can inject into, so the control is added from the outside
against the host's documented addressable seam,
`[data-slot="conversation.composer.dock"]`. Toggling sets a data attribute the
stylesheet reads; the control itself is a sibling of the slot inside the dock's
flex container, so it stays visible while the slot's chips are hidden.

## Notes and limits

- **The control is a DOM augmentation, not a registered slot.** It is appended
  to the host's dock container and re-anchored by an observer if the composer
  re-mounts. It disappears cleanly when the plugin is uninstalled or the module
  unmounts (HMR).
- **Collapse is purely cosmetic.** It hides the dock row; it does not stop
  anything. Every chip keeps its real behaviour behind the scenes — it is just
  not on view while folded.
- **Chips rendered outside the slot by the host itself** (today: the
  context-usage gauge, a sibling element) stay visible when the dock is folded.
  Only rows inside the `conversation.composer.dock` slot fold.
- **`localStorage` may be unavailable** (private mode, disabled cookies). The
  plugin then simply starts expanded every session; it never throws on the read.
- **One writer assumption.** The stored value is written only by this plugin's
  own click handler; editing it by hand is picked up on the next page load.

## Test

```sh
npm test   # loads the bundle in jsdom and drives the real click/fold/persist path
```
