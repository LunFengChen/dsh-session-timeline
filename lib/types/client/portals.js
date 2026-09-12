import { jsx as _jsx } from "react/jsx-runtime";
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
import { useEffect, useLayoutEffect, useReducer, useRef, useState, createElement, } from 'react';
import { createPortal } from 'react-dom';
import { SessionSeq } from '@x1a0f3n9/dsh-session/types';
import { hiddenSeqsOf, messageTextAt } from "./hidden.js";
import { messagePreviewOf } from "./candidates.js";
import { openPopover } from "./popover.js";
import { matchPendingRows, retractSpan } from "./pending.js";
import { rewindLog } from "./log.js";
import { CLASS, REWIND_ICON_SVG } from "./styles.js";
/** Join the text blocks of a user message into one plain preview. */
// (shared with the `/rewind` command decoration — see `messagePreviewOf` in candidates.ts)
/** The durable user/steering node behind a seat key via the runtime snapshot. */
function userNodeOf(chat, key) {
    const node = chat?.nodes.get(key);
    if (node === undefined || (node.kind !== 'user' && node.kind !== 'steering'))
        return undefined;
    // SteeringMessageNode carries the same seq/time/content/source fields.
    return node.data;
}
/**
 * Truncate from the popover target and, when that succeeds, put the
 * withdrawn user text back into the composer so the user can edit and re-send.
 * Both modes stop the live turn, then `deleteFrom` rewrites the log.
 * Workspace mode restores files first through the internal `/rewind __restore`
 * probe so the visible command card is never truncated out from under
 * `command/done`.
 */
export async function runRewindAndFill(session, seq, mode, currentSessionId, chatOf, _watchChat, setComposerText) {
    let text;
    try {
        text = messageTextAt(chatOf(session), seq);
    }
    catch (error) {
        rewindLog.warn('refill', `reading target text for @${seq} threw`, error);
        return;
    }
    try {
        await session.cancel();
        if (mode === 'both') {
            const restored = await session.command(`/rewind __restore @${seq}`);
            if (!restored.ok || restored.value?.matched !== true) {
                rewindLog.warn('refill', `file restore probe failed @${seq}`);
            }
        }
        const deleted = await session.deleteFrom(SessionSeq(seq));
        if (!deleted.ok) {
            showHint(deleted.error.message);
            return;
        }
    }
    catch (error) {
        rewindLog.warn('refill', `rewind threw, skipping refill @${seq}`, error);
        try {
            await session.resync();
        }
        catch (resyncError) {
            rewindLog.warn('refill', `resync after rewind failure @${seq} threw`, resyncError);
        }
        return;
    }
    // The user may have switched sessions while the rewind ran — fill only
    // the composer of the session the rewind actually happened in.
    if (currentSessionId() !== session.sessionId) {
        return;
    }
    if (text === undefined || text === '') {
        return;
    }
    // Empty-composer guard (Claude Code parity, matches retractPending): never
    // clobber a draft the user is already editing.
    if (composerText().trim() !== '') {
        return;
    }
    try {
        setComposerText(session.sessionId, text);
    }
    catch (error) {
        rewindLog.warn('refill', `composer refill @${seq} threw`, error);
        return;
    }
}
/** The current Web composer surface. */
function composerSurface() {
    return document.querySelector(COMPOSER_SELECTOR);
}
/** Transient status toast above the composer (rewind-failure notification). */
function showHint(text) {
    const surface = composerSurface();
    const hint = document.createElement('div');
    hint.className = CLASS.guardHint;
    hint.setAttribute('role', 'status');
    hint.textContent = text;
    document.body.appendChild(hint);
    if (surface !== null) {
        const card = surface.closest('[data-composer-card]');
        const rect = card instanceof HTMLElement ? card.getBoundingClientRect() : surface.getBoundingClientRect();
        hint.style.left = `${Math.round(rect.left)}px`;
        hint.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
    }
    window.setTimeout(() => hint.remove(), 3200);
}
/** The current Web composer surface selector. */
const COMPOSER_SELECTOR = '[data-composer-input]';
/** Both durable user messages and durable steering inputs render user-style rows. */
const USER_SEAT_SELECTOR = '[data-chat-flow-kind="user"][data-chat-anchor-key], [data-chat-flow-kind="steering"][data-chat-anchor-key]';
/** Every conversation seat row (hidden rows included). */
const CHAT_SEAT_SELECTOR = '[data-chat-anchor-key]';
/** Pending steering bubble rows (Host-authoritative pre-admission projection). */
const PENDING_SEAT_SELECTOR = '[data-pending-steering]';
/**
 * Locate the action-button container for a user or steering row.
 *
 * Media can contain buttons of its own, so the last button in the row anchors
 * the action group. The plugin button is excluded to keep refreshes from
 * selecting its own portal target.
 * @param row - Rendered conversation row.
 * @returns The action container, when the row exposes one.
 */
