/**
 * Read the complete durable event log used by rewind planning.
 *
 * `snapshotEvents()` is the session API for a stable, immutable view of the
 * full log. It includes inherited events for forked sessions, which is
 * required because rewind targets are model-visible history rather than only
 * events appended by the current session.
 *
 * @module dsh-session-timeline/session-events
 */
/**
 * Read the full event log in log order.
 * @param session - Session whose durable history is being inspected.
 * @returns A stable snapshot containing inherited and local events.
 */
export function eventsOf(session) {
    return session.snapshotEvents();
}
//# sourceMappingURL=session-events.js.map