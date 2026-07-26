'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { compressImageToDataUrl } from '@/lib/compress-image'
import { uploadRomToCloudinary } from '@/lib/cloudinary-chunked-upload'
import { SYSTEMS, type System } from '@/lib/emulator-systems'

const MAX_ROM_BYTES = 2 * 1024 ** 3 // 2GB

function downloadCSVTemplate() {
  const headers = ['name', 'system', 'romLocalPath', 'coverLocalPath']
  const sample = [
    ['Super Mario Bros', 'nes', '/data/roms/smb.nes', '/data/covers/smb.jpg'],
    ['The Legend of Zelda', 'nes', '/data/roms/zelda.nes', ''],
  ]
  const csv = [headers, ...sample].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'games_template.csv'
  link.click()
  window.URL.revokeObjectURL(url)
}

type Rom = {
  id: string
  name: string
  system: System
  url: string
  public_id: string
  bytes: number
  cover_url: string | null
  created_at: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/emulator/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) onLoggedIn()
      else setError('Sai mật khẩu')
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') login() }}
        placeholder="Admin password"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-fg outline-none placeholder-muted focus:border-accent sm:text-sm"
      />
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
      <button
        onClick={login}
        disabled={loading || !password}
        className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
      >
        Đăng nhập
      </button>
    </div>
  )
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [system, setSystem] = useState<System>('nes')
  const [name, setName] = useState('')
  const [romFile, setRomFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [dragOverRom, setDragOverRom] = useState(false)
  const [dragOverCover, setDragOverCover] = useState(false)

  const romInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const romDragRef = useRef<HTMLDivElement>(null)
  const coverDragRef = useRef<HTMLDivElement>(null)

  const pickRomFile = (file: File) => {
    setError('')
    if (file.size > MAX_ROM_BYTES) {
      setError(`File ROM vượt quá 2GB (${formatBytes(file.size)}) — vui lòng chọn file nhỏ hơn.`)
      setRomFile(null)
      return
    }
    setRomFile(file)
  }

  const handleRomDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.type === 'dragover' || e.type === 'dragenter') setDragOverRom(true)
    else setDragOverRom(false)
  }

  const handleRomDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverRom(false)
    const files = e.dataTransfer.files
    if (files.length > 0) pickRomFile(files[0])
  }

  const handleCoverDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.type === 'dragover' || e.type === 'dragenter') setDragOverCover(true)
    else setDragOverCover(false)
  }

  const handleCoverDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverCover(false)
    const files = e.dataTransfer.files
    if (files.length > 0) setCoverFile(files[0])
  }

  const upload = async () => {
    if (!romFile || !name.trim()) return
    setError('')
    setProgress(0)
    try {
      const signRes = await fetch('/api/emulator/admin/upload-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: romFile.name, sizeBytes: romFile.size, system }),
      })
      const signData = await signRes.json()
      if (signData.error) { setError(signData.error); setProgress(null); return }

      const uploaded = await uploadRomToCloudinary(romFile, signData, (fraction) => setProgress(fraction))

      const coverDataUrl = coverFile ? await compressImageToDataUrl(coverFile, 400, 0.85) : undefined

      const createRes = await fetch('/api/emulator/admin/roms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          system,
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          bytes: uploaded.bytes,
          coverDataUrl,
        }),
      })
      const createData = await createRes.json()
      if (createData.error) { setError(createData.error); setProgress(null); return }

      setName('')
      setRomFile(null)
      setCoverFile(null)
      if (romInputRef.current) romInputRef.current.value = ''
      if (coverInputRef.current) coverInputRef.current.value = ''
      onUploaded()
    } catch {
      setError('Upload thất bại — kiểm tra kết nối mạng rồi thử lại.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-widest text-muted">Upload ROM mới</p>
      <div className="flex flex-wrap gap-2">
        {SYSTEMS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSystem(s.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              system === s.value ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-border bg-background text-muted hover:text-fg'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên game hiển thị"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-fg outline-none placeholder-muted focus:border-accent sm:text-sm"
      />
      <div className="flex flex-wrap gap-3">
        <div
          ref={romDragRef}
          onDragOver={handleRomDrag}
          onDragEnter={handleRomDrag}
          onDragLeave={handleRomDrag}
          onDrop={handleRomDrop}
          className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs transition-colors ${
            dragOverRom ? 'border-accent bg-accent/5 text-accent' : 'border-border bg-background text-muted hover:border-accent/40 hover:text-fg'
          }`}
        >
          <label className="flex flex-1 cursor-pointer items-center gap-2">
            📁 {romFile ? romFile.name : `Chọn hoặc kéo file ROM (${SYSTEMS.find((s) => s.value === system)?.exts})`}
            <input
              ref={romInputRef}
              type="file"
              accept=".nes,.sfc,.smc,.gba,.gbc,.gb,.n64,.z64,.v64,.zip"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickRomFile(f) }}
              className="hidden"
            />
          </label>
        </div>
        <div
          ref={coverDragRef}
          onDragOver={handleCoverDrag}
          onDragEnter={handleCoverDrag}
          onDragLeave={handleCoverDrag}
          onDrop={handleCoverDrop}
          className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs transition-colors ${
            dragOverCover ? 'border-accent bg-accent/5 text-accent' : 'border-border bg-background text-muted hover:border-accent/40 hover:text-fg'
          }`}
        >
          <label className="flex flex-1 cursor-pointer items-center gap-2">
            🖼️ {coverFile ? coverFile.name : 'Kéo hoặc chọn ảnh cover (tùy chọn)'}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setCoverFile(f) }}
              className="hidden"
            />
          </label>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {progress !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <button
        onClick={upload}
        disabled={progress !== null || !romFile || !name.trim()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
      >
        {progress !== null ? `Đang tải lên... ${Math.round(progress * 100)}%` : 'Tải lên'}
      </button>
    </div>
  )
}

function RomRow({ rom, onChanged }: { rom: Rom; onChanged: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [dragOverCover, setDragOverCover] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const coverButtonRef = useRef<HTMLButtonElement>(null)

  const rename = async (value: string) => {
    if (!value.trim() || value.trim() === rom.name) return
    await fetch(`/api/emulator/admin/roms?id=${rom.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value.trim() }),
    })
    onChanged()
  }

  const changeSystem = async (system: System) => {
    if (system === rom.system) return
    await fetch(`/api/emulator/admin/roms?id=${rom.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system }),
    })
    onChanged()
  }

  const uploadCover = async (file: File) => {
    const coverDataUrl = await compressImageToDataUrl(file, 400, 0.85)
    await fetch(`/api/emulator/admin/roms?id=${rom.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverDataUrl }),
    })
    onChanged()
  }

  const removeCover = async () => {
    await fetch(`/api/emulator/admin/roms?id=${rom.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeCover: true }),
    })
    onChanged()
  }

  const handleCoverDrag = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (e.type === 'dragover' || e.type === 'dragenter') setDragOverCover(true)
    else setDragOverCover(false)
  }

  const handleCoverDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setDragOverCover(false)
    const files = e.dataTransfer.files
    if (files.length > 0) void uploadCover(files[0])
  }

  const remove = async () => {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/emulator/admin/roms?id=${rom.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onChanged()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="shrink-0">
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadCover(f) }}
        />
        <button
          ref={coverButtonRef}
          onClick={() => coverInputRef.current?.click()}
          onDragOver={handleCoverDrag}
          onDragEnter={handleCoverDrag}
          onDragLeave={handleCoverDrag}
          onDrop={handleCoverDrop}
          title="Kéo hoặc nhấp để đổi ảnh cover"
          className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border transition-colors ${
            dragOverCover ? 'border-accent bg-accent/10' : 'border-border bg-background hover:border-accent/50'
          } text-muted hover:text-fg`}
        >
          {rom.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rom.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg">🕹️</span>
          )}
        </button>
        {rom.cover_url && (
          <button onClick={removeCover} className="mt-1 block w-full text-center text-[10px] text-muted hover:text-red-400">
            Xóa ảnh
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <input
          defaultValue={rom.name}
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 font-medium text-fg outline-none transition-colors hover:border-border focus:border-accent focus:bg-background"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={rom.system}
            onChange={(e) => void changeSystem(e.target.value as System)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-fg outline-none focus:border-accent"
          >
            {SYSTEMS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="font-mono text-xs text-muted">{formatBytes(rom.bytes)}</span>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <button
        onClick={remove}
        disabled={deleting}
        className="shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
      >
        {deleting ? 'Đang xóa...' : 'Xóa'}
      </button>
    </div>
  )
}

function CSVImportForm({ onImported }: { onImported: () => void }) {
  const [csvFile, setCSVFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.type === 'dragover' || e.type === 'dragenter') setDragOver(true)
    else setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) setCSVFile(files[0])
  }

  const importCSV = async () => {
    if (!csvFile) return
    setLoading(true)
    setError('')
    try {
      const text = await csvFile.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) {
        setError('CSV phải có ít nhất 1 dòng dữ liệu')
        return
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
      const nameIdx = headers.indexOf('name')
      const systemIdx = headers.indexOf('system')
      const romPathIdx = headers.indexOf('romLocalPath')
      const coverPathIdx = headers.indexOf('coverLocalPath')

      if (nameIdx === -1 || systemIdx === -1) {
        setError('CSV phải có cột "name" và "system"')
        return
      }

      const games = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        if (!cols[nameIdx] || !cols[systemIdx]) continue
        games.push({
          name: cols[nameIdx],
          system: cols[systemIdx],
          romPath: romPathIdx >= 0 ? cols[romPathIdx] : '',
          coverPath: coverPathIdx >= 0 ? cols[coverPathIdx] : '',
        })
      }

      const res = await fetch('/api/emulator/admin/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }

      setCSVFile(null)
      if (csvInputRef.current) csvInputRef.current.value = ''
      onImported()
    } catch {
      setError('Lỗi đọc CSV — kiểm tra định dạng file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted">Import từ CSV</p>
        <button
          onClick={downloadCSVTemplate}
          className="text-xs text-accent hover:text-accent-soft"
        >
          📥 Tải template
        </button>
      </div>
      <div
        onDragOver={handleDrag}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver ? 'border-accent bg-accent/5' : 'border-border bg-background'
        }`}
      >
        <label className="flex cursor-pointer flex-col items-center gap-2">
          📄 {csvFile ? csvFile.name : 'Kéo CSV hoặc nhấp để chọn'}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setCSVFile(f) }}
            className="hidden"
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={importCSV}
        disabled={loading || !csvFile}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
      >
        {loading ? 'Đang import...' : 'Import'}
      </button>
    </div>
  )
}

