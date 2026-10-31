import {
  NAV_STACK_KEY,
  getNavStack,
  getParentPath,
  getPreviousInAppPath,
  isEntryPage,
  recordNavigation,
  reduceNavStack,
  reduceOnDocumentLoad,
  replaceTopNavigation,
  startNavSession,
  __resetDocumentStateForTests,
} from '@/lib/nav-history'

beforeEach(() => {
  sessionStorage.clear()
  __resetDocumentStateForTests()
})

describe('reduceNavStack', () => {
  it('pushes a new page', () => {
    expect(reduceNavStack(['/'], '/tools/hash')).toEqual(['/', '/tools/hash'])
  })
  it('ignores same-path updates (reload, query change)', () => {
    expect(reduceNavStack(['/', '/tools/hash'], '/tools/hash')).toEqual(['/', '/tools/hash'])
  })
  it('treats returning to the previous page as a pop (browser back gesture)', () => {
    expect(reduceNavStack(['/', '/tools/hash'], '/')).toEqual(['/'])
  })
})

describe('reduceOnDocumentLoad', () => {
  it('fresh deep link resets a stale stack from earlier in the tab', () => {
    expect(reduceOnDocumentLoad(['/', '/tools/a'], '/tools/b', 'navigate')).toEqual(['/tools/b'])
  })
  it('reload keeps the stack', () => {
    expect(reduceOnDocumentLoad(['/', '/tools/a'], '/tools/a', 'reload')).toEqual(['/', '/tools/a'])
  })
  it('back_forward from another site keeps the stack', () => {
    expect(reduceOnDocumentLoad(['/', '/tools/a'], '/tools/a', 'back_forward')).toEqual(['/', '/tools/a'])
  })
})

describe('getParentPath', () => {
  it.each([
    ['/tools/hash', '/'],
    ['/tools/timeline/abc', '/tools/timeline'],
    ['/tools/games/untangle-chest/controller', '/tools/games/untangle-chest'],
    ['/tools/meme-party/play', '/tools/meme-party'],
    ['/settings', '/'],
    ['/', '/'],
  ])('%s → %s', (path, parent) => {
    expect(getParentPath(path)).toBe(parent)
  })
})

describe('Back button scenarios', () => {
  it('deep link straight into a tool → no in-app previous page (fallback to parent)', () => {
    recordNavigation('/tools/hash')
    expect(getPreviousInAppPath('/tools/hash')).toBeNull()
  })

  it('home → tool → previous page is home (history back)', () => {
    recordNavigation('/')
    recordNavigation('/tools/hash')
    expect(getPreviousInAppPath('/tools/hash')).toBe('/')
  })

  it('deep link → Back (replace to /) → "/" is NOT an entry page → no auto-enter loop', () => {
    startNavSession('/tools/hash')
    replaceTopNavigation('/')
    recordNavigation('/') // tracker sees the same top → no-op
    expect(getNavStack()).toEqual(['/'])
    expect(isEntryPage('/')).toBe(false)
  })

  it('opening "/" directly is the entry page (auto-enter allowed)', () => {
    startNavSession('/')
    expect(isEntryPage('/')).toBe(true)
  })

  it('home → tool → back to home is NOT an entry page', () => {
    startNavSession('/')
    recordNavigation('/tools/hash')
    recordNavigation('/')
    expect(isEntryPage('/')).toBe(false)
  })

  it('"/" opened first in the tab is the entry page', () => {
    expect(isEntryPage('/')).toBe(true)
    recordNavigation('/')
    expect(isEntryPage('/')).toBe(true)
  })

  it('"/" reached after visiting a tool is NOT the entry page', () => {
    recordNavigation('/tools/hash')
    recordNavigation('/')
    expect(isEntryPage('/')).toBe(false)
  })

  it('survives corrupted storage', () => {
    sessionStorage.setItem(NAV_STACK_KEY, '{oops')
    expect(getNavStack()).toEqual([])
    expect(getPreviousInAppPath('/tools/hash')).toBeNull()
  })
})
