/* global api */
'use strict'

let currentPort = 8765

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  const saved = await api.loadConfig()
  if (saved) {
    if (saved.target) document.getElementById('target').value = saved.target
    if (saved.port) {
      document.getElementById('port').value = saved.port
      currentPort = parseInt(saved.port, 10) || 8765
      updateAddr()
    }
  }

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
  const card       = document.getElementById('status-card')
  const icon       = document.getElementById('status-icon')
  const label      = document.getElementById('status-label')
  const value      = document.getElementById('status-value')
  const healthBtn  = document.getElementById('health-btn')
  const btnStart   = document.getElementById('btn-start')
  const btnStop    = document.getElementById('btn-stop')
  const proxyAddr  = document.getElementById('proxy-addr')

  if (running) {
    card.className = 'status-card running'
    icon.textContent = '🟢'
    icon.classList.add('pulse')
    label.textContent = 'Đang chạy'
    value.textContent = `http://127.0.0.1:${currentPort}`
    healthBtn.classList.add('visible')
    proxyAddr.textContent = `✅ Proxy đang lắng nghe tại http://127.0.0.1:${currentPort}`
    proxyAddr.classList.add('visible')
  } else {
    card.className = 'status-card'
    icon.textContent = '⚫'
    icon.classList.remove('pulse')
    label.textContent = 'Chưa chạy'
    value.textContent = 'Nhập thông tin và bấm Bắt đầu'
    healthBtn.classList.remove('visible')
    proxyAddr.classList.remove('visible')
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
    ? '<span class="spin">⟳</span> Đang khởi động…'
    : '<span>▶</span> Bắt đầu'
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
  input.type = input.type === 'password' ? 'text' : 'password'
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function startProxy() {
  const target = document.getElementById('target').value.trim()
  const token  = document.getElementById('token').value.trim()
  const port   = parseInt(document.getElementById('port').value, 10) || 8765

  showError('')

  if (!target) { showError('⚠️ Vui lòng nhập Jira URL'); return }
  if (!token)  { showError('⚠️ Vui lòng nhập PAT token'); return }

  setLoading(true)
  currentPort = port

  await api.saveConfig({ target, port: String(port) })

  const result = await api.startProxy({ target, token, port })
  setLoading(false)

  if (result.ok) {
    setRunning(true)
  } else {
    showError('❌ ' + (result.error || 'Không thể khởi động proxy'))
  }
}

async function stopProxy() {
  showError('')
  const btn = document.getElementById('btn-stop')
  btn.disabled = true
  btn.innerHTML = '<span class="spin">⟳</span> Đang dừng…'

  const result = await api.stopProxy()

  btn.disabled = false
  btn.innerHTML = '<span>■</span> Dừng proxy'

  if (result.ok) {
    setRunning(false)
  } else {
    showError('❌ ' + (result.error || 'Không thể dừng proxy'))
  }
}

function openHealth() {
  api.openHealth(currentPort)
}

// ── Boot ───────────────────────────────────────────────────────────────────────

init()
