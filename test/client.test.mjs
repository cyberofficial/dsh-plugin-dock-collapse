/**
 * Client-half test. Loads the checked-in bundle exactly the way the browser
 * module system does (`window.__ModuleLoader__.load`), mounts it against a
 * jsdom document with a fake client context, then drives the real DOM path:
 * the appended collapse control, a click folding the dock, persistence in
 * localStorage, and re-expansion.
 *
 * jsdom is a test-only dep: a plain `npm install` puts it in this package's
 * node_modules, and inside the plugins workspace a sibling `.test-deps/`
 * install is also accepted. The suite skips cleanly when it is unavailable.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Require roots to search, most local first: this package's own node_modules,
 * then the workspace's shared `.test-deps`.
 * @type {import('node:module').NodeRequire[]}
 */
const requireRoots = [
  join(here, '..', 'package.json'),
  join(here, '..', '..', '.test-deps', 'package.json'),
]
  .map((path) => {
    try {
      return createRequire(path)
    } catch {
      return undefined
    }
  })
  .filter(Boolean)

/** First require root that can resolve `specifier`. */
function requireFrom(specifier) {
  for (const require of requireRoots) {
    try {
      return require(specifier)
    } catch {
      /* try the next root */
    }
  }
  return undefined
}

const jsdom = requireFrom('jsdom')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Boot the bundle against a fresh jsdom document, exposing the globals the
 * browser script consults (window/document/MutationObserver/console/setTimeout).
 * The factory needs no `require` (this plugin is React-free), so a require that
 * throws on anything is fine.
 * @param {string} [initialStorage] - a localStorage value to seed before apply.
 * @returns {object} the dom, window, exports, and the dock the test controls.
 */
function boot(initialStorage) {
  const dom = new jsdom.JSDOM(
    '<!doctype html><html><head></head><body></body></html>',
    { url: 'http://127.0.0.1:3080/', pretendToBeVisual: true },
  )
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  if (initialStorage !== undefined) {
    window.localStorage.setItem('dsh-plugin-dock-collapse', initialStorage)
  }
  let registration
  window.__ModuleLoader__ = { load: (entry) => { registration = entry } }
  const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
  const evaluate = new Function(
    'window', 'document', 'Node', 'MutationObserver', 'fetch', 'console', 'setTimeout', source,
  )
  evaluate(window, window.document, window.Node, window.MutationObserver, window.fetch, console, window.setTimeout)
  assert.ok(registration, 'bundle registers itself with the module loader')
  const factory = registration.factory
  const exports = factory(() => { throw new Error('unexpected require') })
  return { dom, window, exports }
}

/** Minimal client context the half consumes (only `effect` is used). */
function fakeContext() {
  return {
    ctx: {
      get: () => undefined,
      effect: (fn) => { fn(); return () => {} },
      logger: { info: () => {}, warn: () => {} },
    },
  }
}

/**
 * Build a stand-in for the host's composer dock: an outer flex container with
 * the slot the host renders chips into, a couple of fake chips, and the
 * context-usage gauge the host keeps as a sibling of the slot.
 * @returns {{ host: Element, slot: Element }}
 */
function makeDock() {
  const host = document.createElement('div')
  host.className = 'Orbv6G_dock'
  host.innerHTML =
    '<div data-slot="conversation.composer.dock" style="display: contents">' +
      '<span class="turns-pill">7 turns 102 steps</span>' +
      '<span class="chip-two">10.8M tok</span>' +
    '</div>' +
    '<span class="lPQtsG_root">13%</span>'
  document.body.appendChild(host)
  return { host, slot: host.querySelector('[data-slot="conversation.composer.dock"]') }
}

const maybe = jsdom === undefined ? describe.skip : describe

maybe('dsh-plugin-dock-collapse client bundle', () => {
  it('declares the slots dependency and a name matching its package', () => {
    const { exports } = boot()
    assert.deepEqual(exports.inject, ['slots'])
    assert.equal(exports.name, 'dsh-plugin-dock-collapse')
    assert.equal(typeof exports.apply, 'function')
  })

  it('injects its stylesheet on apply', async () => {
    const { exports, window } = boot()
    const { ctx } = fakeContext()
    exports.apply(ctx)
    await sleep(10)
    const style = window.document.head.querySelector('style[data-plugin="dsh-plugin-dock-collapse"]')
    assert.ok(style, 'stylesheet injected into head')
    assert.match(style.textContent, /\[data-slot="conversation\.composer\.dock"\]\[data-dsh-dock-collapsed="1"\]\{display:none !important\}/)
  })

  it('appends a collapse control into the dock once the slot appears', async () => {
    const { exports, window } = boot()
    const { ctx } = fakeContext()
    exports.apply(ctx)
    await sleep(10)
    // The slot does not exist yet; the observer must add the control once it does.
    const { slot } = makeDock()
    await sleep(200)
    const control = window.document.querySelector('[data-dsh-dock-collapse-control]')
    assert.ok(control, 'collapse control appended to the dock container')
    assert.equal(control.getAttribute('aria-label'), 'Collapse the composer dock: hides the chip rows under the chat')
    assert.equal(control.getAttribute('aria-expanded'), 'true')
    assert.ok(slot.className === '' || !slot.hasAttribute('data-dsh-dock-collapsed'), 'dock starts expanded')
  })

  it('folds the dock on click (the slot hides, the control stays) and persists it', async () => {
    const { exports, window } = boot()
    const { ctx } = fakeContext()
    exports.apply(ctx)
    await sleep(10)
    const { slot, host } = makeDock()
    await sleep(200)
    const control = window.document.querySelector('[data-dsh-dock-collapse-control]')

    control.click()
    await sleep(20)

    // The slot is gone from layout, but its control (a sibling in the container) remains.
    assert.equal(slot.getAttribute('data-dsh-dock-collapsed'), '1')
    assert.equal(window.getComputedStyle(slot).display, 'none', 'slot hidden by the collapse rule')
    assert.ok(host.contains(control), 'the control survives the fold')

    // Remembered in localStorage so a reload starts folded.
    assert.equal(window.localStorage.getItem('dsh-plugin-dock-collapse'), '1')

    // A second click re-expands and clears the persisted state.
    control.click()
    await sleep(20)
    assert.equal(slot.getAttribute('data-dsh-dock-collapsed'), '0')
    assert.equal(window.getComputedStyle(slot).display, 'contents')
    assert.equal(window.localStorage.getItem('dsh-plugin-dock-collapse'), '0')
  })

  it('honours a persisted collapsed state from the first scan', async () => {
    const { exports, window } = boot('1')
    const { ctx } = fakeContext()
    exports.apply(ctx)
    await sleep(10)
    const { slot } = makeDock()
    await sleep(200)
    assert.equal(slot.getAttribute('data-dsh-dock-collapsed'), '1')
    assert.equal(window.getComputedStyle(slot).display, 'none')
    const control = window.document.querySelector('[data-dsh-dock-collapse-control]')
    assert.equal(control.getAttribute('aria-expanded'), 'false', 'control shows Expand when already folded')
  })
})
