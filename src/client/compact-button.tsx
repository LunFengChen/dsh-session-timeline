/** Composer compact control that runs `/compact` for the current session. */

import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { SessionFace } from '@x1a0f3n9/dsh-api-session-controller/client'
import { Toast, Tooltip } from '@x1a0f3n9/dsh-client-ui-primitives'
import type { RewindKey } from './locales.ts'
import { CLASS } from './styles.ts'

export type CompactButtonTranslate = (key: RewindKey, params?: Record<string, unknown>) => string

interface CompactButtonProps {
  readonly session: SessionFace | undefined
  readonly t: CompactButtonTranslate
}

/**
 * Render the composer compact button.
 * @param props - the live session face and locale copy.
 * @returns the compact control.
 */
export function CompactButton({ session, t }: CompactButtonProps): ReactNode {
  const busy = useRef(false)
  const toastSeq = useRef(0)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const keepFocus = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }, [])
  const showToast = useCallback((text: string) => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }, [])
  const onClick = useCallback(() => {
    if (session === undefined || busy.current) return
    busy.current = true
    void session.command('/compact').then((result) => {
      if (result.ok) return
      showToast(t('compact.failed', { message: result.error.message }))
    }).catch((error: unknown) => {
      showToast(t('compact.failed', { message: error instanceof Error ? error.message : String(error) }))
    }).finally(() => { busy.current = false })
  }, [session, showToast, t])

  return (
    <>
      <Tooltip label={t('button.compact.title')} side="top">
        <button
          type="button"
          className={`${CLASS.button} ${CLASS.buttonLabeled}`}
          aria-label={t('button.compact.aria')}
          disabled={session === undefined}
          onMouseDown={keepFocus}
          onClick={onClick}
        >
          <CompactIcon />
          <span>{t('button.compact.title')}</span>
        </button>
      </Tooltip>
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          onDone={() => { setToast(null) }}
        />
      )}
    </>
  )
}

/** Compact control glyph: two chevrons pointing toward the center. */
function CompactIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6.5 8 3.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9.5 8 12.5 12 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
