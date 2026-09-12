// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { SessionFace } from '@x1a0f3n9/dsh-api-session-controller/client'
import { runRewindAndFill } from '../src/client/portals.tsx'

function sessionFace(overrides: Partial<SessionFace> = {}): SessionFace {
  return {
    sessionId: 'session-1',
    cancel: vi.fn().mockResolvedValue({ ok: true, value: { accepted: true } }),
    command: vi.fn().mockResolvedValue({ ok: true, value: { matched: true } }),
    deleteFrom: vi.fn().mockResolvedValue({ ok: true, value: { accepted: true } }),
    resync: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SessionFace
}

describe('runRewindAndFill', () => {
  it('stops the live turn and deletes without a truncating /rewind command', async () => {
    const session = sessionFace()
    await runRewindAndFill(
      session,
      4,
      'chat',
      () => 'session-1',
      () => undefined,
      () => () => undefined,
      () => true,
    )
    expect(session.cancel).toHaveBeenCalledOnce()
    expect(session.command).not.toHaveBeenCalled()
    expect(session.deleteFrom).toHaveBeenCalledWith(4)
  })

  it('restores files through the internal probe before deleting', async () => {
    const session = sessionFace()
    await runRewindAndFill(
      session,
      4,
      'both',
      () => 'session-1',
      () => undefined,
      () => () => undefined,
      () => true,
    )
    expect(session.command).toHaveBeenCalledWith('/rewind __restore @4')
    expect(session.deleteFrom).toHaveBeenCalledWith(4)
    const commandOrder = vi.mocked(session.command).mock.invocationCallOrder[0]!
    const deleteOrder = vi.mocked(session.deleteFrom).mock.invocationCallOrder[0]!
    expect(commandOrder).toBeLessThan(deleteOrder)
  })

  it('still deletes when file restore fails', async () => {
    const session = sessionFace({
      command: vi.fn().mockResolvedValue({ ok: false, error: { message: 'restore failed' } }),
    })
    await runRewindAndFill(
      session,
      4,
      'both',
      () => 'session-1',
      () => undefined,
      () => () => undefined,
      () => true,
    )
    expect(session.deleteFrom).toHaveBeenCalledWith(4)
  })
})
