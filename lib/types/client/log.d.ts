/**
 * dsh-session-timeline client logger: a single, namespaced, level-filtered logging
 * channel for every browser-side diagnostic in this plugin.
 *
 * Design (industry-normal layering, kept dependency-free):
 * - `error` / `warn` are ALWAYS emitted (they are the anomaly guard: rare,
 *   cheap, and must surface even for a user who never touched the switch).
 * - `info` / `debug` are gated by a DEBUG switch and further filtered by
 *   namespace, so verbose detail never floods a normal user's console.
 *
 * The DEBUG switch is a runtime, per-origin knob read from
 * `localStorage['dsh-session-timeline.debug']` — the convention-debug-scan pattern
 * (namespace match, comma-separated, `*` wildcard), scoped to an
 * exclusively-own key so it can never enable any other plugin/feature and no
 * other feature can wake this one. Because it is read on every call (never
 * cached), flipping it and reloading takes effect on any published build
 * without a plugin rebuild.
 *
 * Values accepted by the switch (empty/unset = off):
 * - `dsh-session-timeline*`  — every dsh-session-timeline namespace.
 * - `dsh-session-timeline:refill` — just one subsystem (exact match).
 * - `dsh-session-timeline:refill,dsh-session-timeline:hiding` — several (comma-separated).
 *
 * @module dsh-session-timeline/client/log
 */
/** Log severity accepted by the client logger. */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
/**
 * Emit one diagnostic line. `error`/`warn` always print; `info`/`debug` print
 * only when the DEBUG switch selects the namespace. Both gated levels are
 * routed to the always-visible `console.info` rather than `console.debug`,
 * whose "Verbose" level Chrome filters out by default — otherwise a reporter
 * who turns the switch on still would not see the line without also changing
 * the DevTools level filter (mapped to `console.debug`). `data` is spread last
 * so DevTools' structured view keeps it inspectable (never stringified).
 * @param level - Input value used by log.
 * @param scope - Input value used by log.
 * @param message - Input value used by log.
 * @param data - Input value used by log.
 */
export declare function log(level: LogLevel, scope: string, message: string, data?: unknown): void;
/** Convenience shorthands (typed so call sites read cleanly). */
export declare const rewindLog: {
    readonly error: (scope: string, message: string, data?: unknown) => void;
    readonly warn: (scope: string, message: string, data?: unknown) => void;
    readonly info: (scope: string, message: string, data?: unknown) => void;
    readonly debug: (scope: string, message: string, data?: unknown) => void;
};
//# sourceMappingURL=log.d.ts.map