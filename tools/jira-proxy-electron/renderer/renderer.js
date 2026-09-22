/* global api */
'use strict'

let currentPort = 8765
let updateUrl = ''

// ── Theme ──────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '🌙' : '☀️'
  document.body.style.backgroundColor = theme === 'dark' ? '#08080E' : '#F4F4FA'
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark'
  const next = current === 'dark' ? 'light' : 'dark'
  localStorage.setItem('theme', next)
  applyTheme(next)
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  // Restore theme
  const savedTheme = localStorage.getItem('theme') || 'dark'
  applyTheme(savedTheme)

  // Show version
  const version = await api.getVersion()
  document.getElementById('version-chip').textContent = `v${version}`

  // Load saved/default config (target + port)
  const saved = await api.loadConfig()
  if (saved) {
    if (saved.target) document.getElementById('target').value = saved.target
    if (saved.port) {
      document.getElementById('port').value = saved.port
      currentPort = parseInt(saved.port, 10) || 8765
      updateAddr()
    }
  }

  // Sync with running proxy (window may have reopened)
  const { running, config } = await api.getStatus()
  if (running && config) {
    currentPort = config.port
    document.getElementById('port').value = String(config.port)
    document.getElementById('target').value = config.target
    updateAddr()
  }
  setRunning(running)

  // Check for update in background (non-blocking)
  api.checkUpdate().then(({ hasUpdate, version: newVer, url }) => {
    if (hasUpdate) {
      updateUrl = url
      document.getElementById('update-text').textContent =
        `Có bản cập nhật mới: v${newVer}`
      document.getElementById('update-banner').classList.add('visible')
    }
  }).catch(() => { /* ignore network errors */ })
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function setRunning(running) {
  const card      = document.getElementById('status-card')
  const dot       = document.getElementById('status-dot')
  const label     = document.getElementById('status-label')
  const value     = document.getElementById('status-value')
  const healthBtn = document.getElementById('health-btn')
  const btnStart  = document.getElementById('btn-start')
  const btnStop   = document.getElementById('btn-stop')

  if (running) {
    card.className = 'status-card running'
    dot.className  = 'status-dot running'
    label.textContent = 'Đang chạy'
    value.textContent = `http://127.0.0.1:${currentPort}`
    healthBtn.classList.add('visible')
  } else {
    card.className = 'status-card'
    dot.className  = 'status-dot'
    label.textContent = 'Chưa chạy'
    value.textContent = 'Nhập thông tin và bấm Bắt đầu'
    healthBtn.classList.remove('visible')
  }

  btnStart.style.display = running ? 'none' : 'flex'
  btnStop.style.display  = running ? 'flex'  : 'none'

  ;['target', 'token', 'port'].forEach(id => {
    document.getElementById(id).disabled = running
  })
  document.getElementById('toggle-eye').disabled = running
}

function showError(msg) {
  const box = document.getElementById('error-box')
  box.textContent = msg
  box.className = 'error-box' + (msg ? ' visible' : '')
}

function setLoading(loading) {
  const btn = document.getElementById('btn-start')
  btn.disabled = loading
  btn.innerHTML = loading
    ? '<span class="spin">⟳</span><span>Đang khởi động…</span>'
    : '<span>▶</span><span>Bắt đầu</span>'
}

function updateAddr() {
  const p = parseInt(document.getElementById('port').value, 10) || 8765
  currentPort = p
  document.getElementById('addr-input').value = `http://127.0.0.1:${p}`
}

document.getElementById('port').addEventListener('input', updateAddr)

// ── Eye toggle ─────────────────────────────────────────────────────────────────

function toggleEye() {
  const input = document.getElementById('token')
  const btn   = document.getElementById('toggle-eye')
  input.type = input.type === 'password' ? 'text' : 'password'
  btn.textContent = input.type === 'password' ? '👁' : '🙈'
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function startProxy() {
  const target = document.getElementById('target').value.trim()
  const token  = document.getElementById('token').value.trim()
  const port   = parseInt(document.getElementById('port').value, 10) || 8765

  showError('')
  if (!target) { showError('⚠️  Vui lòng nhập Jira URL'); return }

  setLoading(true)

  // Save config (target + port only — never save token)
  await api.saveConfig({ target, port: String(port) })

  const result = await api.startProxy({ target, token, port })
  setLoading(false)

  if (result.ok) {
    // Use the actual port (may have auto-incremented)
    currentPort = result.port ?? port
    document.getElementById('port').value = String(currentPort)
    updateAddr()
    setRunning(true)
  } else {
    showError('❌  ' + (result.error || 'Không thể khởi động proxy'))
  }
}

async function stopProxy() {
  showError('')
  const btn = document.getElementById('btn-stop')
  btn.disabled = true
  btn.innerHTML = '<span class="spin">⟳</span><span>Đang dừng…</span>'

  const result = await api.stopProxy()
  btn.disabled = false
  btn.innerHTML = '<span>■</span><span>Dừng proxy</span>'

  if (result.ok) {
    setRunning(false)
  } else {
    showError('❌  ' + (result.error || 'Không thể dừng proxy'))
  }
}

function openHealth() {
  api.openHealth(currentPort)
}

function openUpdate() {
  if (updateUrl) api.openUrl(updateUrl)
}

// ── Boot ───────────────────────────────────────────────────────────────────────

init()
