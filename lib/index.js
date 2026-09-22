/**
 * Host half of dsh-plugin-dock-collapse.
 *
 * There is intentionally nothing here: collapsing the composer dock is a pure
 * browser-side DOM concern (an appended control plus one stylesheet rule), so
 * the plugin ships no routes, no listeners, and no host-side state. The cordis
 * patch row exists only so the harness installs this package as a plugin and
 * the client module host pairs it with the package's `dsh.client` browser
 * bundle (`lib/client.js`), where the feature lives.
 *
 * @module dsh-plugin-dock-collapse
 */

/** Plugin name used for the cordis row and log lines. */
export const name = 'dsh-plugin-dock-collapse'

/** No service dependencies. */
export const inject = []

/**
 * Mount the plugin. A no-op: every behaviour is in the browser half.
 * @param {import('@deepseek-ai/cordis').Context} _ctx
 */
export function apply(_ctx) {
  // Client-only plugin; nothing to do on the host.
}
