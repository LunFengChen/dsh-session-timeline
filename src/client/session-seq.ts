/**
 * Admit a chat-node sequence as a durable log position without importing the
 * host session factory. A runtime require of `@deepseek-ai/dsh-session/types`
 * or `@x1a0f3n9/dsh-session/types` misses the browser module table.
 */

import type { SessionSeq } from '@deepseek-ai/dsh-session/types'

/**
 * Brand a non-negative safe integer as a {@link SessionSeq}.
 * @param value - durable log position, already truncated when the chat node used a fractional display seq.
 * @returns the same number with the Session-sequence brand.
 */
export function asSessionSeq(value: number): SessionSeq {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(`SessionSeq must be a non-negative safe integer, got ${String(value)}`)
  }
  return value as SessionSeq
}
