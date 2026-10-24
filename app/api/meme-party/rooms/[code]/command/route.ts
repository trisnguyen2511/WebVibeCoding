import { NextRequest } from 'next/server'
import { clientKey, fail, ok, readJson } from '@/lib/meme-party/api'
import { logEvent } from '@/lib/meme-party/log'
import { rateLimited } from '@/lib/meme-party/rate-limit'
import { runCommand } from '@/lib/meme-party/room-service'
import type { Command } from '@/lib/meme-party/types'

const KNOWN = new Set([
  'START_MATCH', 'OPEN_SUBMISSION', 'CLOSE_SUBMISSION', 'REVIEW_SUBMISSION', 'APPROVE_ALL_PENDING', 'REOPEN_SUBMISSION',
  'SKIP_ROUND', 'OPEN_SHOWCASE', 'SKIP_SHOWCASE', 'SHOWCASE_GOTO', 'END_SHOWCASE', 'CLOSE_VOTING', 'PUBLISH_RESULTS',
  'SET_AWARD', 'FINISH_ROUND', 'NEXT_ROUND', 'PAUSE', 'RESUME', 'KICK', 'CANCEL_MATCH', 'SUBMIT', 'VOTE',
])

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 200

/** Allow-lists every field so unknown input never reaches the engine. */
function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.type !== 'string' || !KNOWN.has(c.type)) return null
  switch (c.type) {
    case 'REVIEW_SUBMISSION':
      return isStr(c.submissionId) && (c.decision === 'approve' || c.decision === 'reject') ? { type: c.type, submissionId: c.submissionId, decision: c.decision } : null
    case 'SHOWCASE_GOTO':
      return typeof c.index === 'number' ? { type: c.type, index: c.index } : null
    case 'SET_AWARD':
      return isStr(c.submissionId) && typeof c.title === 'string' ? { type: c.type, submissionId: c.submissionId, title: c.title } : null
    case 'KICK':
      return isStr(c.playerId) ? { type: c.type, playerId: c.playerId } : null
    case 'SUBMIT':
      return isStr(c.optionId) ? { type: c.type, optionId: c.optionId } : null
    case 'VOTE':
      return isStr(c.submissionId) ? { type: c.type, submissionId: c.submissionId } : null
    default:
      return { type: c.type } as Command
  }
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  if (!/^\d{6}$/.test(params.code)) return fail('Mã phòng không hợp lệ', 400, 'invalid_code')
  if (rateLimited(`cmd:${clientKey(req)}:${params.code}`, 240, 60_000)) return fail('Thao tác quá nhanh', 429, 'rate_limited')
  const body = await readJson<{ cmdId?: unknown; command?: unknown }>(req, 4096)
  const command = parseCommand(body?.command)
  if (!body || !isStr(body.cmdId) || !command) return fail('Lệnh không hợp lệ', 400, 'invalid_command')
  try {
    const res = await runCommand(params.code, req.headers.get('x-mp-token'), body.cmdId, command)
    if (!res.ok) return fail(res.error.message, res.error.status, res.error.code)
    logEvent('meme_party.command', { code: params.code, type: command.type, version: res.stateVersion, duplicate: res.duplicate })
    return ok({ stateVersion: res.stateVersion, duplicate: res.duplicate })
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}
