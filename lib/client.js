/*
 * Browser half of dsh-plugin-dock-collapse — a client-only plugin (no host
 * half, no cordis.patch.yml, no API routes).
 *
 * The composer's ambient dock strip under the chat (the host slot
 * `conversation.composer.dock`) holds a row of chips — the turn/step/token
 * meter plus whatever pills and rows a user's installed plugins have added.
 * Over a long session that strip is a lot of horizontal real estate the chat
 * does not need. This plugin adds a one-tap collapse control to that strip:
 * click it and the whole dock hides, leaving just the control behind; click
 * the control again and the dock returns.
 *
 * It is deliberately a DOM augmentation, not a slot registration: the dock is
 * rendered by the host's closed composer component, and the chip row is not a
 * seam we can inject into, so the control is appended from the outside. The
 * host's own documented addressable seam, `[data-slot="conversation.composer.dock"]`,
 * is the anchor — a MutationObserver watches for it (and for the slot being
 * re-rendered away and back), appends the control to its parent once, and
 * toggles collapse by setting a data attribute the stylesheet reads.
 *
 * Collapse is a single CSS rule keyed on that attribute (`display: none` with
 * !important, so it wins the slot's inline `display: contents`). The control
 * itself is a sibling of the slot inside the dock's flex container, so it stays
 * put while the slot's chips are gone. The user's choice is remembered in
 * localStorage, so a reload starts in the state they left it.
 *
 * Authored in plain ES (no JSX, no React dependency) so the checked-in file
 * needs no build step.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-dock-collapse',
  factory: () => {
    const name = 'dsh-plugin-dock-collapse'
    const exports = {}

    /** localStorage key for the remembered collapsed state. */
    const STORE_KEY = 'dsh-plugin-dock-collapse'

    /** The host slot this targets — its data-slot attribute is the seam. */
    const DOCK_SELECTOR = '[data-slot="conversation.composer.dock"]'

    /** Data attribute the stylesheet collapses on. */
    const COLLAPSED_ATTR = 'data-dsh-dock-collapsed'

    /** Marker on the appended control, so re-scans reuse it and cleanups find it. */
    const CONTROL_ATTR = 'data-dsh-dock-collapse-control'

    /** Icons (16px, stroke currentColor, matching the dock's glyph style). */
    const CHEVRON_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>'
    const CHEVRON_UP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10l4-4 4 4"></path></svg>'

    /**
     * The remembered state: collapsed when the stored value is "1", expanded
     * otherwise, and expanded when storage is unavailable (a read must never
     * throw into the observer loop).
     */
    function loadCollapsed() {
      try {
        return window.localStorage.getItem(STORE_KEY) === '1'
      } catch {
        return false
      }
    }

    /** Persist the state; a storage failure (private mode, disabled cookies) is silent. */
    function saveCollapsed(collapsed) {
      try {
        window.localStorage.setItem(STORE_KEY, collapsed ? '1' : '0')
      } catch {
        /* best effort */
      }
    }

    /**
     * The dock control's current rendered label, tracked so repeated scans do
     * not rewrite innerHTML (which would itself fire the observer) when nothing
     * changed.
     */
    const renderedLabel = new WeakMap()

    /**
     * The one-tap control: a compact round pill with a chevron and a word.
     * While the dock is expanded it says "Collapse" (▼); while hidden it says
     * "Expand" (▲). Clicking flips the remembered state and re-applies it to
     * every dock the observer has found.
     */
    function buildControl() {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-dock-collapse'
      button.setAttribute('aria-haspopup', 'false')
      button.addEventListener('click', onToggle)
      return button
    }

    /**
     * Reconcile one dock + its control to the desired state. Every branch is
     * guarded by the current DOM value, so calling it repeatedly when nothing
     * changed writes nothing — the observer then stays quiet.
     * @param {Element} dock - the host slot element.
     * @param {HTMLButtonElement | null} control - the appended toggle.
     * @param {boolean} collapsed - desired state.
     */
    function applyState(dock, control, collapsed) {
      const want = collapsed ? '1' : '0'
      if (dock.getAttribute(COLLAPSED_ATTR) !== want) {
        dock.setAttribute(COLLAPSED_ATTR, want)
      }

      if (control !== null) {
        const expanded = !collapsed
        const label = expanded ? 'Collapse' : 'Expand'
        const title = expanded
          ? 'Collapse the composer dock: hides the chip rows under the chat'
          : 'Expand the composer dock: show the chip rows under the chat'

        if (control.getAttribute('aria-label') !== title || control.getAttribute('title') !== title) {
          control.setAttribute('aria-label', title)
          control.setAttribute('title', title)
        }
        if (control.getAttribute('aria-expanded') !== String(expanded)) {
          control.setAttribute('aria-expanded', String(expanded))
        }
        if (renderedLabel.get(control) !== label) {
          control.innerHTML = (expanded ? CHEVRON_DOWN : CHEVRON_UP) + '<span class="dsh-dock-collapse-label">' + label + '</span>'
          renderedLabel.set(control, label)
        }
      }
    }

    /**
     * Ensure `dock` owns a single appended control, creating and attaching the
     * first one to the slot's parent (the dock's flex container). Returns the
     * control regardless of whether it was just made or already present.
     * @param {Element} dock - the host slot element.
     * @returns {HTMLButtonElement | null} the control, or null if there is no parent.
     */
    function ensureControl(dock) {
      const host = dock && dock.parentElement
      if (!host) return null
      let control = host.querySelector('[' + CONTROL_ATTR + ']')
      if (control === null) {
        control = buildControl()
        control.setAttribute(CONTROL_ATTR, '1')
        host.appendChild(control)
      }
      return control
    }

    /** Fold or unfold every dock the observer has found, persisting the choice. */
    function onToggle() {
      const next = !loadCollapsed()
      saveCollapsed(next)
      for (const dock of document.querySelectorAll(DOCK_SELECTOR)) {
        applyState(dock, ensureControl(dock), next)
      }
    }

    /** Reconcile every currently-present dock to the remembered state. */
    function scan() {
      const collapsed = loadCollapsed()
      for (const dock of document.querySelectorAll(DOCK_SELECTOR)) {
        applyState(dock, ensureControl(dock), collapsed)
      }
    }

    const CSS_TAG = 'dsh-plugin-dock-collapse/collapse.css'

    /**
     * The stylesheet. Two things live here:
     *   - the collapse rule on the slot (the actual feature);
     *   - the control's own pill styling (a sibling of the host chips, so it
     *     matches the dock's round-button language).
     */
    const CSS = [
      // The feature: a slot marked collapsed hides its chip row. !important
      // wins the slot's inline `display: contents`, and the control (a sibling
      // inside the dock container, not a child of the slot) is unaffected.
      '[data-slot="conversation.composer.dock"][data-dsh-dock-collapsed="1"]{display:none !important}',
      // The control itself.
      '.dsh-dock-collapse{box-sizing:border-box;flex:0 0 auto;align-self:center;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:28px;height:24px;padding:0 9px;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-caption,#9aa4b2);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;transition:background .15s ease,color .15s ease,opacity .15s ease}',
      '.dsh-dock-collapse:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-secondary,#c4cdd8)}',
      '.dsh-dock-collapse:active{opacity:.75}',
      '.dsh-dock-collapse:focus-visible{outline:2px solid var(--dsw-alias-accent,var(--dsw-alias-state-accent,#5b8def));outline-offset:1px}',
      '.dsh-dock-collapse svg{flex:0 0 auto;width:15px;height:15px}'
    ].join('')

    /** Inject the stylesheet once, keyed so HMR reloads replace it in place. */
    function ensureStyles() {
      if (typeof document === 'undefined') return
      const existing = document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]')
      if (existing !== null) {
        if (existing.textContent !== CSS) existing.textContent = CSS
        return
      }
      const tag = document.createElement('style')
      tag.dataset.plugin = name
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /**
     * The one-time install: inject the stylesheet, reconcile the present dock,
     * then watch for the dock appearing, disappearing, or re-rendering. Returns
     * the cleanup the harness runs on unmount/HMR (disconnect the observer and
     * pull the control back out).
     */
    function install() {
      ensureStyles()
      scan()
      if (typeof MutationObserver === 'undefined') return () => {}

      let timer = 0
      const schedule = () => {
        if (timer !== 0) return
        timer = setTimeout(() => { timer = 0; scan() }, 120)
      }

      const observer = new MutationObserver((records) => {
        // Ignore churn confined to our own control (its innerHTML rewriting on
        // a state change); anything else may be the slot appearing or re-rendering.
        const ours = records.every((record) =>
          record.target && typeof record.target.closest === 'function'
            && record.target.closest('[' + CONTROL_ATTR + ']') !== null)
        if (!ours) schedule()
      })

      const root = document.body || document.documentElement
      if (root) observer.observe(root, { childList: true, subtree: true, attributes: true })

      return () => {
        if (timer !== 0) { clearTimeout(timer); timer = 0 }
        observer.disconnect()
        const controls = document.querySelectorAll('[' + CONTROL_ATTR + ']')
        Array.prototype.forEach.call(controls, (control) => control.remove())
      }
    }

    /**
     * Client plugin body: nothing to register in a slot, just install the
     * observer-backed control.
     * @param {object} ctx - client root context; only `ctx.effect` is used.
     */
    function apply(ctx) {
      if (ctx && typeof ctx.effect === 'function') {
        ctx.effect(install, 'dsh-plugin-dock-collapse: dock collapse control')
      } else {
        install()
      }
    }

    exports.name = name
    // Wait for the conversation UI's slot service before applying, so the dock
    // exists by the time the observer scans. Matches the sibling dock plugins.
    exports.inject = ['slots']
    exports.apply = apply
    return exports
  }
})
