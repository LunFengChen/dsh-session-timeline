/**
 * Checkpoint store — the Claude Code style file-rewind backing for dsh-session-timeline.
 *
 * Claude Code's checkpointing (see README) works like this: it creates a
 * BACKUP of a file BEFORE every tracked modification, groups those backups by
 * the user message they belong to (a "checkpoint"), and rewinding to a
 * checkpoint restores every backup recorded at or after it — modified files
 * are written back to their pre-edit content, files created after the target
 * are deleted. This module is the same design, persisted on disk:
 *
 * - `tools/execute` captures the BEFORE state of each tracked write/edit call
 *   (or "created" when the file did not exist) — the capture happens at the
 *   around-dispatch stage, so an approval `ask` short-circuit cannot skip it
 *   and a denied call never records.
 * - The entry is committed to disk at `tools/post-execute` under the turn's
 *   anchor seq: `<root>/<sessionId>/<anchorSeq>/<callId>.json`, carrying the
 *   path and the before content (`before: null` = the file was created).
 * - Because entries live on disk under the dsh data directory, they survive a
 *   host restart, are bounded (the newest 100 anchor groups per session are
 *   kept), and restores read/write the real file system with plain `node:fs`
 *   — independent of the fs service.
 *
 * Security note: this `node:fs` authority is the DSH host authority every host
 * plugin holds — the model-facing fences constrain the model's tools, not this
 * code. The store stays bounded to the model-touched paths, so excluding a
 * file (e.g. `.env`) is a model-permission concern (see `SECURITY.md`).
 *
 * Crash safety (this module's own engineering asset):
 *  - Checkpoint commits are ATOMIC: the entry JSON is written to a sibling
 *    temp file and renamed over the target, so a host crash mid-write can
 *    never leave a readable half-written entry — at worst an inert `.tmp`
 *    leftover that the next commit of the same file overwrites and that no
 *    reader ever picks up.
 *  - Every restore pass is JOURNALED. Before mutating anything the store
 *    captures the pre-restore ("rescue") state of each planned path and
 *    persists an intent journal (`restore-journal-<op>.json` in the session
 *    dir), then marks each action done as it is applied. A crash at any point
 *    leaves the journal on disk; after a host restart
 *    `reconcileRestores(sessionId)` re-derives from the REAL disk which
 *    paths already match the target and which are still pending (reporting
 *    "restored up to where, what changed"), auto-heals journals whose goal is
 *    already reached, and `continueRestore` / `rollbackRestore` finish the
 *    interrupted op or undo it back to the exact pre-restore state.
 *  - Journal IO is best-effort and never fails a restore: if the journal
 *    cannot be written the restore proceeds exactly like the pre-journal code
 *    (crash safety degrades, behavior does not).
 *
 * Restore semantics (identical to Claude Code): for every path with entries
 * anchored at or after the target message, apply the EARLIEST entry — write
 * the before content back, or delete the file when that entry recorded a
 * creation. Symlinked and hard-linked paths are skipped and reported, never
 * written through.
 *
 * @module dsh-session-timeline/snapshot
 */
/**
 * Default store root: `<harness home>/rewind-snapshots`. Resolved through
 * {@link resolveDshHome} so the plugin follows `$DSH_HOME` (or a configured
 * harness home) rather than hardcoding `~/.dsh` — matching the other
 * first-party DSH packages. See `SECURITY.md` "Sensitive files".
 */
export declare const DEFAULT_SNAPSHOT_ROOT: string;
/** Environment variable overriding the store root (tests, exotic homes). */
export declare const SNAPSHOT_ROOT_ENV = "DSH_REWIND_SNAPSHOT_DIR";
/** Number of newest anchor groups (user messages) kept per session. */
export declare const MAX_ANCHOR_GROUPS = 100;
/** One committed before-backup, keyed by tool call. */
export interface CheckpointEntry {
    readonly callId: string;
    /** Seq of the user message anchoring the turn in which the change happened. */
    readonly anchorSeq: number;
    /** Resolved display path (absolute) of the tracked file. */
    readonly path: string;
    /** Full content before the change; null when the file was created. */
    readonly before: string | null;
    /** Epoch ms the entry was committed (stable ordering within a group). */
    readonly time: number;
}
/**
 * One in-place dedup link, keyed by tool call. When a tracked file is
 * recorded with a `before` content identical to the immediately-prior entry
 * for that path, the entry is stored as a LINK instead of a full copy: it
 * carries no `before`, only a `ref` naming the prior entry file
 * (`<anchorSeq>/<callId>.json`). The linear (predecessor-chained) ref makes
 * restore resolution and prune materialization rewrite-free.
 *
 * The real-entry format ({@link CheckpointEntry}) is unchanged so existing
 * data reads identically; links are a NEW entry kind only the current build
 * understands (old-build reads of links are explicitly out of scope).
 */
