export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  // display:contents makes this div invisible to layout — it acts as a
  // CSS-variable injection point only.  Variables cascade to all Timeline
  // pages (project list + Gantt board) without wrapping them in an extra box.
  return (
    <div className="tl-theme" style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
