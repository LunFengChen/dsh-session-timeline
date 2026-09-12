/**
 * Snapshot cleanup policy: the persisted config file, its validation, the
 * `/snapshot-auto-cleanup` command's argument grammar, and the auto-sweep
 * throttle. Kept free of host wiring so the policy and the parser are
 * unit-testable in isolation; `src/index.ts` is the only consumer.
 *
 * Semantics (the "cleanup" vocabulary deliberately avoids "retention"):
 * - `enabled` toggles the AUTOMATIC (24h) sweep. `false` (the default) keeps
 *   every snapshot — the pre-feature behavior — and never writes a file.
 * - `maxAgeDays` is the only "keep" knob: a finished session dir whose newest
 *   member stamp is older than this many days of idle is removed by a sweep.
 *   `0`/negative/non-integer are rejected, so a broken file can never steer
 *   the sweep into deleting everything.
 * - The config file is created ONLY by an explicit `/snapshot-auto-cleanup`
 *   write. An absent file reads as the safe default (off); an unreadable or
 *   invalid file reports `ok:false` so a sweep fail-closes (deletes nothing)
 *   instead of guessing.
 *
 * @module dsh-session-timeline/snapshot-cleanup
 */
import z from '@deepseek-ai/schemastery';
/** The cleanup policy, as persisted under `~/.dsh/snapshot-cleanup.json`. */
export interface CleanupConfig {
    readonly enabled: boolean;
    readonly maxAgeDays: number;
}
/** File name used for the cleanup policy. */
export declare const CLEANUP_CONFIG_FILENAME = "snapshot-cleanup.json";
/** The default keep threshold: finished sessions idle > 30 days are pruned. */
export declare const DEFAULT_MAX_AGE_DAYS = 30;
/** The safe default policy (off) — a missing/corrupt file behaves like this. */
export declare const DEFAULT_CLEANUP_CONFIG: CleanupConfig;
/**
 * The dsh-settings namespace that backs the cleanup policy after migration.
 * Namespaces must match the settings provider's `^[a-z][a-z0-9-]*$` grammar (no
 * dots), so this is hyphenated, not dotted.
 */
export declare const CLEANUP_SETTINGS_NAMESPACE = "dsh-session-timeline-snapshot-cleanup";
/**
 * The schemastery schema that persists + validates the cleanup policy in the
 * dsh-settings document. This is the SINGLE storage validator: the `maxAgeDays`
 * rule is enforced by `.step(1).min(1)` (positive integer) and the defaults by
 * `.default(...)`, so the resolved value is always a valid {@link CleanupConfig}
 * and a bad stored/user value cannot steer the sweep into deleting everything.
 */
export declare const CleanupConfigSchema: z<CleanupConfig>;
/**
 * Structural face of the settings scope the host needs for the policy: a
 * resolved read and a validated write. Kept local so the host bundle exposes
 * only the current settings operations this feature needs.
 */
export interface CleanupSettingsScope {
    /** The resolved policy: schema defaults, then base, then the user layer. */
    get(): CleanupConfig;
    /** Merge a partial patch into the user layer (validated by the schema). */
    update(patch: {
        enabled?: boolean;
        maxAgeDays?: number;
    }): Promise<void>;
}
/** A validated policy read/write port the command + auto-sweep use. */
export interface CleanupConfigStore {
    /** The resolved policy (always schema-valid, fail-closes when unavailable). */
    load(): CleanupConfig;
    /** Persist a validated policy, throwing when invalid or unavailable. */
    save(next: CleanupConfig): Promise<void>;
}
/**
 * Adapter that turns a {@link CleanupSettingsScope} into a
 * {@link CleanupConfigStore}. Reads come straight from the resolved scope; a
 * write validates via `parseCleanupConfig` before touching the scope, so a bad
 * value can never reach the document (defense-in-depth below the schema).
 * @param scope - Input value used by settingsCleanupStore.
 * @returns The result of settingsCleanupStore.
 */
export declare function settingsCleanupStore(scope: CleanupSettingsScope): CleanupConfigStore;
/**
 * One-time migration of the pre-GUI cleanup policy file into the settings
 * document. Idempotent and cheap: it is called on every startup but only does
 * work once — a present-and-parsed legacy file is written into the scope and
 * then deleted, after which the read is an ENOENT no-op. A missing file is a
 * no-op; an invalid file writes the safe default (deleting nothing) and logs.
 * This is the ONLY consumption of {@link loadCleanupConfig} after migration.
 * @returns whether a legacy file was actually migrated.
 * @param legacyPath - Input value used by migrateLegacyCleanupConfig.
 * @param scope - Input value used by migrateLegacyCleanupConfig.
 * @param log - Input value used by migrateLegacyCleanupConfig.
 */
export declare function migrateLegacyCleanupConfig(legacyPath: string, scope: CleanupSettingsScope, log: (msg: string) => void): Promise<boolean>;
/** Auto-sweep cadence (the user's hardcoded 24h rhythm — not user-set). */
export declare const AUTO_SWEEP_INTERVAL_MS: number;
/**
 * Resolve the LEGACY pre-migration config file path (the only remaining use of
 * the file store): `<harness home>/snapshot-cleanup.json`, derived from
 * `dshHome` (config.dshHome > `$DSH_HOME` > `~/.dsh`) so the migration follows
 * the harness home instead of hardcoding `~/.dsh`. The `DSH_SNAPSHOT_CLEANUP_CONFIG`
 * env override was removed when the policy moved into the dsh-settings document.
 * @param dshHome - Input value used by resolveCleanupConfigPath.
 * @returns The result of resolveCleanupConfigPath.
 */
