'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ToolShell } from '@/components/tool-shell'

const LS_KEY = 'wv-pomodoro-tasks'

type Mode = 'focus' | 'short' | 'long'
interface Task { id: string; text: string; done: boolean }

const MODE_LABELS: Record<Mode, string> = { focus: 'Focus', short: 'Short Break', long: 'Long Break' }
const DEFAULT_DURATIONS: Record<Mode, number> = { focus: 25, short: 5, long: 15 }

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8)
  } catch { /* AudioContext not available */ }
}

export default function PomodoroPage() {
  const [mode, setMode] = useState<Mode>('focus')
  const [durations, setDurations] = useState(DEFAULT_DURATIONS)
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_DURATIONS.focus * 60)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load tasks
  useEffect(() => {
    try { setTasks(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(tasks))
  }, [tasks])

  const resetTimer = useCallback((m: Mode, d = durations) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRunning(false)
    setSecondsLeft(d[m] * 60)
  }, [durations])

  const switchMode = (m: Mode) => { setMode(m); resetTimer(m) }

  // Countdown
  useEffect(() => {
    if (!running) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!)
          setRunning(false)
          beep()
          if (Notification.permission === 'granted') {
            new Notification('⏰ Time\'s up!', { body: MODE_LABELS[mode] + ' session ended.' })
          }
          if (mode === 'focus') setSessions((n) => n + 1)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, mode])

  const requestNotif = () => {
    if (Notification.permission === 'default') Notification.requestPermission()
    setRunning(true)
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const total = durations[mode] * 60
  const progress = ((total - secondsLeft) / total) * 100

  const addTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.trim()) return
    setTasks((t) => [...t, { id: Date.now().toString(), text: newTask.trim(), done: false }])
    setNewTask('')
  }

  const longBreakNext = sessions > 0 && sessions % 4 === 3

  return (
    <ToolShell name="Pomodoro" icon="🍅" description="Focus timer with task list and break reminders">
      <div className="mx-auto max-w-md space-y-6">
        {/* Mode tabs */}
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
            <button key={m} onClick={() => switchMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === m ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Timer */}
        <div className="rounded-2xl border border-border bg-surface p-8 text-center space-y-4">
          <p className="font-mono text-7xl font-bold tracking-widest text-fg">{mm}:{ss}</p>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-all duration-1000"
              style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-center gap-3">
            <button onClick={() => { if (!running) requestNotif(); else setRunning(false) }}
              className="rounded-xl bg-accent px-8 py-3 font-bold text-white transition-colors hover:bg-accent/80">
              {running ? '⏸ Pause' : '▶ Start'}
            </button>
            <button onClick={() => resetTimer(mode)}
              className="rounded-xl border border-border bg-background px-4 py-3 text-muted hover:text-fg transition-colors">
              ↺
            </button>
          </div>
          <p className="text-xs text-muted">
            Session #{sessions + 1} · {longBreakNext ? '🎉 Long break next!' : `${4 - (sessions % 4)} until long break`}
          </p>
        </div>

        {/* Settings toggle */}
        <button onClick={() => setShowSettings((v) => !v)}
          className="text-xs text-muted hover:text-fg transition-colors">
          {showSettings ? '▲ Hide' : '▼'} Settings
        </button>
        {showSettings && (
          <div className="rounded-xl border border-border bg-surface p-4 grid grid-cols-3 gap-4">
            {(Object.keys(DEFAULT_DURATIONS) as Mode[]).map((m) => (
              <div key={m}>
                <label className="text-xs text-muted">{MODE_LABELS[m]} (min)</label>
                <input type="number" min={1} max={120} value={durations[m]}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value))
                    const next = { ...durations, [m]: val }
                    setDurations(next)
                    if (m === mode) resetTimer(m, next)
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent" />
              </div>
            ))}
          </div>
        )}

        {/* Task list */}
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted">Tasks</p>
          <form onSubmit={addTask} className="flex gap-2">
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none placeholder-muted focus:border-accent" />
            <button type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent/80 transition-colors">+</button>
          </form>
          {tasks.length === 0 && <p className="text-sm text-muted">No tasks yet.</p>}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <button onClick={() => setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))}
                  className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${t.done ? 'border-accent bg-accent' : 'border-border bg-background hover:border-accent'}`}>
                  {t.done && <span className="text-[9px] text-fg">✓</span>}
                </button>
                <span className={`flex-1 text-sm ${t.done ? 'line-through text-muted' : 'text-fg'}`}>{t.text}</span>
                <button onClick={() => setTasks((ts) => ts.filter((x) => x.id !== t.id))}
                  className="text-xs text-muted hover:text-red-400 transition-colors">✕</button>
              </div>
            ))}
          </div>
          {tasks.some((t) => t.done) && (
            <button onClick={() => setTasks((ts) => ts.filter((t) => !t.done))}
              className="text-xs text-muted hover:text-fg transition-colors">Clear completed</button>
          )}
        </div>
      </div>
    </ToolShell>
  )
}
