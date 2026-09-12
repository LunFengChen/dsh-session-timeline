/** Composer compact control that runs `/compact` for the current session. */
import { type ReactNode } from 'react';
import type { SessionFace } from '@x1a0f3n9/dsh-api-session-controller/client';
import type { RewindKey } from './locales.ts';
export type CompactButtonTranslate = (key: RewindKey, params?: Record<string, unknown>) => string;
interface CompactButtonProps {
    readonly session: SessionFace | undefined;
    readonly t: CompactButtonTranslate;
}
/**
 * Render the composer compact button.
 * @param props - the live session face and locale copy.
 * @returns the compact control.
 */
export declare function CompactButton({ session, t }: CompactButtonProps): ReactNode;
export {};
//# sourceMappingURL=compact-button.d.ts.map