/**
 * Pure computation of the chat rows a rewind hides from the rendered
 * transcript. Extracted from the client plugin (`src/client/index.ts`) so the
 * multi-rewind cut logic stays unit-testable without a DOM.
 *
 * @module dsh-session-timeline/client/hidden
 */
import type { ChatConversationViewNode, CommandNode } from '@x1a0f3n9/dsh-client-ui-chat/client';
/** Minimal chat snapshot reader the hiding logic needs. */
export interface HiddenChat {
    readonly order: readonly string[];
    readonly nodes: {
        get(key: string): ChatConversationViewNode | undefined;
    };
}
/** A live chat snapshot source owned by the Conversation UI. */
export interface ChatSnapshotSource {
    getSnapshot(): unknown;
}
/**
 * Reader for one session's assembled chat snapshot.
 */
export type ChatOf = (session: {
    readonly sessionId: string;
} | undefined) => HiddenChat | undefined;
/** Subscribe to one session's assembled chat updates. */
export type ChatWatch = (sessionId: string, cb: () => void) => () => void;
/**
 * Subscribe to one session's chat view.
 * @param resolveView - Resolves the chat view for a session.
 * @param sessionId - Session whose chat should be observed.
 * @param cb - Listener called after the view changes.
 * @returns A disposer for the subscription.
 */
export declare function resolveChatWatch(resolveView: (sessionId: string) => {
    subscribe(cb: () => void): () => void;
} | undefined, sessionId: string, cb: () => void): () => void;
/**
 * Read the assembled chat snapshot from the Conversation UI view.
 * @param chatView - View source for the session chat.
 * @returns The current chat snapshot, when available.
 */
export declare function chatSnapshotOf(chatView: ChatSnapshotSource | undefined): HiddenChat | undefined;
/**
 * The plain text of the human message at `seq` in the chat snapshot, for
 * filling the composer after a withdraw. Accepts BOTH `user` and `steering`
 * nodes: a plan-mode (`/plan <text>`) input is delivered through the agent
 * inbox next-step and claimed, so it renders as `steering`, and its text must
 * still return to the composer (`portals.tsx` `runRewindAndFill`) — the old
 * `user`-only read silently left it empty. State absent → undefined; a message
 * with no text blocks → ''. Same text-blocks join the candidate side uses.
 * @param chat - Input value used by messageTextAt.
 * @param seq - Input value used by messageTextAt.
 * @returns The result of messageTextAt.
 */
export declare function messageTextAt(chat: HiddenChat | undefined, seq: number): string | undefined;
/**
 * Extract the rewind target seq from a `/rewind` command's structured `args`
 * (e.g. `@5 chat`, `preview @5 both`). Locale-independent — never parses the
 * host's human outcome copy.
 * @param args - Input value used by targetSeqOfArgs.
 * @returns The result of targetSeqOfArgs.
 */
export declare function targetSeqOfArgs(args: string | null | undefined): number | undefined;
/**
 * True when a `/rewind` command node is an EXECUTED rewind for `seq` — the
 * admission form the popover drives (`@<seq> chat` / `both`) that settled
 * with a marker-carrying success outcome. The composer refill waits for
 * exactly this node after the user confirms, so a history-loaded command can
 * never trigger a fill.
 * @param node - Input value used by isExecutedRewindCommand.
 * @param seq - Input value used by isExecutedRewindCommand.
 * @returns The result of isExecutedRewindCommand.
 */
export declare function isExecutedRewindCommand(node: CommandNode, seq: number): boolean;
/**
 * Whether a preview outcome reports tracked file changes — the availability
 * of the "rewind conversation and code" option (Claude Code hides the
 * code-restore options when the checkpoint has no tracked changes).
 *
 * Reads ONLY the machine-readable `impact=<n>` trailer the host appends to
 * preview text. Older host output without the trailer is treated as having no
 * changes (never guesses from human copy). Unknown/absent text degrades to
 * always-show so a working option is never hidden on a failed probe.
 * @param text - Input value used by hasFileImpact.
 * @returns The result of hasFileImpact.
 */
export declare function hasFileImpact(text: string | undefined): boolean;
/**
 * True when a `/rewind` command node is the internal candidate-list probe
 * (`/rewind __candidates`) the popupSelect runs to fetch the FULL candidate
 * list from the host. Like previews, its flow node never surfaces in the
 * transcript — it only feeds the popup — so it is hidden in every state.
 * @param command - Input value used by isCandidateCommand.
 * @returns The result of isCandidateCommand.
 */
export declare function isCandidateCommand(command: CommandNode): boolean;
/**
 * Anchor seqs that must be hidden from the rendered transcript so the user
 * sees the conversation as the agent sees it: every impact-preview flow node
 * (pending, succeeded, or errored — it only exists to feed the popover) and
 * every SUCCESSFUL executed `/rewind` command row, plus every message
 * withdrawn by a rewind — the target message itself, everything after it, and
 * the (empty, unrendered) marker.
 *
 * Each executed rewind cuts ONE span `[target, marker]`: the target message
 * and everything after it, up to the marker appended at rewind time. Spans are
 * kept SEPARATE (never collapsed to a single `[min target, max marker]`)
 * because a later rewind to a LATER point leaves a visible gap of new traffic
 * between the earlier marker and the later target — collapsing the spans would
 * hide that still-on-surface gap. Endpoints come from the command nodes:
 * `sourceEventSeq` is the marker's log seq, and the outcome text carries the
 * target seq.
 * @param snap - Input value used by hiddenSeqsOf.
 * @returns The result of hiddenSeqsOf.
 */
export declare function hiddenSeqsOf(snap: HiddenChat): Set<number>;
//# sourceMappingURL=hidden.d.ts.map