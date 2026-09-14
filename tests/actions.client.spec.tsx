// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import { TimelineActions } from '../src/client/actions.tsx'

afterEach(cleanup)

const copy = (key: string, params?: Record<string, unknown>): string =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    key,
  )

function sessionFace(overrides: Partial<SessionFace> = {}): SessionFace {
  return {
    cancel: vi.fn().mockResolvedValue({ ok: true, value: { accepted: true } }),
    deleteFrom: vi.fn().mockResolvedValue({ ok: true, value: { accepted: true } }),
    prompt: vi.fn().mockResolvedValue({ ok: true, value: { accepted: true } }),
    readAttachment: vi.fn(),
    ...overrides,
  } as unknown as SessionFace
}

async function confirmDelete(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'button.delete.aria' }))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'confirm.delete.confirm' }))
}

describe('TimelineActions', () => {
  it('requires acknowledgement before permanently deleting an assistant tail', async () => {
    const session = sessionFace()
    render(<TimelineActions kind="assistant" seq={7} session={session} t={copy} />)

    fireEvent.click(screen.getByRole('button', { name: 'button.delete.aria' }))
    const confirm = screen.getByRole('button', { name: 'confirm.delete.confirm' })
    expect(confirm).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('checkbox'))
    expect(confirm).toHaveProperty('disabled', false)
    fireEvent.click(confirm)

    await waitFor(() => expect(session.deleteFrom).toHaveBeenCalledWith(7))
    expect(session.cancel).toHaveBeenCalledOnce()
    expect(session.prompt).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'confirm.delete.confirm' })).toBeNull()
    })
  })

  it('reads durable images before truncating and resubmitting a user question', async () => {
    const session = sessionFace({
      readAttachment: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          attachment: { mediaType: 'image/png', name: 'diagram.png' },
          data: new Uint8Array([65, 66]),
        },
      }),
    })
    render(
      <TimelineActions
        kind="user"
        seq={12}
        content={[
          { type: 'text', text: 'Explain this.' },
          { type: 'image', attachment: { attachmentId: 'attachment-1' } },
        ]}
        session={session}
        t={copy}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'button.regenerate.aria' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'confirm.regenerate.confirm' }))

    await waitFor(() => expect(session.prompt).toHaveBeenCalledWith([
      { type: 'text', text: 'Explain this.' },
      { type: 'image', mediaType: 'image/png', data: 'QUI=', name: 'diagram.png' },
    ], 'queue'))
    expect(session.readAttachment).toHaveBeenCalledWith('attachment-1')
    expect(session.deleteFrom).toHaveBeenCalledWith(12)
    const loaded = vi.mocked(session.readAttachment)
    const cancelled = vi.mocked(session.cancel)
    const deleted = vi.mocked(session.deleteFrom)
    const prompt = vi.mocked(session.prompt)
    expect(loaded.mock.invocationCallOrder[0]!).toBeLessThan(cancelled.mock.invocationCallOrder[0]!)
    expect(cancelled.mock.invocationCallOrder[0]!).toBeLessThan(deleted.mock.invocationCallOrder[0]!)
    expect(deleted.mock.invocationCallOrder[0]!).toBeLessThan(prompt.mock.invocationCallOrder[0]!)
  })

  it('resolves the live session at confirm time instead of a stale render capture', async () => {
    const session = sessionFace()
    render(
      <TimelineActions
        kind="assistant"
        seq={9}
        session={undefined}
        sessionOf={() => session}
        t={copy}
      />,
    )
    await confirmDelete()
    await waitFor(() => expect(session.deleteFrom).toHaveBeenCalledWith(9))
  })

  it('keeps the dialog open and reports a missing session instead of closing with no effect', async () => {
    render(<TimelineActions kind="assistant" seq={3} t={copy} />)
    await confirmDelete()
    expect((await screen.findByRole('alert')).textContent).toBe('action.noSession')
    expect(screen.getByRole('button', { name: 'confirm.delete.confirm' })).toBeTruthy()
  })

  it('keeps the dialog open when truncation fails', async () => {
    const session = sessionFace({
      deleteFrom: vi.fn().mockResolvedValue({ ok: false, error: { message: 'not inside a turn' } }),
    })
    render(<TimelineActions kind="assistant" seq={4} session={session} t={copy} />)
    await confirmDelete()
    expect((await screen.findByRole('alert')).textContent).toBe('action.failed')
    expect(screen.getByRole('button', { name: 'confirm.delete.confirm' })).toBeTruthy()
    expect(session.prompt).not.toHaveBeenCalled()
  })

  it('truncates from a fractional interrupted assistant seq', async () => {
    const session = sessionFace()
    render(<TimelineActions kind="assistant" seq={12.7} session={session} t={copy} />)
    await confirmDelete()
    await waitFor(() => expect(session.deleteFrom).toHaveBeenCalledWith(12))
  })
})
