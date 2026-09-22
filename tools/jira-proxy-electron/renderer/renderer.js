/* global api */
'use strict'

let currentPort = 8765

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  // Load persisted config (target + port, NOT token)
  const saved = await api.loadConfig()
  if (saved) {
    if (saved.target) document.getElementById('target').value = saved.target
    if (saved.port) {
      document.getElementById('port').value = saved.port
      currentPort = parseInt(saved.port, 10) || 8765
      updateAddr()
    }
  }

  // Sync running state (proxy may have been started before window opened)
  const { running, config } = await api.getStatus()
  if (running && config) {
    currentPort = config.port
    document.getElementById('port').value = String(config.port)
    document.getElementById('target').value = config.target
    updateAddr()
  }
  setRunning(running)
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function setRunning(running) {
  const dot        = document.getElementById('dot')
  const statusBar  = document.getElementById('status-bar')
  const statusText = document.getElementById('status-text')
  const healthBtn  = document.getElementById('health-btn')
  const btnStart   = document.getElementById('btn-start')
  const btnStop    = document.getElementById('btn-stop')

  dot.className        = 'dot' + (running ? ' running' : '')
  statusBar.className  = 'status-bar' + (running ? ' running' : '')
  statusText.className = 'status-text' + (running ? '' : ' muted')
  statusText.textContent = running ? `Đang chạy — :${currentPort}` : 'Chưa chạy'
  healthBtn.className  = 'health-btn' + (running ? ' visible' : '')

  btnStart.style.display = running ? 'none' : 'flex'
  btnStop.style.display  = running ? 'flex'  : 'none'

  ;['target', 'token', 'port'].forEach(id => {
    document.getElementById(id).disabled = running
  })
}

function showError(msg) {
  const box = document.getElementById('error-box')
  box.textContent = msg
  box.className = 'error-box' + (msg ? ' visible' : '')
}

function updateAddr() {
  const p = parseInt(document.getElementById('port').value, 10) || 8765
  currentPort = p
  document.getElementById('addr').textContent = `→ http://127.0.0.1:${p}`
}

document.getElementById('port').addEventListener('input', updateAddr)

// ── Actions ────────────────────────────────────────────────────────────────────

async function startProxy() {
  const target = document.getElementById('target').value.trim()
  const token  = document.getElementById('token').value.trim()
  const port   = parseInt(document.getElementById('port').value, 10) || 8765

  if (!target) { showError('Nhập Jira URL trước'); return }
  if (!token)  { showError('Nhập PAT token trước'); return }

  showError('')
  currentPort = port

  // Persist config (no token for security)
  await api.saveConfig({ target, port: String(port) })

  const result = await api.startProxy({ target, token, port })
  if (result.ok) {
    setRunning(true)
  } else {
    showError(result.error || 'Không thể khởi động proxy')
  }
}

async function stopProxy() {
  showError('')
  const result = await api.stopProxy()
  if (result.ok) {
    setRunning(false)
  } else {
    showError(result.error || 'Không thể dừng proxy')
  }
}

function openHealth() {
  api.openHealth(currentPort)
}

// ── Boot ───────────────────────────────────────────────────────────────────────

init()
