import { render } from '@testing-library/react'
import { LastToolRedirect } from '@/components/last-tool-redirect'
import { __resetDocumentStateForTests, recordNavigation, replaceTopNavigation, startNavSession } from '@/lib/nav-history'
import { TOOL_HISTORY_KEY } from '@/lib/tool-history'

const push = jest.fn()
const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: jest.fn() }),
}))

function setRecentTool(path: string, minutesAgo = 5) {
  localStorage.setItem(TOOL_HISTORY_KEY, JSON.stringify([{ path, visitedAt: Date.now() - minutesAgo * 60_000 }]))
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  __resetDocumentStateForTests()
})

describe('LastToolRedirect', () => {
  it('opening "/" first in the tab auto-enters the recent tool with PUSH (Back returns to picker)', () => {
    setRecentTool('/tools/hash')
    startNavSession('/')
    render(<LastToolRedirect />)
    expect(push).toHaveBeenCalledWith('/tools/hash')
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not auto-enter a stale tool', () => {
    setRecentTool('/tools/hash', 60 * 10)
    startNavSession('/')
    render(<LastToolRedirect />)
    expect(push).not.toHaveBeenCalled()
  })

  it('deep link to a tool → Back to "/" does NOT bounce into the tool again', () => {
    setRecentTool('/tools/hash')
    startNavSession('/tools/hash')
    replaceTopNavigation('/')
    recordNavigation('/')
    render(<LastToolRedirect />)
    expect(push).not.toHaveBeenCalled()
  })

  it('auto-enters at most once per tab', () => {
    setRecentTool('/tools/hash')
    startNavSession('/')
    render(<LastToolRedirect />)
    render(<LastToolRedirect />)
    expect(push).toHaveBeenCalledTimes(1)
  })
})
