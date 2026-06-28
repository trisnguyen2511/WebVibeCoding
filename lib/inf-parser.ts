export interface ButtonConfig {
  label: string
  key: string
  x: number
  y: number
  w: number
  h: number
}

export interface ControllerConfig {
  name: string
  orientation: 'landscape' | 'portrait'
  buttons: Record<string, ButtonConfig>
}

export function parseInf(content: string): { config: ControllerConfig | null; error: string | null } {
  const lines = content.split('\n')
  let section: string | null = null
  let buttonId: string | null = null

  const controller: Partial<ControllerConfig> & { buttons: Record<string, Partial<ButtonConfig>> } = { buttons: {} }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    // Strip inline comments (everything after first `;`) and trim whitespace
    const raw = lines[i].split(';')[0].trim()
    if (!raw) continue

    if (raw.startsWith('[')) {
      const header = raw.slice(1, -1).trim()
      if (header === 'controller') {
        section = 'controller'
        buttonId = null
      } else if (header.startsWith('button:')) {
        buttonId = header.slice(7).trim().toUpperCase()
        section = 'button'
        controller.buttons[buttonId] = {}
      } else {
        return { config: null, error: `line ${lineNum}: unknown section [${header}]` }
      }
      continue
    }

    if (!raw.includes('=')) {
      return { config: null, error: `line ${lineNum}: expected "key = value", got "${raw}"` }
    }

    const eqIdx = raw.indexOf('=')
    const key = raw.slice(0, eqIdx).trim()
    const value = raw.slice(eqIdx + 1).trim()

    if (section === 'controller') {
      if (key === 'name') {
        controller.name = value
      } else if (key === 'orientation') {
        if (value !== 'landscape' && value !== 'portrait') {
          return { config: null, error: `line ${lineNum}: orientation must be "landscape" or "portrait", got "${value}"` }
        }
        controller.orientation = value
      }
    } else if (section === 'button' && buttonId) {
      const btn = controller.buttons[buttonId]
      if (key === 'label') {
        btn.label = value
      } else if (key === 'key') {
        btn.key = value
      } else if (['x', 'y', 'w', 'h'].includes(key)) {
        const num = Number(value)
        if (isNaN(num)) {
          return { config: null, error: `line ${lineNum}: "${key}" must be a number, got "${value}"` }
        }
        if (num < 0 || num > 100) {
          return { config: null, error: `line ${lineNum}: "${key}" must be in range 0–100 (percent), got ${num}` }
        }
        btn[key as 'x' | 'y' | 'w' | 'h'] = num
      }
    }
  }

  if (!controller.name) return { config: null, error: 'missing required field: name' }
  if (!controller.orientation) return { config: null, error: 'missing required field: orientation' }

  return {
    config: {
      name: controller.name,
      orientation: controller.orientation,
      buttons: controller.buttons as Record<string, ButtonConfig>,
    },
    error: null,
  }
}