export function actionsContainerOf(row) {
    const buttons = Array.from(row?.querySelectorAll('button') ?? []);
    const lastButton = buttons.filter(button => !button.classList.contains(CLASS.button)).at(-1);
    const container = lastButton?.parentElement;
    return container instanceof HTMLElement && container.querySelector('button') !== null
        ? container
        : undefined;
}
/**
 * Collect the portal targets of one session: user rows × snapshot nodes.
 * Exported as a test seam — the DOM→targets pairing that drives the ↶ button
 * is otherwise only reachable through a full React portal render.
 */
export function collectTargets(chat, hiddenSeqs) {
    const rows = new Map();
    for (const element of document.querySelectorAll(USER_SEAT_SELECTOR)) {
        const key = element.dataset.chatAnchorKey;
        if (key !== undefined)
            rows.set(key, element);
    }
    const targets = [];
    for (const key of chat.order) {
        const node = chat.nodes.get(key);
        if (node === undefined || (node.kind !== 'user' && node.kind !== 'steering'))
            continue;
        const user = node.data;
        // A withdrawn row must not get a button (it is not part of the surface).
        if (hiddenSeqs.has(node.anchorSeq ?? user.seq))
            continue;
        const row = rows.get(key);
        const actions = actionsContainerOf(row);
        // The actions row is the last child of the user row and holds the
        // copy/branch IconActions; refuse to portal when the DOM does not match
        // (a layout change must not break the conversation).
        if (actions === undefined)
            continue;
        targets.push({ kind: 'durable', key, container: actions, seq: user.seq, time: user.time, preview: messagePreviewOf(user) });
    }
    return targets;
}
/**
 * The pending bubble row's message text EXCLUDING its trailing actions
 * container. The harness copy button inside that container wraps its label in
 * a Tooltip whose bubble mounts (hover, delayMs=0) as a DOM node inside the
 * row — so the full row `textContent` flips between "message" and
 * "message+Copy" with the mouse. Reading the bubble text from a CLONE (the
 * live row is never touched) keeps the strict equality in `matchPendingRows`
 * stable while the user hovers the action buttons.
 */
function bubbleTextOf(row) {
    const clone = row.cloneNode(true);
    // The actions container is the last child of the pending bubble row. If the
    // harness structure ever changes, the clone keeps the extra text and the
    // strict match degrades to no button (never a wrong attachment).
    clone.lastElementChild?.remove();
    return clone.textContent ?? '';
}
/**
 * Collect the portal targets of one session's pending steering bubbles. The
 * retract button is the pre-sent window's counterpart of the durable rewind
 * button: it exists whenever the Host holds the message in its next-step
 * inbox (running or paused), and it retracts through the session's own
 * `updateQueue` channel — no DSH behavior changes.
 */
function collectPendingTargets(snapshot) {
    // Subagent sessions reject queue mutations host-side; mirror the harness's
    // own QueueDock gate (queueMutable = subagent === null).
    if (snapshot.subagent !== null)
        return [];
    const steering = snapshot.queue.filter(item => item.placement === 'steering');
    if (steering.length === 0)
        return [];
    const rows = Array.from(document.querySelectorAll(PENDING_SEAT_SELECTOR));
    const matched = matchPendingRows(rows.map(row => ({ text: bubbleTextOf(row) })), steering.map(item => ({ id: item.id, text: item.text })));
    const targets = [];
    for (let i = 0; i < matched.length; i++) {
        const itemId = matched[i];
        if (itemId === undefined || itemId === null)
            continue;
        const row = rows[i];
        if (row === undefined)
            continue;
        // Pending rows expose the same action group as durable rows.
        const actions = actionsContainerOf(row);
        if (actions === undefined)
            continue;
        const item = steering[i];
        if (item === undefined)
            continue;
        targets.push({
            kind: 'pending',
            key: `pending:${itemId}`,
            container: actions,
            itemId,
            text: item.text,
            preview: item.preview,
        });
    }
    return targets;
}
/** Whether two target lists describe the same portals (order-sensitive). */
function sameTargets(left, right) {
    return left.length === right.length && left.every((target, index) => {
        const other = right[index];
        if (other === undefined || target.key !== other.key || target.container !== other.container)
            return false;
        if (target.kind === 'durable')
            return other.kind === 'durable' && target.seq === other.seq;
        return other.kind === 'pending' && target.itemId === other.itemId;
    });
}
/**
 * Session-scoped portal bridge: renders the ↶ button of every user message
 * row of the session the harness mounts it for. The refresh is coalesced
 * (one pass per mutation batch via queueMicrotask) and diffed (setState is
 * skipped when the target set is unchanged), so the plugin never runs a
 * synchronous full-transcript scan inside a commit microtask.
 */