export interface LinkEntry {
    readonly callId: string;
    readonly anchorSeq: number;
    readonly path: string;
    /** `<anchorSeq>/<callId>.json` of the immediately-prior entry for the path. */
    readonly ref: string;
    readonly time: number;
}
/** Any on-disk entry: a full before-backup or an in-place dedup link. */
export type StoredEntry = CheckpointEntry | LinkEntry;
/** True when an entry is a dedup link (carries `ref`, not `before`).
 * @param entry - Input value used by isLinkEntry.
 * @returns The result of isLinkEntry.
 */
export declare function isLinkEntry(entry: StoredEntry): entry is LinkEntry;
/** Per-file restore impact preview (`/rewind preview @seq both`). */
export interface FileImpact {
    readonly path: string;
    /** `restore` = write the before content back; `delete` = remove the file. */
    readonly action: 'restore' | 'delete';
}
/** Outcome of one restore pass. */
export interface RestoreOutcome {
    readonly restored: readonly string[];
    readonly deleted: readonly string[];
    /** Symlinked or hard-linked paths left untouched. */
    readonly skipped: readonly string[];
    readonly failed: readonly {
        path: string;
        message: string;
    }[];
}
/** Deletes one file by its real path (node:fs, bypassing the fs service). */
export type DeleteFile = (path: string) => Promise<void>;
/**
 * Test-only fault injection: a crash point inside the write/restore paths.
 * The hook THROWS to simulate a host crash at the exact point; the throw
 * propagates out of the store method, leaving the journal on disk in its
 * current state. Production callers never pass it (undefined = no-op).
 */
export type CrashPoint = 'before-action' | 'after-action' | 'after-temp-write';
/** Options for the journaled restore paths; `crash` is the test-only seam. */
export interface RestoreRunOptions {
    /**
     * Throws at the given point to simulate a host crash: `before-action`
     * (before an action's fs op), `after-action` (right after the fs op,
     * before its done-mark is persisted), `after-temp-write` (inside an atomic
     * commit, between the temp write and the rename). `index` is the action
     * index for the restore loops.
     */
    readonly crash?: (point: CrashPoint, index?: number) => void;
}
/**
 * Lifecycle of one restore operation journal. Terminal states are kept on
 * disk as a tiny audit trail and skipped by reconciliation.
 */
export type RestoreJournalState = 'running' | 'rollback-running' | 'completed' | 'rolled-back' | 'recovery-required';
/**
 * One journaled restore action — a mutable working record that the restore
 * loop updates (done/failed) as it applies the pass.
 */
export interface RestoreJournalAction {
    readonly path: string;
    readonly action: 'restore' | 'delete';
    /** Target content for a restore; null for a delete. */
    readonly before: string | null;
    /**
     * Pre-restore disk state ("rescue"): the content the file had right before
     * the restore started, or null when it was absent. Rollback writes this
     * back, so the pre-restore state is recoverable exactly.
     */
    readonly rescue: string | null;
    /** Set when the rescue capture failed: rollback then skips this path. */
    rescueError?: string;
    /** True once the action's fs op completed and was marked. */
    done: boolean;
    /** Per-action failure message; the restore pass never aborts. */
    failed?: string;
}
/** Durable journal for one attempted restore (written atomically). */
export interface RestoreJournal {
    readonly version: 1;
    readonly id: string;
    readonly sessionId: string;
    readonly targetSeq: number;
    readonly startedAt: number;
    finishedAt?: number;
    state: RestoreJournalState;
    readonly actions: RestoreJournalAction[];
    /** Set when a rollback pass failed partway (state becomes `recovery-required`). */
    rollbackError?: string;
}
/**
 * Result of reconciling one interrupted restore journal against the real
 * disk. Path status is relative to the op's current goal: the restore target
 * for `running` journals, the pre-restore (rescue) state for
 * `rollback-running` / `recovery-required` journals — disambiguate with
 * {@link RestoreReconcileReport.journalState}.
 */
