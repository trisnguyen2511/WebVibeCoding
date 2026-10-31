import { fireEvent, render, screen } from '@testing-library/react'
import { ToolShell } from '@/components/tool-shell'
import { __resetDocumentStateForTests, getNavStack, recordNavigation } from '@/lib/nav-history'

const back = jest.fn()
const replace = jest.fn()
const push = jest.fn()
let mockPathname = '/tools/hash'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back, replace, push }),
  usePathname: () => mockPathname,
}))

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  __resetDocumentStateForTests()
  mockPathname = '/tools/hash'
})

describe('ToolShell', () => {
  it('renders tool name and icon', () => {
    render(<ToolShell name="Test Tool" icon="🔧"><div>content</div></ToolShell>)
    expect(screen.getByText('Test Tool')).toBeInTheDocument()
    expect(screen.getByText('🔧')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(<ToolShell name="T" icon="x"><span data-testid="child">hi</span></ToolShell>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders a back link to homepage', () => {
    render(<ToolShell name="T" icon="x"><div /></ToolShell>)
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/')
  })

  it('renders optional description when provided', () => {
    render(<ToolShell name="T" icon="x" description="A description"><div /></ToolShell>)
    expect(screen.getByText('A description')).toBeInTheDocument()
  })
})

describe('ToolShell Back button', () => {
  it('deep link (no in-app history) → replaces to home, never history.back()', () => {
    recordNavigation('/tools/hash')
    render(<ToolShell name="T" icon="x"><div /></ToolShell>)
    fireEvent.click(screen.getByRole('link', { name: /back/i }))
    expect(back).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/')
    expect(getNavStack()).toEqual(['/'])
  })

  it('came from home inside the app → uses history back', () => {
    recordNavigation('/')
    recordNavigation('/tools/hash')
    render(<ToolShell name="T" icon="x"><div /></ToolShell>)
    fireEvent.click(screen.getByRole('link', { name: /back/i }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('came from another tool → goes back to that tool', () => {
    recordNavigation('/')
    recordNavigation('/tools/json-tools')
    recordNavigation('/tools/hash')
    render(<ToolShell name="T" icon="x"><div /></ToolShell>)
    fireEvent.click(screen.getByRole('link', { name: /back/i }))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('deep link into a sub-page → goes up to the tool, not home', () => {
    mockPathname = '/tools/timeline/p1'
    recordNavigation('/tools/timeline/p1')
    render(<ToolShell name="T" icon="x"><div /></ToolShell>)
    const link = screen.getByRole('link', { name: /back/i })
    expect(link).toHaveAttribute('href', '/tools/timeline')
    fireEvent.click(link)
    expect(replace).toHaveBeenCalledWith('/tools/timeline')
  })

  it('Cmd/Ctrl-click keeps native link behaviour (open in new tab)', () => {
    recordNavigation('/')
    recordNavigation('/tools/hash')
    render(<ToolShell name="T" icon="x"><div /></ToolShell>)
    fireEvent.click(screen.getByRole('link', { name: /back/i }), { metaKey: true })
    expect(back).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})