export function RewindPortals({ sessionId, sessionOf, chatOf, currentSessionId, watchChat, t, subscribeLocale, setComposerText, }) {
    const [targets, setTargets] = useState([]);
    // Rows we have hidden; re-shown when they leave the withdrawn span.
    const hidden = useRef(new WeakSet());
    // Re-render when the active locale switches so injected button labels
    // keep following the dsh language preference (the popover and guard hint
    // are created fresh each time and already read the current locale).
    const [, forceRender] = useReducer((count) => count + 1, 0);
    useEffect(() => subscribeLocale(() => { forceRender(); }), [subscribeLocale]);
    useLayoutEffect(() => {
        let active = true;
        let queued = false;
        const refresh = () => {
            if (!active)
                return;
            const session = sessionOf(sessionId);
            if (session === undefined) {
                // Session binding gone (teardown window): drop every portal.
                setTargets([]);
                return;
            }
            const snapshot = session.getSnapshot();
            // The durable path waits for the assembled chat view; pending targets
            // remain available while that view is not ready.
            const chat = chatOf(session);
            const hiddenSeqs = chat === undefined ? new Set() : hiddenSeqsOf(chat);
            // Hide withdrawn rows (rewind markers, /rewind command rows, and every
            // message inside the executed rewinds' [earliest target, latest marker]
            // span) so the rendered transcript matches the agent's context. React
            // re-renders recreate rows, so this runs on every refresh.
            //
            // Each hidden row also carries a semantic marker (`data-dsh-session-timeline-hidden`)
            // so DevTools, other DOM plugins and tests can tell a rewind-hide apart
            // from any collapse/filter hide. Purely observational: the marker is
            // kept in sync with the hide/show state on both branches (a recreated
            // row has no marker and is re-marked when it re-enters a hidden span).
            for (const seat of chat === undefined ? [] : document.querySelectorAll(CHAT_SEAT_SELECTOR)) {
                const key = seat.dataset.chatAnchorKey;
                // `chat` is defined whenever the loop body runs (see the loop guard).
                const anchor = key !== undefined ? chat?.nodes.get(key)?.anchorSeq : undefined;
                if (anchor !== undefined && hiddenSeqs.has(anchor)) {
                    seat.style.display = 'none';
                    seat.dataset.dshRewindHidden = 'true';
                    hidden.current.add(seat);
                }
                else if (hidden.current.has(seat)) {
                    seat.style.display = '';
                    delete seat.dataset.dshRewindHidden;
                    hidden.current.delete(seat);
                }
            }
            // Hiding diagnostics are event-level: logged once where a rewind
            // settles (runRewindAndFill), not per mutation batch — printing them
            // here would flood the console during streaming, and the rewind event
            // already carries the hide set. Nothing is logged in this per-batch scan.
            const durable = chat === undefined ? [] : collectTargets(chat, hiddenSeqs);
            const next = [...durable, ...collectPendingTargets(snapshot)];
            // Diff: no change → no re-render (the observer fires on every mutation;
            // only an actual target-set change should touch React).
            setTargets(current => (sameTargets(current, next) ? current : next));
        };
        // Coalesce: any number of mutations in a batch collapse into ONE refresh
        // (microtask), instead of one synchronous full scan per mutation — this
        // is what keeps the plugin off the critical path of the frame that paints
        // a newly sent bubble.
        const queueRefresh = () => {
            if (queued || !active)
                return;
            queued = true;
            queueMicrotask(() => {
                queued = false;
                refresh();
            });
        };
        refresh();
        const observer = new MutationObserver(queueRefresh);
        // attributes: watch style so a harness re-render that resets display is
        // re-hidden on the next refresh instead of flickering back.
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        return () => {
            active = false;
            observer.disconnect();
        };
    }, [sessionId, sessionOf]);
    return targets.map(target => createPortal(target.kind === 'pending'
        ? (_jsx(RetractButton, { target: target, sessionId: sessionId, sessionOf: sessionOf, chatOf: chatOf, watchChat: watchChat, setComposerText: setComposerText, t: t }, target.key))
        : (_jsx(RewindButton, { target: target, sessionId: sessionId, sessionOf: sessionOf, chatOf: chatOf, watchChat: watchChat, currentSessionId: currentSessionId, setComposerText: setComposerText, t: t }, target.key)), target.container, target.key));
}
/** The per-message ↶ button (28px, matching the harness IconActions). */
function RewindButton({ target, sessionId, sessionOf, chatOf, watchChat, currentSessionId, setComposerText, t, }) {
    const onClick = (event) => {
        event.stopPropagation();
        const session = sessionOf(sessionId);
        if (session === undefined) {
            // No session binding (transition): nothing to rewind, say so instead
            // of failing silently.
            rewindLog.warn('portals', 'rewind button clicked with no session binding');
            return;
        }
        const node = userNodeOf(chatOf(session), target.key);
        if (node === undefined)
            return;
        openPopover({
            session,
            chatOf,
            watchChat,
            seq: node.seq,
            time: node.time,
            preview: messagePreviewOf(node),
            anchor: event.currentTarget,
            t,
            onRewind: (mode) => { void runRewindAndFill(session, node.seq, mode, currentSessionId, chatOf, watchChat, setComposerText); },
        });
    };
    return (_jsx("button", { type: "button", className: CLASS.button, "aria-label": t('button.aria'), title: t('button.title'), onClick: onClick, dangerouslySetInnerHTML: { __html: REWIND_ICON_SVG } }));
}
/**
 * Read the current composer draft.
 * @returns The composer text, or an empty string when the composer is absent.
 */