function AdminPanel() {
  const [roms, setRoms] = useState<Rom[]>([])
  const [filter, setFilter] = useState<System | 'all'>('all')

  const load = useCallback(async () => {
    const res = await fetch('/api/emulator/admin/roms')
    const data = await res.json()
    if (data.roms) setRoms(data.roms)
  }, [])

  useEffect(() => { load() }, [load])

  const logout = async () => {
    await fetch('/api/emulator/admin/logout', { method: 'POST' })
    window.location.reload()
  }

  const visible = filter === 'all' ? roms : roms.filter((r) => r.system === filter)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold text-fg">Quản lý ROM</p>
        <button onClick={logout} className="text-xs text-muted hover:text-fg">Đăng xuất</button>
      </div>

      <UploadForm onUploaded={load} />

      <CSVImportForm onImported={load} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${filter === 'all' ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-border bg-background text-muted hover:text-fg'}`}
        >
          Tất cả ({roms.length})
        </button>
        {SYSTEMS.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${filter === s.value ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-border bg-background text-muted hover:text-fg'}`}
          >
            {s.label} ({roms.filter((r) => r.system === s.value).length})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.length === 0 && <p className="text-center text-sm text-muted">Chưa có ROM nào</p>}
        {visible.map((rom) => <RomRow key={rom.id} rom={rom} onChanged={load} />)}
      </div>
    </div>
  )
}

export default function EmulatorAdminPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/emulator/admin/roms').then((res) => setLoggedIn(res.ok))
  }, [])

  return (
    <ToolShell name="Emulator — Admin" icon="🛠️" description="Quản lý thư viện ROM">
      {loggedIn === null ? null : loggedIn ? <AdminPanel /> : <LoginScreen onLoggedIn={() => setLoggedIn(true)} />}
    </ToolShell>
  )
}
