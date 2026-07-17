import { STORAGE_KEY, type GameState } from './types'

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage có thể đầy hoặc bị chặn — bỏ qua, không chặn thao tác của MC.
  }
}

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GameState
  } catch {
    return null
  }
}

export function clearGameState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
