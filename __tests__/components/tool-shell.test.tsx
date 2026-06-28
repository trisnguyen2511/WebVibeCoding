import { render, screen } from '@testing-library/react'
import { ToolShell } from '@/components/tool-shell'

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
