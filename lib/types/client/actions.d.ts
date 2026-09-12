/** Timeline-owned destructive actions for durable conversation rows. */
import { type ReactNode } from 'react';
import type { SessionFace } from '@x1a0f3n9/dsh-api-session-controller/client';
import type { RewindKey } from './locales.ts';
export type TimelineActionTranslate = (key: RewindKey, params?: Record<string, unknown>) => string;
interface TimelineActionsProps {
    readonly kind: 'user' | 'assistant';
    readonly seq: number;
    readonly content?: readonly unknown[];
    readonly session: SessionFace | undefined;
    readonly t: TimelineActionTranslate;
}
/**
 * Render timeline-owned deletion and regeneration controls.
 * @param props - the durable target, original user content, session face, and locale copy.
 * @returns the action buttons and their acknowledgement dialog.
 */
export declare function TimelineActions({ kind, seq, content, session, t }: TimelineActionsProps): ReactNode;
export {};
//# sourceMappingURL=actions.d.ts.map