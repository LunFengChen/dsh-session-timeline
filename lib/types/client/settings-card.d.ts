/**
 * dsh-session-timeline client settings card: the “Snapshot cleanup” page under
 * Settings > Plugins. It edits the policy exposed by the host settings scope.
 *
 * The card edits exactly two knobs — `enabled` (auto-cleanup switch) and
 * `maxAgeDays` (idle cutoff, a positive integer) — and stages them exactly like
 * the host-side /snapshot-auto-cleanup command does, so the GUI and the command
 * can never disagree. The switch collapses/expands the max-age editor; a
 * non-positive/non-integer draft blocks save (the same single validator the
 * host schema enforces). "Discard changes" restores the last-read baseline.
 *
 * The card receives a small structural `CleanupCardApi` from
 * `src/client/index.ts`, so rendering stays independent of host wiring and
 * remains unit-testable in isolation.
 *
 * @module dsh-session-timeline/client/settings-card
 */
/**
 * The dsh-settings namespace the card binds to. Duplicated here (not imported
 * from the host module) because the client build must stay free of host/node
 * imports; a cross-config test pins it equal to the host's constant. The
 * settings grammar forbids dots, so this is hyphenated.
 */
export declare const CLEANUP_SETTINGS_NAMESPACE = "dsh-session-timeline-snapshot-cleanup";
/** The defaults the host uses; shown as the field placeholder until a draft. */
export declare const DEFAULT_MAX_AGE_DAYS = 30;
/** The two editable knobs, exactly as the host policy exposes them. */
export interface CleanupPolicy {
    readonly enabled: boolean;
    readonly maxAgeDays: number;
}
/** A staged draft: the switch state and the raw (unparsed) max-age text. */
export interface CleanupDraft {
    readonly enabled: boolean;
    readonly maxAgeDays: string;
}
/** The structural api the card reads/saves through (supplied by the client). */
export interface CleanupCardApi {
    /** Read the resolved policy; `undefined` while the describe mirror loads. */
    read(): CleanupPolicy | undefined;
    /** Whether the settings source accepts writes (false = read-only card). */
    writable(): boolean;
    /** Persist a validated policy; rejects on failure. */
    save(next: CleanupPolicy): Promise<void>;
    /** Optional change subscription (returns the disposer). */
    subscribe(cb: () => void): () => void;
}
/** Translate one client dictionary key (the card's `t`). */
export type CardTranslate = (key: string, params?: Record<string, string | number>) => string;
/** Load a draft from a policy (defaults when the view has not loaded). */
export declare function draftFrom(policy: CleanupPolicy | undefined): CleanupDraft;
/** Parse the max-age text: a strict positive integer, else `null`. */
export declare function maxAgeOf(text: string): number | null;
/**
 * The policy a draft resolves to, or `null` when the max-age draft is invalid
 * (which blocks save). `enabled` is always a boolean from the switch, and
 * `maxAgeDays` comes from the validated draft.
 */
export declare function configOf(draft: CleanupDraft): CleanupPolicy | null;
/** True when the draft differs from the baseline (an unsaved edit). */
export declare function dirtyOf(base: CleanupDraft, draft: CleanupDraft): boolean;
/**
 * The card body. Draws the switch (+ collapse), the max-age editor, and the
 * discard/save actions. Pure of host wiring: everything goes through the
 * supplied {@link CleanupCardApi}.
 * @param api - the read/write transport.
 * @param t - the client dictionary translator.
 * @returns the card element.
 */
export declare function SettingsCleanupCard({ api, t }: {
    api: CleanupCardApi;
    t: CardTranslate;
}): import("react").JSX.Element;
//# sourceMappingURL=settings-card.d.ts.map