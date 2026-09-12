/**
 * dsh-session-timeline portal half: the per-user-message ↶ rewind button, rendered as a
 * React portal inside the message's `MessageIconActions` row.
 *
 * Why portals (aligned with the copy button's own rendering): the copy button
 * is a React child of the actions row, painted in the same commit as the
 * bubble. A pure-DOM `appendChild` (the earlier approach) lands one microtask
 * later and re-runs a full-transcript scan on EVERY mutation, which can push
 * the paint of a newly sent bubble — the "occasional hiccup before the bubble
 * shows". Portals let React own the button lifecycle (mount/unmount with the
 * row, no orphaned buttons, no manual re-attach after harness re-renders),
 * and the target collection is coalesced (one refresh per mutation batch) and
 * diffed (no setState churn when nothing changed).
 *
 * Mount point: the plugin registers a session-scoped bridge into the harness's
 * `conversation.session.header.actions` list slot. The bridge renders NO
 * header UI — it only portals buttons into the user rows of the session the
 * harness mounts it for. That slot is the harness-native way to get a
 * per-session React mount without touching any source; the registration is
 * typed structurally (see `SlotsLike`) so the plugin never imports the
 * conversation UI package's types and stays attached through the published slot seam.
 *
 * @module dsh-session-timeline/client/portals
 */
import { type ReactNode } from 'react';
import type { SessionFace } from '@x1a0f3n9/dsh-api-session-controller/client';
import { type ChatOf, type ChatWatch, type HiddenChat } from './hidden.ts';
import type { RewindKey } from './locales.ts';
type Translate = (key: RewindKey, params?: Record<string, unknown>) => string;
/** One portal target: the actions row of a user/steering seat + its durable node. */
export type PortalTarget = {
    readonly kind: 'durable';
    /** The seat's chat node key (React reconciliation + diff identity). */
    readonly key: string;
    /** The row's actions container (React portal target). */
    readonly container: HTMLElement;
    readonly seq: number;
    readonly time: number;
    readonly preview: string;
} | {
    readonly kind: 'pending';
    /** `pending:${itemId}` — stable per inbox occurrence. */
    readonly key: string;
    /** The row's actions container (React portal target). */
    readonly container: HTMLElement;
    /** The host inbox occurrence the retract button addresses. */
    readonly itemId: string;
    /** Complete editable text; null when the message contains non-text blocks. */
    readonly text: string | null;
    readonly preview: string;
};
/** Capabilities the session-scoped bridge receives from the plugin apply(). */
export interface RewindBridgeDeps {
    readonly sessionOf: (sessionId: string) => SessionFace | undefined;
    /** Reads the assembled Conversation chat view for one session. */
    readonly chatOf: ChatOf;
    /** Subscribe to the assembled chat view for command settlement waits. */
    readonly watchChat: ChatWatch;
    readonly currentSessionId: () => string | undefined;
    readonly t: Translate;
    readonly subscribeLocale: (cb: () => void) => () => void;
    /** Write a restored message through the session input API. */
    readonly setComposerText: (sessionId: string, text: string) => boolean;
}
/** Structural face of the runtime slot service (see the module doc). */
export interface SlotsLike {
    inject(key: string, install: () => () => void): () => void;
    register<P>(entry: {
        readonly name: string;
        readonly id?: string;
        readonly order?: number;
        readonly key?: string;
        readonly locale?: string;
        readonly inject?: () => P;
    }, component: (props: P) => ReactNode): () => void;
}
/**
 * Truncate from the popover target and, when that succeeds, put the
 * withdrawn user text back into the composer so the user can edit and re-send.
 * Both modes stop the live turn, then `deleteFrom` rewrites the log.
 * Workspace mode restores files first through the internal `/rewind __restore`
 * probe so the visible command card is never truncated out from under
 * `command/done`.
 */
export declare function runRewindAndFill(session: SessionFace, seq: number, mode: 'chat' | 'both', currentSessionId: () => string | undefined, chatOf: ChatOf, _watchChat: ChatWatch, setComposerText: (sessionId: string, text: string) => boolean): Promise<void>;
/**
 * Locate the action-button container for a user or steering row.
 *
 * Media can contain buttons of its own, so the last button in the row anchors
 * the action group. The plugin button is excluded to keep refreshes from
 * selecting its own portal target.
 * @param row - Rendered conversation row.
 * @returns The action container, when the row exposes one.
 */
export declare function actionsContainerOf(row: HTMLElement | undefined): HTMLElement | undefined;
/**
 * Collect the portal targets of one session: user rows × snapshot nodes.
 * Exported as a test seam — the DOM→targets pairing that drives the ↶ button
 * is otherwise only reachable through a full React portal render.
 */
export declare function collectTargets(chat: HiddenChat, hiddenSeqs: ReadonlySet<number>): readonly PortalTarget[];
interface RewindPortalsProps extends RewindBridgeDeps {
    readonly sessionId: string;
}
/**
 * Session-scoped portal bridge: renders the ↶ button of every user message
 * row of the session the harness mounts it for. The refresh is coalesced
 * (one pass per mutation batch via queueMicrotask) and diffed (setState is
 * skipped when the target set is unchanged), so the plugin never runs a
 * synchronous full-transcript scan inside a commit microtask.
 */
export declare function RewindPortals({ sessionId, sessionOf, chatOf, currentSessionId, watchChat, t, subscribeLocale, setComposerText, }: RewindPortalsProps): ReactNode;
/**
 * Read the current composer draft.
 * @returns The composer text, or an empty string when the composer is absent.
 */
export declare function composerText(): string;
/**
 * Build the slot-entry component for the plugin apply(): a tiny bridge that
 * injects the apply-time capabilities (session resolution, locale, rewind
 * runner) into the module-level `RewindPortals`.
 */
export declare function createRewindBridge(deps: RewindBridgeDeps): (props: {
    readonly sessionId: string;
}) => ReactNode;
export {};
//# sourceMappingURL=portals.d.ts.map