export interface RestoreReconcileReport {
    readonly opId: string;
    /** `interrupted` = a crash left the op unfinished; `recovery-required` = a rollback could not complete. */
    readonly state: 'interrupted' | 'recovery-required';
    /** Raw journal state (`running` | `rollback-running` | `recovery-required`). */
    readonly journalState: RestoreJournalState;
    readonly targetSeq: number;
    readonly startedAt: number;
    /** Paths whose disk already matches the op's goal. */
    readonly restored: readonly string[];
    /** Paths still short of the op's goal (not yet applied / not yet rolled back). */
    readonly pending: readonly string[];
    /** Actions that failed during the pass (kept failed until a redo succeeds). */
    readonly failed: readonly {
        path: string;
        message: string;
    }[];
    readonly rollbackError?: string;
    /** Set when the journal file itself is corrupt: it cannot be reconciled. */
    readonly corrupt?: string;
}
/**
 * Current-on-disk state probe used by restore planning. Injected so the plan
 * logic runs against a fake FS in tests; the production default reads the
 * real file system with plain `node:fs` (see {@link defaultProbe}).
 */
export interface DiskProbe {
    /**
     * Full text of the file, or undefined when the file does not exist.
     * Any thrown error is treated as a probe failure: restore planning then
     * conservatively treats the file as DIFFERING from its record (a restore
     * still attempts the write / a delete still attempts the unlink), so an
     * unreadable file is never silently skipped.
     */
    readText(path: string): Promise<string | undefined>;
    /** True when the path is a symlink or a hard link (never planned/restored). */
    isLink(path: string): Promise<boolean>;
}
/** One restore action the planner derived from record + disk reconciliation. */
export type PlannedAction = {
    readonly path: string;
    readonly action: 'restore';
    readonly before: string;
} | {
    readonly path: string;
    readonly action: 'delete';
};
/** Production probe: real reads via node:fs, links detected by lstat + nlink. */
export declare const defaultProbe: DiskProbe;
/**
 * Result of a stale-session cleanup sweep ({@link SnapshotStore.pruneStale}).
 *
 * The sweep is ANTI-DELETE: it only ever removes WHOLE session directories
 * that have been idle past `maxAgeDays`. `scanned` counts every session dir
 * evaluated; `kept` + `skippedActive` + `deleted` sum to it. `remainingBytes`
 * is the total of directories that SURVIVE the policy (when `dryRun` it is the
 * would-be total, not the current on-disk total), so it is comparable across
 * dry and real runs.
 */
export interface PruneStaleReport {
    /** Number of session directories evaluated. */
    readonly scanned: number;
    /** Session directories removed (would-be count when `dryRun`). */
    readonly deleted: number;
    /** Bytes reclaimed (would-be bytes when `dryRun`). */
    readonly freedBytes: number;
    /** Session directories retained (not past the cutoff, not the active one). */
    readonly kept: number;
    /** Bytes across the retained + skipped-active directories. */
    readonly remainingBytes: number;
    /** Directories skipped because they are the active session. */
    readonly skippedActive: number;
    /** Whether nothing was really removed (the sweep only reported). */
    readonly dryRun: boolean;
}
/**
 * Result of a manual whole-session clear ({@link SnapshotStore.clearSession}).
 *
 * Unlike the age-based sweep, a clear removes EVERY snapshot of ONE session
 * (all anchor groups, all checkpoint entries, all restore journals) on demand —
 * the active session the user is driving, to drop the rewind overhead or to
 * archive a conversation immediately. `dryRun` reports what would be removed
 * without touching disk or memory.
 */
export interface ClearSessionReport {
    /** The session whose records were (or would be) cleared. */
    readonly sessionId: string;
    /** Number of anchor-group (user-message) directories present. */
    readonly anchorGroups: number;
    /** Number of committed checkpoint entries (full backups + dedup links). */
    readonly entries: number;
    /** Number of restore-journal files (terminal + pending). */
    readonly journals: number;
    /** Bytes occupied by the session directory (the amount freed). */
    readonly bytes: number;
    /** Whether nothing was really removed (the clear only reported). */
    readonly dryRun: boolean;
}
/**
 * On-disk checkpoint store. Every write goes straight through `node:fs`, so a
 * restore reliably lands on the real file system.
 */