export function composerText() {
    return composerSurface()?.textContent ?? '';
}
/**
 * Rewind to one pre-sent (pending steering) message, with the same semantics
 * as a durable rewind — "pause first, then roll back to before the target":
 *
 * 1. Pause the running turn (Claude Code's rewind-always-stops-first rule; a
 *    no-op when the agent is already idle). Queued (next-turn) messages are
 *    untouched — the harness QueueDock already offers per-item edit/remove.
 * 2. Retract the target steering message and every steering message after it
 *    (the rollback point's "future"), oldest first, via the session's own
 *    `updateQueue` channel.
 * 3. Put the target's text back in the composer (only when it is empty —
 *    Claude Code's auto-restore guard, so a draft the user is typing is never
 *    clobbered).
 *
 * A removal failure is silently ignored: the realistic failure is
 * `queue-item-not-found` — the message was claimed by the running turn a
 * moment ago, in which case the durable row's regular rewind button takes
 * over with no gap.
 */
async function retractPending(session, itemId, text, setComposerText) {
    // 1. Pause first (Claude Code parity). Idempotent when already idle.
    await session.cancel();
    // 2. Retract the target and its future (steering only; queued stays).
    // The item id comes from the queue mirror's `id` field, which the harness
    // brands as MessageId; cast at this single boundary to avoid a new type
    // dependency on the branding package.
    const queue = session.getSnapshot().queue;
    const steering = queue.filter(item => item.placement === 'steering');
    for (const id of retractSpan(steering, itemId)) {
        await session.updateQueue(id, { kind: 'remove' });
    }
    // 3. Refill the composer (empty-composer guard).
    if (text !== null && text !== '' && composerText().trim() === '') {
        setComposerText(session.sessionId, text);
    }
}
/** The per-pending-message ↶ button (same visual family as the durable button). */
function RetractButton({ target, sessionId, sessionOf, chatOf, watchChat, setComposerText, t }) {
    const onClick = (event) => {
        event.stopPropagation();
        const session = sessionOf(sessionId);
        if (session === undefined)
            return;
        openPopover({
            session,
            chatOf,
            watchChat,
            preview: target.preview,
            anchor: event.currentTarget,
            t,
            retract: { itemId: target.itemId, text: target.text },
            onRetract: () => { void retractPending(session, target.itemId, target.text, setComposerText); },
        });
    };
    return (_jsx("button", { type: "button", className: CLASS.button, "aria-label": t('button.retract.aria'), title: t('button.retract.title'), onClick: onClick, dangerouslySetInnerHTML: { __html: REWIND_ICON_SVG } }));
}
/**
 * Build the slot-entry component for the plugin apply(): a tiny bridge that
 * injects the apply-time capabilities (session resolution, locale, rewind
 * runner) into the module-level `RewindPortals`.
 */
export function createRewindBridge(deps) {
    return function RewindBridge({ sessionId }) {
        return createElement(RewindPortals, { sessionId, ...deps });
    };
}
//# sourceMappingURL=portals.js.map