/* global api */
'use strict'

let currentPort = 8765
let updateState = 'none' // 'none' | 'available' | 'downloading' | 'downloaded'
let checkingUpdate = false

// ── Theme ──────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.getElementById('theme-toggle').textContent = theme === 'light' ? '🌙' : '☀️'
}

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || 'light'
  var next = current === 'light' ? 'dark' : 'light'
  localStorage.setItem('theme', next)
  applyTheme(next)
}

// ── Update check button ────────────────────────────────────────────────────────

function setCheckBtnLoading() {
  var btn = document.getElementById('check-update-btn')
  btn.innerHTML = '<span class="spin">⟳</span>'
  btn.classList.add('active')
  btn.disabled = true
}

function resetCheckBtn() {
  var btn = document.getElementById('check-update-btn')
  btn.textContent = '↺'
  btn.classList.remove('active', 'ok')
  btn.disabled = false
  checkingUpdate = false
}

function setCheckBtnOk() {
  var btn = document.getElementById('check-update-btn')
  btn.textContent = '✓'
  btn.classList.remove('active')
  btn.classList.add('ok')
  btn.disabled = false
  checkingUpdate = false
  setTimeout(resetCheckBtn, 2500)
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  // Theme: respect saved preference, fall back to system preference
  var savedTheme = localStorage.getItem('theme')
  if (!savedTheme) {
    savedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light'
  }
  applyTheme(savedTheme)

  // Show version
  try {
    var version = await api.getVersion()
    document.getElementById('version-chip').textContent = 'v' + version
  } catch { /* noop */ }

  // Load saved/default config (target + port, never token)
  try {
    var saved = await api.loadConfig()
    if (saved) {
      if (saved.target) document.getElementById('target').value = saved.target
      if (saved.port) {
        document.getElementById('port').value = saved.port
        currentPort = parseInt(saved.port, 10) || 8765
        updateAddr()
      }
    }
  } catch { /* noop */ }

  // Sync with any running proxy (window may have been reopened)
  try {
    var status = await api.getStatus()
    if (status.running && status.config) {
      currentPort = status.config.port
      document.getElementById('port').value = String(status.config.port)
      document.getElementById('target').value = status.config.target
      updateAddr()
    }
    setRunning(status.running)
  } catch { /* noop */ }

  // Load auto-start state
  try {
    var autoStart = await api.getAutoStart()
    document.getElementById('autostart-toggle').checked = autoStart
  } catch { /* noop */ }

  // ── Update event listeners ──

  api.onCheckingForUpdate(function() {
    checkingUpdate = true
    setCheckBtnLoading()
  })

  api.onUpdateAvailable(function(info) {
    resetCheckBtn()
    updateState = 'available'
    document.getElementById('update-text').textContent = 'Có bản cập nhật mới: v' + info.version
    document.getElementById('update-banner').classList.add('visible')
    document.getElementById('update-btn').textContent = 'Tải về'
    document.getElementById('update-btn').disabled = false
  })

  api.onDownloadProgress(function(progress) {
    updateState = 'downloading'
    var pct = Math.round(progress.percent || 0)
    document.getElementById('update-progress').style.display = 'block'
    document.getElementById('update-progress-bar').style.width = pct + '%'
    document.getElementById('update-btn').textContent = pct + '%'
    document.getElementById('update-btn').disabled = true
  })

  api.onUpdateDownloaded(function() {
    updateState = 'downloaded'
    document.getElementById('update-progress').style.display = 'none'
    document.getElementById('update-btn').textContent = '↺ Cài & Khởi động lại'
    document.getElementById('update-btn').disabled = false
  })

  api.onUpdateNotAvailable(function() {
    setCheckBtnOk()
  })

  api.onUpdateError(function(err) {
    resetCheckBtn()
    showError('Lỗi kiểm tra cập nhật: ' + (err.message || 'Không rõ'))
    setTimeout(function() { showError('') }, 5000)
  })
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function setRunning(running) {
  var card      = document.getElementById('status-card')
  var dot       = document.getElementById('status-dot')
  var label     = document.getElementById('status-label')
  var value     = document.getElementById('status-value')
  var healthBtn = document.getElementById('health-btn')
  var btnStart  = document.getElementById('btn-start')
  var btnStop   = document.getElementById('btn-stop')

  if (running) {
    card.className  = 'status-card running'
    dot.className   = 'status-dot running'
    label.textContent = 'Đang chạy'
    value.textContent = 'http://127.0.0.1:' + currentPort
    healthBtn.classList.add('visible')
  } else {
    card.className  = 'status-card'
    dot.className   = 'status-dot'
    label.textContent = 'Chưa chạy'
    value.textContent = 'Nhập thông tin và bấm Bắt đầu'
    healthBtn.classList.remove('visible')
  }

  btnStart.style.display = running ? 'none' : 'flex'
  btnStop.style.display  = running ? 'flex'  : 'none'

  var ids = ['target', 'token', 'port']
  ids.forEach(function(id) {
    document.getElementById(id).disabled = running
  })
  document.getElementById('toggle-eye').disabled = running
}

function showError(msg) {
  var box = document.getElementById('error-box')
  box.textContent = msg
  box.className = 'error-box' + (msg ? ' visible' : '')
}

function setLoadingStart(loading) {
  var btn = document.getElementById('btn-start')
  btn.disabled = loading
  btn.innerHTML = loading
    ? '<span class="spin">⟳</span> Đang khởi động…'
    : '▶ Bắt đầu'
}

function updateAddr() {
  var p = parseInt(document.getElementById('port').value, 10) || 8765
  currentPort = p
  document.getElementById('addr-input').value = 'http://127.0.0.1:' + p
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function startProxy() {
  var target = document.getElementById('target').value.trim()
  var token  = document.getElementById('token').value.trim()
  var port   = parseInt(document.getElementById('port').value, 10) || 8765

  showError('')
  if (!target) { showError('⚠️  Vui lòng nhập Jira URL'); return }

  setLoadingStart(true)
  await api.saveConfig({ target: target, port: String(port) })

  var result = await api.startProxy({ target: target, token: token, port: port })
  setLoadingStart(false)

  if (result.ok) {
    currentPort = result.port || port
    document.getElementById('port').value = String(currentPort)
    updateAddr()
    setRunning(true)
  } else {
    showError('❌  ' + (result.error || 'Không thể khởi động proxy'))
  }
}

async function stopProxy() {
  showError('')
  var btn = document.getElementById('btn-stop')
  btn.disabled = true
  btn.innerHTML = '<span class="spin">⟳</span> Đang dừng…'

  var result = await api.stopProxy()
  btn.disabled = false
  btn.innerHTML = '■ Dừng proxy'

  if (result.ok) {
    setRunning(false)
  } else {
    showError('❌  ' + (result.error || 'Không thể dừng proxy'))
  }
}

// ── Wire up all event listeners (no inline onclick — blocked by CSP) ──────────

document.getElementById('btn-start').addEventListener('click', startProxy)
document.getElementById('btn-stop').addEventListener('click', stopProxy)

document.getElementById('health-btn').addEventListener('click', function() {
  api.openHealth(currentPort)
})

document.getElementById('update-btn').addEventListener('click', function() {
  if (updateState === 'downloaded') {
    api.installUpdate()
  } else if (updateState === 'available') {
    updateState = 'downloading'
    api.downloadUpdate()
  }
})

document.getElementById('check-update-btn').addEventListener('click', async function() {
  if (checkingUpdate) return
  checkingUpdate = true
  setCheckBtnLoading()
  try { await api.checkUpdate() } catch { resetCheckBtn() }
})

document.getElementById('theme-toggle').addEventListener('click', toggleTheme)

document.getElementById('toggle-eye').addEventListener('click', function() {
  var input = document.getElementById('token')
  var btn   = document.getElementById('toggle-eye')
  input.type = input.type === 'password' ? 'text' : 'password'
  btn.textContent = input.type === 'password' ? '👁' : '🙈'
})

document.getElementById('port').addEventListener('input', updateAddr)

document.getElementById('autostart-toggle').addEventListener('change', async function() {
  var enabled = this.checked
  var actual = await api.setAutoStart(enabled)
  this.checked = actual
})

document.getElementById('log-clear-btn').addEventListener('click', function() {
  var panel = document.getElementById('log-panel')
  panel.innerHTML = '<div class="log-empty" id="log-empty">Đã xóa log.</div>'
})

// ── Log panel ─────────────────────────────────────────────────────────────────

api.onProxyLog(function(entry) {
  var panel = document.getElementById('log-panel')
  var empty = document.getElementById('log-empty')
  if (empty) empty.remove()

  var reqPath = entry.path.length > 40 ? entry.path.substring(0, 40) + '…' : entry.path
  var cls = entry.status >= 400 ? 'log-err'
           : entry.status >= 300 ? 'log-warn'
           : 'log-ok'
  var xt   = entry.xat ? 'XT:✓' : 'XT:✗'
  var mode = '[' + entry.mode + ']'
  var line = entry.time + ' ' + entry.method + ' ' + reqPath + ' → ' + entry.status + ' ' + mode + ' ' + entry.auth + ' ' + xt

  var wrap = document.createElement('div')
  wrap.style.cssText = 'margin-bottom:3px'

  var item = document.createElement('div')
  item.className = 'log-entry ' + cls
  item.title = entry.path + (entry.body ? '\n\n' + entry.body : '')
  item.textContent = line
  wrap.appendChild(item)

  // Show response body for 4xx/5xx as indented second line
  if (entry.body && entry.status >= 400) {
    var bodyEl = document.createElement('div')
    bodyEl.className = 'log-entry log-err'
    bodyEl.style.cssText = 'padding-left:14px; opacity:0.75; font-size:9px'
    var bodyText = entry.body.replace(/\s+/g, ' ').trim()
    bodyEl.textContent = bodyText.length > 120 ? bodyText.substring(0, 120) + '…' : bodyText
    bodyEl.title = entry.body
    wrap.appendChild(bodyEl)
  }

  panel.insertBefore(wrap, panel.firstChild)

  // Keep max 80 entries
  while (panel.children.length > 80) {
    panel.removeChild(panel.lastChild)
  }
})

// ── Boot ───────────────────────────────────────────────────────────────────────

init()