export declare function resolveCleanupConfigPath(dshHome?: string): string;
/** The state file that records the last automatic-sweep wall-clock time. */
export declare const STATE_FILENAME = "snapshot-cleanup-last-sweep.json";
/**
 * Resolve the last-sweep state path. It sits beside the config file so the
 * 24h cadence SURVIVES a host restart (a real deployment is rarely up 24/7,
 * so an in-memory timestamp would reset on every boot and re-sweep too often).
 * @param dshHome - Input value used by resolveCleanupStatePath.
 * @returns The result of resolveCleanupStatePath.
 */
export declare function resolveCleanupStatePath(dshHome?: string): string;
/**
 * Read the persisted last-sweep time (epoch ms). A missing or corrupt file
 * reads as `0` ("never swept"), so the next activity runs the sweep — which is
 * safe because the sweep is idempotent and never deletes the active session.
 * @param path - Input value used by loadLastSweepAt.
 * @returns The result of loadLastSweepAt.
 */
export declare function loadLastSweepAt(path: string): Promise<number>;
/** Persist the last-sweep time, atomically (temp + rename).
 * @param path - Input value used by saveLastSweepAt.
 * @param ms - Input value used by saveLastSweepAt.
 */
export declare function saveLastSweepAt(path: string, ms: number): Promise<void>;
/** The slice of a store `runAutoCleanupCheck` needs (pruneStale). */
export interface AutoCleanupPruner {
    pruneStale(opts: {
        keepActiveId?: string;
        maxAgeDays: number;
        dryRun?: boolean;
    }): Promise<unknown>;
}
/**
 * The one-shot auto-cleanup check. Loads the policy + persisted last-sweep time
 * and, only when enabled AND >=24h since the last sweep, runs the sweep and
 * re-anchors the window on disk. Dependencies (store, paths, logger) are
 * injected so the composition is unit-testable without a host. Never rejects:
 * a corrupt config fail-closes (no deletion) and logs, a prune failure logs.
 *
 * `sessionId` is the active session directory that must never be pruned.
 * @param deps - Input value used by runAutoCleanupCheck.
 * @param sessionId - Input value used by runAutoCleanupCheck.
 */
export declare function runAutoCleanupCheck(deps: {
    pruner: AutoCleanupPruner;
    readConfig: () => Promise<{
        ok: true;
        config: CleanupConfig;
    } | {
        ok: false;
        error: string;
    }>;
    statePath: string;
    log: (msg: string) => void;
}, sessionId: string | undefined): Promise<void>;
/**
 * Validate one parsed JSON value into a {@link CleanupConfig}. Tolerates
 * unknown extra keys; rejects a present-but-wrong-typed known key. Missing
 * known keys fall back to the safe default.
 * @param raw - Input value used by parseCleanupConfig.
 * @returns The result of parseCleanupConfig.
 */
export declare function parseCleanupConfig(raw: unknown): {
    ok: true;
    config: CleanupConfig;
} | {
    ok: false;
    error: string;
};
/**
 * Load and validate the config file. A missing file is NOT an error: it reads
 * as the safe default (off, `fromFile:false`). An unreadable, non-JSON, or
 * structurally-invalid file is `ok:false` so a sweep fail-closes.
 * @param path - Input value used by loadCleanupConfig.
 * @returns The result of loadCleanupConfig.
 */
export declare function loadCleanupConfig(path: string): Promise<{
    ok: true;
    config: CleanupConfig;
    fromFile: boolean;
} | {
    ok: false;
    error: string;
}>;
/**
 * Persist a validated {@link CleanupConfig}, atomically (temp + rename). Any
 * invalid value throws before the file is touched, so the command can never
 * write a broken policy.
 * @param path - Input value used by saveCleanupConfig.
 * @param config - Input value used by saveCleanupConfig.
 */
export declare function saveCleanupConfig(path: string, config: CleanupConfig): Promise<void>;
/** The `/snapshot-auto-cleanup` sub-command the parser can resolve to. */
export type CleanupCommandAction = 'status' | 'on' | 'off' | 'max-age' | 'run';
/** A parsed `/snapshot-auto-cleanup` command (excludes the error branch). */
export type CleanupCommand = {
    action: 'status' | 'on' | 'off';
} | {
    action: 'max-age';
    value: number;
} | {
    action: 'run';
    target: 'rules' | 'current';
    apply: boolean;
};
/**
 * Parse the free-form text after `/snapshot-auto-cleanup`. Pure so it is
 * unit-testable; `src/index.ts` maps the resolved action onto the store / the
 * config file. `max-age` returns the validated positive day count.
 *
 * The `run` verb is the single manual-cleanup action. `--apply` is the ONLY
 * execute-vs-dry-run switch (position-independent): without it the action is a
 * dry-run preview. `--current` re-targets the action to the ACTIVE session's
 * snapshots (the manual "clear this session now"); without it, `run` keeps its
 * age-based stale-session sweep semantics. The old `run-apply` abbreviation is
 * gone — use `run --apply`.
 * @param rawInput - Input value used by parseCleanupCommand.
 * @returns The result of parseCleanupCommand.
 */
export declare function parseCleanupCommand(rawInput: string): CleanupCommand | {
    error: string;
};
/**
 * The 24h auto-sweep throttle. `lastAtMs` of `0` means "never ran" (a fresh
 * process), so the first call always sweeps; after that a call within 24h is
 * a no-op, matching the "every machine at most once per day" model.
 * @param lastAtMs - Input value used by shouldRunAutoSweep.
 * @param nowMs - Input value used by shouldRunAutoSweep.
 * @returns The result of shouldRunAutoSweep.
 */
export declare function shouldRunAutoSweep(lastAtMs: number, nowMs: number): boolean;
//# sourceMappingURL=snapshot-cleanup.d.ts.map