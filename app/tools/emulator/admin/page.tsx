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
    // NES
    ['Super Mario Bros', 'nes', '/data/roms/smb.nes', '/data/covers/smb.jpg'],
    ['The Legend of Zelda', 'nes', '/home/user/games/zelda.nes', '/home/user/covers/zelda.jpg'],
    ['Metroid', 'nes', 'C:\\Games\\metroid.nes', ''],
    // SNES
    ['Super Metroid', 'snes', '/data/roms/super_metroid.sfc', '/data/covers/super_metroid.jpg'],
    ['Final Fantasy III', 'snes', 'C:\\Games\\ff3.smc', 'C:\\Covers\\ff3.jpg'],
    ['Chrono Trigger', 'snes', '\\\\server\\share\\roms\\chrono_trigger.sfc', ''],
    // GBA
    ['Pokemon Emerald', 'gba', '/data/roms/pokemon_emerald.gba', '/data/covers/pokemon_emerald.jpg'],
    ['Fire Emblem', 'gba', 'C:\\Users\\Admin\\Games\\fire_emblem.gba', ''],
    // GBC/GB
    ['Pokemon Red', 'gbc', '/data/roms/pokemon_red.gbc', '/data/covers/pokemon_red.jpg'],
    ['Tetris', 'gbc', 'D:\\Emulation\\tetris.gbc', ''],
    // N64
    ['Super Mario 64', 'n64', '/data/roms/super_mario_64.z64', '/data/covers/mario64.jpg'],
    ['The Legend of Zelda: Ocarina of Time', 'n64', 'C:\\Games\\zelda_oot.n64', 'C:\\Covers\\zelda_oot.jpg'],
    // Arcade
    ['Street Fighter II', 'arcade', '/data/roms/sf2.zip', '/data/covers/sf2_arcade.jpg'],
    ['Metal Slug', 'arcade', 'C:\\Games\\metal_slug.zip', ''],
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

  const handleCoverPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) setCoverFile(file)
        break
      }
    }
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
          onPaste={handleCoverPaste}
          tabIndex={0}
          className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs transition-colors outline-none focus:border-accent ${
            dragOverCover ? 'border-accent bg-accent/5 text-accent' : 'border-border bg-background text-muted hover:border-accent/40 hover:text-fg'
          }`}
        >
          <label className="flex flex-1 cursor-pointer items-center gap-2">
            🖼️ {coverFile ? coverFile.name : 'Kéo/dán/chọn ảnh cover (tùy chọn)'}
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

  const handleCoverPaste = async (e: React.ClipboardEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) void uploadCover(file)
        break
      }
    }
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
          onPaste={handleCoverPaste}
          title="Kéo/dán/nhấp để đổi ảnh cover"
          className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border transition-colors outline-none focus:border-accent ${
            dragOverCover ? 'border-accent bg-accent/10' : 'border-border bg-background hover:border-accent/50'
          } text-muted hover:text-fg`}
          tabIndex={0}
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

function FolderImportForm({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.type === 'dragover' || e.type === 'dragenter') setDragOver(true)
    else setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = e.dataTransfer.files
    setFiles(Array.from(droppedFiles))
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files))
  }

  const importFolder = async () => {
    if (files.length === 0) return
    setLoading(true)
    setError('')
    setProgress(0)
    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append('files', file, file.webkitRelativePath || file.name)
      }

      const res = await fetch('/api/emulator/admin/import-folder', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }

      setFiles([])
      if (folderInputRef.current) folderInputRef.current.value = ''
      onImported()
    } catch {
      setError('Lỗi import folder — kiểm tra cấu trúc thư mục.')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const folderCount = files.length > 0 ? files[0].webkitRelativePath?.split('/')[0] || 'folder' : 'folder'

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-widest text-muted">Import từ Folder</p>
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
          📁 {files.length > 0 ? `${folderCount} (${files.length} file)` : 'Kéo folder hoặc nhấp để chọn'}
          <span className="text-[11px] text-muted">Cấu trúc: nes/dino/[dino.zip, dino.png]</span>
          <input
            ref={folderInputRef}
            type="file"
            onChange={handleFolderSelect}
            className="hidden"
            {...({ webkitdirectory: '' } as any)}
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {progress !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <button
        onClick={importFolder}
        disabled={loading || files.length === 0}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
      >
        {loading ? `Đang import... ${progress !== null ? Math.round(progress * 100) + '%' : ''}` : 'Import'}
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

      <FolderImportForm onImported={load} />

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
