/** Timeline-owned destructive actions for durable conversation rows. */

import { useCallback, useState, type ReactNode } from 'react'
import type { AttachmentIdType } from '@x1a0f3n9/dsh-attachment'
import type { PromptContentPart } from '@x1a0f3n9/dsh-api-session-controller/types'
import type { SessionFace } from '@x1a0f3n9/dsh-api-session-controller/client'
import { SessionSeq } from '@x1a0f3n9/dsh-session/types'
import {
  IconRefreshOutline16, IconTrashOutline16, RiskConfirmation, Toast, Tooltip,
} from '@x1a0f3n9/dsh-client-ui-primitives'
import type { RewindKey } from './locales.ts'
import { rewindLog } from './log.ts'
import { CLASS } from './styles.ts'

export type TimelineActionTranslate = (key: RewindKey, params?: Record<string, unknown>) => string

interface TimelineActionsProps {
  readonly kind: 'user' | 'assistant'
  readonly seq: number
  readonly content?: readonly unknown[]
  readonly session?: SessionFace
  readonly sessionOf?: () => SessionFace | undefined
  readonly t: TimelineActionTranslate
}

/**
 * Render timeline-owned deletion and regeneration controls.
 * @param props - the durable target, original user content, session resolvers, and locale copy.
 * @returns the action buttons and their acknowledgement dialog.
 */
export function TimelineActions({
  kind, seq, content, session, sessionOf, t,
}: TimelineActionsProps): ReactNode {
  const [action, setAction] = useState<'delete' | 'regenerate' | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [pending, setPending] = useState(false)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const close = useCallback(() => {
    setAction(null)
    setAcknowledged(false)
    setPending(false)
  }, [])
  const showError = useCallback((text: string) => {
    setToast(current => ({ seq: (current?.seq ?? 0) + 1, text }))
  }, [])

  const confirm = useCallback(() => {
    const selected = action
    if (selected === null || pending) return
    const face = sessionOf?.() ?? session
    if (face === undefined) {
      showError(t('action.noSession'))
      return
    }
    setPending(true)
    void (async () => {
      try {
        const prompt = selected === 'regenerate' && content !== undefined
          ? await historyPromptContent(face, content)
          : undefined
        await face.cancel()
        const deleted = await face.deleteFrom(deletionSeq(seq))
        if (!deleted.ok) throw new Error(deleted.error.message)
        if (selected === 'regenerate') {
          if (prompt === undefined) {
            throw new Error(t('action.noPrompt'))
          }
          const queued = await face.prompt(prompt, 'queue')
          if (!queued.ok) throw new Error(queued.error.message)
        }
        close()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        rewindLog.error('actions', 'timeline action failed', error)
        showError(t('action.failed', { message }))
        setPending(false)
      }
    })()
  }, [action, close, content, pending, seq, session, sessionOf, showError, t])

  return (
    <>
      {kind === 'user' && (
        <Tooltip label={t('button.regenerate.title')} side="bottom">
          <button
            type="button"
            className={CLASS.button}
            aria-label={t('button.regenerate.aria')}
            onClick={() => { setAcknowledged(false); setAction('regenerate') }}
          >
            <IconRefreshOutline16 />
          </button>
        </Tooltip>
      )}
      <Tooltip label={t('button.delete.title')} side="bottom">
        <button
          type="button"
          className={CLASS.button}
          aria-label={t('button.delete.aria')}
          onClick={() => { setAcknowledged(false); setAction('delete') }}
        >
          <IconTrashOutline16 />
        </button>
      </Tooltip>
      <RiskConfirmation
        open={action !== null}
        title={action === 'regenerate' ? t('confirm.regenerate.title') : t('confirm.delete.title')}
        description={action === 'regenerate' ? t('confirm.regenerate.description') : t('confirm.delete.description')}
        acknowledgeLabel={t('confirm.acknowledge')}
        cancelLabel={t('confirm.cancel')}
        closeLabel={t('confirm.close')}
        confirmLabel={action === 'regenerate' ? t('confirm.regenerate.confirm') : t('confirm.delete.confirm')}
        acknowledged={acknowledged}
        disabled={pending}
        onAcknowledgedChange={setAcknowledged}
        onCancel={close}
        onConfirm={confirm}
      />
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

/**
 * Admit a chat-node sequence as a durable log position.
 * Interrupted assistant fallbacks may carry a fractional display seq; truncation
 * still addresses the containing integer event.
 * @param seq - chat-node sequence from the conversation surface.
 * @returns the durable deletion sequence.
 */
function deletionSeq(seq: number): SessionSeq {
  return SessionSeq(Math.trunc(seq))
}

/**
 * Re-encode durable user content for the browser prompt admission API.
 * @param session - session face used to read durable image attachments.
 * @param content - folded user-message content from the chat projection.
 * @returns browser-admissible text and image prompt parts.
 */
async function historyPromptContent(session: SessionFace, content: readonly unknown[]): Promise<PromptContentPart[]> {
  const result: PromptContentPart[] = []
  for (const block of content) {
    const value = block as { type?: unknown; text?: unknown; attachment?: unknown }
    if (value.type === 'text' && typeof value.text === 'string') {
      result.push({ type: 'text', text: value.text })
      continue
    }
    if (value.type !== 'image' || value.attachment === null || typeof value.attachment !== 'object') continue
    const attachment = value.attachment as { attachmentId?: unknown }
    if (typeof attachment.attachmentId !== 'string') continue
    const loaded = await session.readAttachment(attachment.attachmentId as AttachmentIdType)
    if (!loaded.ok) throw new Error(`image ${attachment.attachmentId} could not be loaded: ${loaded.error.message}`)
    let binary = ''
    for (let offset = 0; offset < loaded.value.data.length; offset += 0x8000) {
      binary += String.fromCharCode(...loaded.value.data.subarray(offset, offset + 0x8000))
    }
    result.push({
      type: 'image',
      mediaType: loaded.value.attachment.mediaType,
      data: btoa(binary),
      ...(loaded.value.attachment.name === undefined ? {} : { name: loaded.value.attachment.name }),
    })
  }
  return result
}
