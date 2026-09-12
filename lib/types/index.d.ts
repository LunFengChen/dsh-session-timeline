/**
 * dsh-session-timeline host half: the `/rewind` command and the Claude-Code-style
 * checkpoint store, composed as one dual-face bundle row (the browser half
 * lives in `src/client/`).
 *
 * Rewind mechanism: planning is pure (`src/rewind.ts`); execution permanently
 * truncates the selected turn and every later event from the live session and
 * the current durable generation. File restore (mode `both`) still uses the
 * checkpoint store. The plugin does not write a surface marker.
 *
 * File restore (mode `both`) follows Claude Code's checkpointing: the plugin
 * backs up each tracked write-class edit BEFORE it happens (at the
 * `tools/execute` around-dispatch stage, so an approval short-circuit cannot
 * skip the capture and a denied call never records), commits the backup under
 * the turn's anchor message seq at `tools/post-execute`, and a rewind to
 * message N restores every backup anchored at or after N — modified files are
 * written back to their pre-edit content, files created after N are deleted.
 * Backups persist on disk under the dsh data directory (newest 100 message
 * groups per session), so restores work after a host restart, and they
 * read/write the real file system with plain `node:fs` — independent of the
 * fs service. See `src/snapshot.ts`.
 *
 * @module dsh-session-timeline
 */
import type { Context } from '@deepseek-ai/cordis';
export { SnapshotStore } from './snapshot.ts';
export type { CheckpointEntry, FileImpact, PruneStaleReport, RestoreOutcome, RestoreJournal, RestoreJournalState, RestoreReconcileReport } from './snapshot.ts';
export declare const name = "dsh-session-timeline";
export declare const inject: string[];
/** Plugin config. */
export interface RewindConfig {
    /** Checkpoint store root (exact path; beats `DSH_REWIND_SNAPSHOT_DIR` and the harness-home default). */
    readonly snapshotDir?: string;
    /** Harness home override (`config.dshHome` > `$DSH_HOME` > `~/.dsh`); feeds the default snapshot/cleanup paths. */
    readonly dshHome?: string;
    /** In-place content dedup (identical before-content → link). Default `true`. */
    readonly dedup?: boolean;
}
/**
 * Register the `/rewind` command and the checkpoint pipeline (before-capture
 * at `tools/execute`, disk commit at `tools/post-execute`).
 *
 * The command is fs-independent and registers immediately. The checkpoint
 * pipeline needs `fs` to resolve tracked paths to their real display paths,
 * so it mounts through a dynamic `ctx.inject(['fs'])` — it takes effect
 * whenever the fs service becomes available (and never fails the plugin's
 * load when a deployment has no fs; without it, no entries are recorded and
 * `both` restores report "no tracked changes").
 *
 * Capture runs in `tools/execute` (the around-dispatch stage), NOT in
 * `tools/pre-execute`: a pre-execute `{ kind: 'ask' }` short-circuit from
 * another plugin (e.g. dsh-edit-approval) skips later pre-execute listeners,
 * and a denied call never dispatches — so approved calls are still captured,
 * denied calls never leave a pending entry behind. Entries are committed to
 * disk at `tools/post-execute` under the turn's anchor message seq.
 *
 * @param ctx - context carrying `commands`, `tools`, and an optional `fs`.
 * @param config - optional plugin config: `snapshotDir` (exact store-root override),
 *  `dshHome` (harness-home override feeding the default paths), `dedup`.
 */
export declare function apply(ctx: Context, config?: RewindConfig): void;
//# sourceMappingURL=index.d.ts.map