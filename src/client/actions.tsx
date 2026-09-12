/** Timeline-owned destructive actions for durable conversation rows. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AttachmentIdType } from '@x1a0f3n9/dsh-attachment'
import type { PromptContentPart } from '@x1a0f3n9/dsh-api-session-controller/types'
import type { SessionFace } from '@x1a0f3n9/dsh-api-session-controller/client'
import { SessionSeq } from '@x1a0f3n9/dsh-session/types'
import {
  IconRefreshOutline16, IconTrashOutline16, RiskConfirmation, Tooltip,
} from '@x1a0f3n9/dsh-client-ui-primitives'
import type { RewindKey } from './locales.ts'
import { CLASS } from './styles.ts'

export type TimelineActionTranslate = (key: RewindKey, params?: Record<string, unknown>) => string

interface TimelineActionsProps {
  readonly kind: 'user' | 'assistant'
  readonly seq: number
  readonly content?: readonly unknown[]
  readonly session: SessionFace | undefined
  readonly t: TimelineActionTranslate
}

/**
 * Render timeline-owned deletion and regeneration controls.
 * @param props - the durable target, original user content, session face, and locale copy.
 * @returns the action buttons and their acknowledgement dialog.
 */
export function TimelineActions({ kind, seq, content, session, t }: TimelineActionsProps): ReactNode {
  const [action, setAction] = useState<'delete' | 'regenerate' | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const busy = useRef(false)
  const close = useCallback(() => {
    setAction(null)
    setAcknowledged(false)
  }, [])
  useEffect(() => () => { busy.current = false }, [])

  const confirm = useCallback(() => {
    const selected = action
    close()
    if (selected === null || session === undefined || busy.current) return
    busy.current = true
    void (async () => {
      const prompt = selected === 'regenerate' && content !== undefined
        ? await historyPromptContent(session, content)
        : undefined
      await session.cancel()
      const deleted = await session.deleteFrom(SessionSeq(seq))
      if (!deleted.ok) throw new Error(deleted.error.message)
      if (selected === 'delete' || prompt === undefined) return
      await session.prompt(prompt, 'queue')
    })().catch((error) => {
      console.error('dsh-session-timeline: timeline action failed', error)
    }).finally(() => { busy.current = false })
  }, [action, close, content, seq, session])

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
        onAcknowledgedChange={setAcknowledged}
        onCancel={close}
        onConfirm={confirm}
      />
    </>
  )
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