export declare class SnapshotStore {
    /** Debounce window for the per-commit prune (keeps the readdir+sort off the hot path). */
    private static readonly PRUNE_INTERVAL_MS;
    private lastPruneAt;
    /**
     * Monotonic entry clock. Date.now() has 1ms precision, so back-to-back
     * commits in the same millisecond would TIE on the entry `time` field and
     * entriesAfter's (anchorSeq, time) sort would fall back to the readdir
     * order — filesystem-dependent, so a re-read could pick the WRONG "earliest"
     * version for a path. Bumping past the previous commit keeps the capture
     * order reproducible after a re-read. The read-modify-write below is
     * synchronous (before the first await), so concurrent commits can never
     * observe the same value. Across restarts wall-clock monotonicity holds
     * (restart gaps dwarf 1ms); a backwards NTP step is the only way to break
     * it, and even then the in-process order still holds.
     */
    private lastEntryTime;
    /** Store options; `dedup` toggles in-place content dedup (default on). */
    private readonly dedup;
    /** Resolved checkpoint store root (absolute); see the constructor's fallback. */
    readonly root: string;
    /**
     * In-memory per-path "most recent entry" for content dedup, keyed by
     * `<sessionId>\0<path>`. Each value holds the entry's effective `before`
     * content and its own file ref, so a new record with the same content links
     * to the immediately-prior entry (linear chain). Seeded lazily per session
     * from the bounded on-disk window, so dedup survives a host restart.
     */
    private readonly lastEntry;
    /** Sessions whose dedup state has been seeded from disk this process. */
    private readonly seededSessions;
    constructor(root?: string, opts?: {
        readonly dedup?: boolean;
        readonly dshHome?: string;
    });
    /** Absolute path of one session's snapshot directory (id sanitized).
     * @param sessionId - Input value used by SnapshotStore.sessionDir.
     * @returns The result of SnapshotStore.sessionDir.
     */
    sessionDir(sessionId: string): string;
    /** Absolute path of one anchor group directory.
     * @param sessionId - Input value used by SnapshotStore.anchorDir.
     * @param anchorSeq - Input value used by SnapshotStore.anchorDir.
     * @returns The result of SnapshotStore.anchorDir.
     */
    anchorDir(sessionId: string, anchorSeq: number): string;
    /** Absolute file ref (relative to the session dir) of an entry. */
    private entryRefOf;
    /**
     * Seed a session's dedup state from the existing (bounded) on-disk window:
     * scan entries newest-first and record the most recent entry per path. This
     * makes content dedup survive a host restart within the session window. A
     * no-op after the first seed (or when `dedup` is disabled).
     */
    private ensureDedupSeeded;
    /**
     * Resolve an entry's effective `before` content, following a link chain to
     * its terminal real snapshot. Refs are strictly backward in
     * `(anchorSeq, time)`, so the chain is acyclic and finite. A dangling or
     * cyclic link throws — callers fail per-file (never silently dropping the
     * path from a restore).
     */
    private resolveBefore;
    /** Commit one before-backup (or an in-place dedup link) under its anchor.
     * @param sessionId - Input value used by SnapshotStore.recordEntry.
     * @param entry - Input value used by SnapshotStore.recordEntry.
     * @param opts - Input value used by SnapshotStore.recordEntry.
     */
    recordEntry(sessionId: string, entry: Omit<CheckpointEntry, 'time'>, opts?: {
        readonly dedup?: boolean;
        readonly crash?: (point: CrashPoint) => void;
    }): Promise<void>;
    /**
     * The effective content recorded by the path's MOST RECENT entry, or
     * undefined when the path has never been recorded (a fresh tracking sight).
     * This is the single in-memory "last known state" the boundary uses to
     * decide whether a tracked file changed — the same source `recordEntry`
     * dedups against, so there is one content copy and one comparison per
     * decision, not two. Seeding is idempotent (once per session from disk).
     * @param sessionId - Input value used by SnapshotStore.lastKnownContent.
     * @param path - Input value used by SnapshotStore.lastKnownContent.
     * @returns The result of SnapshotStore.lastKnownContent.
     */
    lastKnownContent(sessionId: string, path: string): Promise<string | null | undefined>;
    /**
     * All committed entries anchored at or after `targetSeq`, newest first (for
     * preview ordering). The boundary is inclusive: rewinding to a message also
     * reverts the changes its own turn caused (the rewind cut removes that
     * turn's assistant response and tool calls), so only entries anchored at
     * earlier messages survive.
     * @param sessionId - Input value used by SnapshotStore.entriesAfter.
     * @param targetSeq - Input value used by SnapshotStore.entriesAfter.
     * @returns The result of SnapshotStore.entriesAfter.
     */
    entriesAfter(sessionId: string, targetSeq: number): Promise<StoredEntry[]>;
    /**
     * Per-path EARLIEST committed entry anchored at or after the target — the
     * single source of truth for both restore and impact preview.
     */
    private earliestEntries;
    /**
     * The single source of truth for BOTH the impact preview and the restore
     * pass: reconcile the earliest recorded entry per path (at/after the
     * target) against the CURRENT on-disk state, and plan only the actions
     * that would actually change the disk. This is the Claude Code model —
     * `fileHistoryGetDiffStats` / `applySnapshot` both compare against the
     * live filesystem (`checkOriginFileChanged`) and count only real
     * differences, so a rewind whose target state already matches the disk is
     * a no-op with zero impact.
     *
     * - `before === null` (the file did not exist at the target) plans a
     *   `delete` ONLY when the file currently exists; an already-absent file
     *   is a no-op — this kills the "ghost impact" of replaying an entry a
     *   previous rewind already consumed.
     * - `before === 'X'` plans a `restore` ONLY when the current content
     *   differs from X (or the file is missing); identical content is a no-op
     *   — this keeps repeated rewinds idempotent.
     * - Symlinked / hard-linked paths are never planned (they are reported as
     *   skipped by the restore pass, never written through).
     * - A probe failure (e.g. a permission error reading the file) plans the
     *   action conservatively as if the file differed, so an unreadable file
     *   is never silently dropped from the restore.
     *
     * @param sessionId - session whose snapshot store to plan against.
     * @param targetSeq - rewind target; entries anchored at/after it apply.
     * @param probe - current-disk state probe (defaults to the real FS).
     * @returns the planned actions, the link paths skipped, and per-file failures.
     */
    private planRestore;
    /** Per-file restore impact: only actions that would actually change the disk.
     * @param sessionId - Input value used by SnapshotStore.impactsAfter.
     * @param targetSeq - Input value used by SnapshotStore.impactsAfter.
     * @param probe - Input value used by SnapshotStore.impactsAfter.
     * @returns The result of SnapshotStore.impactsAfter.
     */
    impactsAfter(sessionId: string, targetSeq: number, probe?: DiskProbe): Promise<FileImpact[]>;
    /**
     * Restore the workspace to the target message's checkpoint: execute exactly
     * the actions {@link planRestore} derived from the record + current disk
     * reconciliation — write the before content back, or delete the file when
     * it was created after the target and still exists. Symlinked and
     * hard-linked paths are skipped (reported, never written through); a
     * restored file's parent directory is created when it was deleted after
     * the backup; a delete whose file is ALREADY absent is a silent no-op (not
     * a failure — the target state is already reached). Failures are per-file
     * and never abort the pass.
     *
     * The pass is journaled for crash safety: the pre-restore ("rescue") state
     * of every planned path is captured and an intent journal persisted BEFORE
     * any mutation, then each action is marked done as it is applied. A host
     * crash at any point leaves the journal on disk; after a restart
     * {@link reconcileRestores} reports where the restore stopped,
     * {@link continueRestore} finishes it and {@link rollbackRestore} undoes it
     * back to the exact pre-restore state. Journal IO itself never fails the
     * restore (it degrades to a journal-less pass).
     * @param sessionId - Input value used by SnapshotStore.restoreAfter.
     * @param targetSeq - Input value used by SnapshotStore.restoreAfter.
     * @param deleteFile - Input value used by SnapshotStore.restoreAfter.
     * @param probe - Input value used by SnapshotStore.restoreAfter.
     * @param opts - Input value used by SnapshotStore.restoreAfter.
     * @returns The result of SnapshotStore.restoreAfter.
     */
    restoreAfter(sessionId: string, targetSeq: number, deleteFile: DeleteFile, probe?: DiskProbe, opts?: RestoreRunOptions): Promise<RestoreOutcome>;
    /** Prefix of one restore-op journal file inside the session dir. */
    private static readonly JOURNAL_PREFIX;
    /** Absolute path of one restore-op journal file. */
    private journalPath;
    /**
     * Best-effort journal persist: journal IO failures are non-fatal by design —
     * a restore must never fail because its audit journal could not be written.
     * reconcileRestores() re-derives the true state from the disk, so a missing
     * or stale journal only loses the trail, never the recovery ability.
     */
    private saveJournal;
    /**
     * Journal one restore pass before mutating anything: capture the rescue
     * (pre-restore) state of every planned path and persist the intent
     * atomically. Returns the in-memory journal; a persist failure degrades to
     * a journal-less restore (non-fatal, see {@link saveJournal}).
     */
    private beginRestore;
    /**
     * Read one journal by op id; undefined when it does not exist. A corrupt
     * journal THROWS (fail-loud): unlike checkpoint entries, silently dropping
     * a journal would silently erase the interrupted restore's recovery record.
     */
    private readJournal;
    /**
     * Every journal file of a session — valid ones plus corrupt ones with their
     * error — so reconciliation can report corruption instead of dropping it.
     */
    private listJournals;
    /**
     * Execute ONE fs mutation with exactly the pre-journal semantics: a delete
     * runs through the injected deleteFile (ENOENT tolerated — the file is
     * already absent, i.e. the target state is reached), a restore is a plain
     * writeFile with a recursive mkdir of the parent. Returns how the outcome
     * should record it.
     *
     * This is the only place the store writes restored content to the real FS,
     * and it is deliberately a raw `writeFile`/`unlink` rather than the fs
     * service: the caller only ever hands it a path from `planRestore` — one the
     * session's own write-class tool call recorded and resolved (never a
     * symlink/hard link) and only when it differs from the live disk. So no
     * arbitrary path, no model input, never automatic.
     */
    private applyActionToDisk;
    /**
     * Reconcile the session's restore journals against the real disk — the
     * "host restart" account: for every interrupted op, report which paths
     * already match its goal (restored) and which are still pending, and expose
     * any recorded failures. Journals whose goal is already fully reached on
     * disk (e.g. a later rewind completed the work) are auto-healed to their
     * terminal state and not reported. A corrupt journal is reported
     * `recovery-required` — never silently dropped.
     *
     * @param sessionId - session whose journals to reconcile.
     * @param probe - current-disk state probe (defaults to the real FS).
     * @returns one report per non-terminal journal still needing attention.
     */
    reconcileRestores(sessionId: string, probe?: DiskProbe): Promise<RestoreReconcileReport[]>;
    /**
     * Reconcile ONE non-terminal journal against the real disk. Returns
     * undefined when the op's goal is already fully reached (auto-heals to the
     * terminal state); otherwise a report of restored/pending/failed paths.
     * For `running` journals the goal is the restore target; for
     * `rollback-running` / `recovery-required` journals it is the rescue
     * (pre-restore) state.
     */
    private reconcileJournal;
    /**
     * 补做 (redo) an interrupted restore: finish the op by applying every action
     * whose disk state does not yet match its goal — the restore target for
     * `running` journals. Actions are decided by the REAL disk (the same "disk
     * is truth" rule as reconciliation), so a crash between an fs op and its
     * done-mark is completed deterministically and a path the user already
     * fixed is marked done without being rewritten. Failed actions are retried;
     * a re-failure re-records the failure. The journal becomes `completed` once
     * every action reaches the target.
     * @param sessionId - Input value used by SnapshotStore.continueRestore.
     * @param opId - Input value used by SnapshotStore.continueRestore.
     * @param deleteFile - Input value used by SnapshotStore.continueRestore.
     * @param probe - Input value used by SnapshotStore.continueRestore.
     * @param opts - Input value used by SnapshotStore.continueRestore.
     * @returns The result of SnapshotStore.continueRestore.
     */
    continueRestore(sessionId: string, opId: string, deleteFile: DeleteFile, probe?: DiskProbe, opts?: RestoreRunOptions): Promise<RestoreOutcome>;
    /**
     * 回滚 (roll back) an interrupted restore: undo every action whose disk
     * state does not match its rescue (pre-restore) record, returning the
     * workspace to the exact state it had before the restore started. Decided
     * by the REAL disk, so actions the crash left applied-but-unmarked are
     * undone too, and a path already back at its rescue state is skipped —
     * the pass is idempotent across crashes (a retry finishes the remaining
     * actions). The journal moves `running` → `rollback-running` → `rolled-back`;
     * a failed undo leaves it `recovery-required` (retryable), and paths whose
     * rescue capture failed are reported and left untouched.
     * @param sessionId - Input value used by SnapshotStore.rollbackRestore.
     * @param opId - Input value used by SnapshotStore.rollbackRestore.
     * @param deleteFile - Input value used by SnapshotStore.rollbackRestore.
     * @param probe - Input value used by SnapshotStore.rollbackRestore.
     * @param opts - Input value used by SnapshotStore.rollbackRestore.
     * @returns The result of SnapshotStore.rollbackRestore.
     */
    rollbackRestore(sessionId: string, opId: string, deleteFile: DeleteFile, probe?: DiskProbe, opts?: RestoreRunOptions): Promise<RestoreOutcome>;
    /**
     * Drop the session's oldest anchor groups beyond `keep` (default
     * {@link MAX_ANCHOR_GROUPS}), deleting their whole directories. Also
     * recycles terminal restore journals (see {@link pruneTerminalJournals}),
     * so the per-commit cap bounds BOTH the checkpoint entries and the journal
     * accumulation.
     *
     * Because dedup links reference prior entries, eviction is LINK-AWARE: before
     * deleting the oldest groups, any SURVIVING (kept-group) link whose `ref`
     * lands on a real snapshot inside a doomed group is MATERIALIZED (rewritten
     * as a real snapshot carrying the resolved content), so no kept link is left
     * dangling. Links form a linear predecessor chain, so materializing the first
     * link after each doomed real is enough — later links already point at that
     * materialized entry (or at other kept links), requiring no rewrite.
     *
     * `opts.crash` is the test-only seam: a crash fired inside a materialization
     * write (between its temp write and rename) leaves ONLY a `.tmp` — the doomed
     * real is still on disk and the kept link still resolves, so nothing dangles
     * and a later prune simply re-materializes.
     * @param sessionId - Input value used by SnapshotStore.prune.
     * @param keep - Input value used by SnapshotStore.prune.
     * @param opts - Input value used by SnapshotStore.prune.
     */
    prune(sessionId: string, keep?: number, opts?: {
        readonly crash?: (point: CrashPoint) => void;
    }): Promise<void>;
    /**
     * Recycle terminal restore journals (`completed` / `rolled-back`): once an
     * op finished, its journal's before + rescue content is dead weight that
     * would otherwise accumulate without bound (one journal per both-mode
     * rewind). Non-terminal journals (crashed ops awaiting reconcile /
     * continue / rollback) and unclassifiable (corrupt) ones are ALWAYS kept —
     * a recovery record that cannot be classified is never destroyed.
     */
    private pruneTerminalJournals;
    /** True when a path exists on disk (used by tests and diagnostics).
     * @param path - Input value used by SnapshotStore.exists.
     * @returns The result of SnapshotStore.exists.
     */
    exists(path: string): Promise<boolean>;
    /**
     * Cross-session retention sweep: remove WHOLE session directories whose
     * newest member stamp is older than `maxAgeDays` days of idle, keeping the
     * active session (`keepActiveId`) untouched. This is the anti-growth policy
     * for finished sessions (rewind only ever reads the active session, so a
     * finished session's backups are provably dead weight).
     *
     * SAFETY:
     *  - Only whole session directories are removed (dedup refs are
     *    session-relative, so there is no cross-session dangling to materialize);
     *  - the active session is never targeted (`keepActiveId`), and everything
     *    else is protected by its own mtime — a session that is still written to
     *    keeps scrolling its newest member stamp forward, so it is never old
     *    enough to be pruned;
     *  - a non-positive `maxAgeDays` throws instead of degenerating into a
     *    mass-destructive `cutoff` in the far future;
     *  - the walk uses `lstat` (no symlink following) and skips dot-prefixed
     *    temp left overs, so measurement stays inside the store root.
     *
     * `dryRun` computes and reports exactly what would be removed without
     * deleting anything — the `/snapshot-auto-cleanup run` preview.
     * @param opts - Input value used by SnapshotStore.pruneStale.
     * @returns The result of SnapshotStore.pruneStale.
     */
    pruneStale(opts: {
        readonly keepActiveId?: string;
        readonly maxAgeDays: number;
        readonly dryRun?: boolean;
    }): Promise<PruneStaleReport>;
    /**
     * All distinct paths ever recorded for a session — the "tracked files"
     * set. Mirrors Claude Code's global `trackedFiles` collection (files stay
     * tracked once a write-class tool touched them), derived from the disk
     * entries so no extra persistence is needed.
     * @param sessionId - Input value used by SnapshotStore.trackedPaths.
     * @returns The result of SnapshotStore.trackedPaths.
     */
    trackedPaths(sessionId: string): Promise<Set<string>>;
    /**
     * Summarize a session's on-disk footprint for a clear dry-run: anchor-group
     * count, committed checkpoint-entry count, restore-journal count, and total
     * bytes. Walks with `lstat` (never follows a symlink, so a hostile symlink
     * cannot escape the store root or inflate the measurement) and skips
     * dot-prefixed temp leftovers and non-`.json` members — they are never
     * checkpoint entries.
     */
    private sessionStats;
    /**
     * Remove a session's ENTIRE snapshot directory — every anchor group, every
     * checkpoint entry, and every restore journal — and reset the store's
     * in-memory dedup state so the session starts recording fresh from the
     * current workspace state. This is the manual "get rid of this session's
     * records NOW" action on the ACTIVE session the user is driving (it is never
     * targetable by id; that is a directory-manipulation concern the user can do
     * directly).
     *
     * SEMANTICS — clearing is an explicit abandonment: issuing the command means
     * the user accepts that this session's snapshot archive goes away. It is
     * therefore NOT gated on the state of any restore journal. A clear and a
     * restore are both slash commands the host runs to completion for an agent,
     * so they never interleave — any non-terminal journal present on disk is a
     * stale orphan from a previous (crashed) process, and discarding it is the
     * correct, safe resolution of that abandoned restore.
     *
     * SAFETY (this module's real concern is the plugin's ongoing BEHAVIOR, not
     * losing snapshots):
     *  - Only the session dir is removed; dedup refs are session-relative, so
     *    there is no cross-session dangling to materialize (the same rationale as
     *    {@link pruneStale}'s whole-dir removal).
     *  - The in-memory dedup state (`lastEntry` / `seededSessions`) is ALWAYS
     *    reset on an apply — even when the dir was already empty. A stale
     *    in-memory entry (e.g. a session whose dir was removed out-of-band) would
     *    otherwise link a later `recordEntry` to a deleted prior entry, leaving a
     *    dangling ref that breaks restore resolution. This is the primary
     *    correctness guarantee.
     *
     * `dryRun` computes the report without touching disk or memory.
     * @param sessionId - Input value used by SnapshotStore.clearSession.
     * @param opts - Input value used by SnapshotStore.clearSession.
     * @returns The result of SnapshotStore.clearSession.
     */
    clearSession(sessionId: string, opts?: {
        readonly dryRun?: boolean;
    }): Promise<ClearSessionReport>;
}
/**
 * Re-check every tracked file at a user-message boundary and record the
 * current on-disk state for any file whose state changed since it was last
 * seen — Claude Code's `fileHistoryMakeSnapshot` re-stats every tracked file
 * at each user message and snapshots the new state (changed files get a new
 * backup version, deleted files a null marker). Here the "new version" is a
 * plain before-backup entry anchored at the boundary message, so an EXTERNAL
 * edit or deletion (never seen by the write-class tool capture) enters the
 * record and can be restored by a later rewind.
 *
 * Semantics: the recorded `before` is the file's state at the boundary —
 * the state the boundary message's turn starts from, exactly like the
 * tool-captured entries. An entry is written only when the state differs
 * from the path's most-recent recorded content (`lastKnownContent`); a fresh
 * sighting (never recorded) always records. The state is compared against the
 * SAME single in-memory source `recordEntry` dedups against, so there is one
 * content copy and one comparison — not the two (a boundary map plus the
 * dedup map) the previous model held. Only CHANGED files are recorded, and
 * each is a full snapshot (`dedup: false`): a changed state always differs
 * from the recent record, so the link decision would never apply there.
 *
 * Symlinked / hard-linked paths are never re-checked (restores skip them).
 * A probe failure skips the file with a warning-level no-op; it never
 * aborts the boundary pass.
 *
 * @param store - the session's snapshot store.
 * @param sessionId - session whose tracked files to re-check.
 * @param anchorSeq - the boundary user-message seq (entry anchor).
 * @param tracked - the session's tracked path set (read-only here).
 * @param probe - current-disk state probe (defaults to the real FS).
 * @returns the number of entries recorded.
 */
export declare function reconcileTracked(store: SnapshotStore, sessionId: string, anchorSeq: number, tracked: ReadonlySet<string>, probe?: DiskProbe): Promise<number>;
//# sourceMappingURL=snapshot.d.ts.map