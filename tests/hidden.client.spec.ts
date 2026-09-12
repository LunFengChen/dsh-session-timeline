import { describe, expect, it, vi } from 'vitest'
import { chatSnapshotOf, hiddenSeqsOf, messageTextAt, resolveChatWatch, type HiddenChat } from '../src/client/hidden.ts'

function chat(): HiddenChat {
  return {
    order: ['user-1', 'assistant-1'],
    nodes: {
      get: key => key === 'user-1'
        ? {
          kind: 'user',
          data: { seq: 3, content: [{ type: 'text', text: 'question' }] },
        } as never
        : undefined,
    },
  }
}

describe('client chat view helpers', () => {
  it('reads the assembled chat snapshot without adapting legacy faces', () => {
    const snapshot = chat()
    expect(chatSnapshotOf({ getSnapshot: () => snapshot })).toBe(snapshot)
    expect(chatSnapshotOf(undefined)).toBeUndefined()
    expect(messageTextAt(snapshot, 3)).toBe('question')
  })

  it('subscribes to the current view and returns a no-op when it is absent', () => {
    const dispose = vi.fn()
    const subscribe = vi.fn(() => dispose)
    const callback = vi.fn()
    expect(resolveChatWatch(() => ({ subscribe }), 'session-1', callback)).toBe(dispose)
    expect(subscribe).toHaveBeenCalledWith(callback)
    expect(resolveChatWatch(() => undefined, 'session-1', callback)).not.toBe(dispose)
  })
})

function commandChat(args: string, outcome: { kind: 'success' | 'error' } | null, seq = 9): HiddenChat {
  return {
    order: ['command-1'],
    nodes: {
      get: () => ({
        kind: 'command',
        anchorSeq: seq,
        data: {
          kind: 'command',
          seq,
          name: 'rewind',
          args,
          outcome,
        },
      } as never),
    },
  }
}

describe('hiddenSeqsOf', () => {
  it('hides running executed rewind cards and internal restore probes', () => {
    expect(hiddenSeqsOf(commandChat('@3 both', null))).toEqual(new Set([9]))
    expect(hiddenSeqsOf(commandChat('__restore @3', { kind: 'success' }))).toEqual(new Set([9]))
    expect(hiddenSeqsOf(commandChat('preview @3 both', null))).toEqual(new Set([9]))
  })

  it('keeps a failed executed rewind visible', () => {
    expect(hiddenSeqsOf(commandChat('@3 both', { kind: 'error' }))).toEqual(new Set())
  })
})
