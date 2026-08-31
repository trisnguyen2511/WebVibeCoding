# Timeline Management — Feature Reference

> Paste đầu prompt khi làm việc với bất kỳ file nào trong `app/tools/timeline/` hoặc `lib/timeline-*.ts`

---

## File map

```
app/tools/timeline/
  page.tsx                    — Project list (create / delete / import)
  layout.tsx                  — Wraps ToolShell
  [projectId]/page.tsx        — Main project view: state, keyboard shortcuts, toolbar
  components/
    GanttChart.tsx            — Core chart: drag bars, cell clicks, keyboard, tooltip
    TaskForm.tsx              — Create / edit task side panel
    TimeEntryModal.tsx        — Log actual hours on a date
    QuickEstimateModal.tsx    — (inside GanttChart.tsx) Set estimate dates + hours
    TodayPanel.tsx            — Today's time log summary
    JiraPanel.tsx             — Jira sync (pull issues, push worklogs)

lib/
  timeline-types.ts           — All TypeScript types (source of truth)
  timeline-storage.ts         — localStorage CRUD helpers
```

---

## Data model (timeline-types.ts)

```ts
Task {
  id, projectId, title, status: TaskStatus
  sprintId?, sprintIds?: string[]          // sprint membership
  jiraId?, jiraKey?, jiraStatus?           // Jira integration
  parentKey?, parentTitle?                 // grouping in Gantt
  dueDate?                                 // YYYY-MM-DD — yellow diamond marker
  estimateStartDate?, estimateEndDate?     // purple bar (drag to resize/move)
  estimateHours?                           // used for progress % in tooltip
  actualStartDate?, actualEndDate?         // blue bar
  timeEntries: TimeEntry[]                 // actual hours per day
  order: number                            // drag-to-reorder
}

TimeEntry { id, date, hours, source: 'manual'|'jira', jiraWorklogId?, note? }

Project { id, name, sprintConfig, sprints, jiraConfig? }

Sprint { id, name, startDate, endDate, isManual }
```

`TaskStatus` = `'todo' | 'in-progress' | 'done' | 'blocked'`

---

## Storage layer (timeline-storage.ts)

All data lives in **localStorage** (no server, no DB).

| Function | Key | Notes |
|---|---|---|
| `getProjects()` | `timeline:projects` | |
| `saveProject(p)` | | upsert by id |
| `deleteProject(id)` | | also deletes tasks |
| `getTasks(projectId)` | `timeline:tasks` | filtered + sorted by `.order` |
| `saveTask(task)` | | upsert by id |
| `upsertTimeEntry(taskId, entry)` | | mutates task in-place |
| `deleteTimeEntry(taskId, entryId)` | | |
| `exportData(projectId?)` | | returns `ExportData` JSON |
| `importData(data)` | | upserts, preserves existing |

Collapsed parent groups saved separately: `timeline:collapsed:{projectId}` → `string[]` of parentKeys.

---

## GanttChart — interaction model

### Visual layers per task row (right panel)

```
[estimate bar]   purple, draggable (resize-start / resize-end / move)
[actual bar]     blue, draggable (resize-start / resize-end / move)
[hour segments]  short accent line per TimeEntry date
[due date]       yellow diamond
[cell overlay]   E / A / D hint chips on group-hover (CSS only, no JS state)
```

### Cell keyboard shortcuts (active while mouse is over any cell)

| Key | Action |
|-----|--------|
| `E` | Open `QuickEstimateModal` → set estimate dates + hours |
| `A` | Open `TimeEntryModal` → log actual hours |
| `D` | Set `dueDate` to that cell's date |
| `X` | Trigger export JSON |

### Page-level keyboard shortcuts ([projectId]/page.tsx)

| Key | Action |
|-----|--------|
| `N` | New task form |
| `T` | Today panel |
| `J` | Jira sync panel |
| `X` | Export JSON |
| `?` | Shortcuts panel |
| `Esc` | Close all panels |

### Drag system (DragState)

Types: `resize-start | resize-end | move | resize-est-start | resize-est-end | move-est`

- Mouse down on bar handle → set `dragState` ref
- Mouse move → compute delta days → update `dragPreview` state (visual only)
- Mouse up → call `onUpdateTask` with final dates

---

## QuickEstimateModal (inside GanttChart.tsx)

Triggered by pressing `E` over a Gantt cell.

```ts
onSave: (startDate: string, endDate: string, hours?: number) => void
```

- Escape key uses stable ref pattern (`useEffect([], [])` + `onCloseRef`)
- Save disabled if `startDate > endDate` or `hours < 0`
- `hours = 0` or empty → saves `estimateHours: undefined` (treated as "no estimate")

---

## Tooltip (hover on a cell with a TimeEntry)

Shown via fixed-position div when hovering a cell that has a time entry.

Displays: date, hours logged that day, total logged vs estimateHours, progress bar.

Guards: `(estimateHours ?? 0) > 0` (never renders stray `0` text node).

---

## Jira integration (JiraPanel.tsx)

Config stored in `project.jiraConfig`: `{ host, email, token }` — PAT auth.

- **Pull**: fetches issues from Jira → upserts as Tasks with `jiraId`, `jiraKey`, `jiraStatus`
- **Push**: reads `timeEntries` with `source='manual'` → posts worklogs to Jira API
- Sync logs: `JiraSyncLog[]` and `JiraUploadLog[]` shown in panel

Bridge script: `public/jira-bridge.js` (CORS workaround via browser extension).

---

## Display rows (Gantt left panel)

Tasks with a `parentKey` are grouped under collapsible header rows:

```ts
type DisplayRow =
  | { type: 'header'; parentKey; parentTitle; count; colorIdx; isCollapsed; estStart?; estEnd?; ... }
  | { type: 'task';   task; isSubtask; colorIdx; hiddenByCollapse? }
```

Group colors: 6-color `GROUP_PALETTE` (blue, violet, emerald, amber, pink, cyan), assigned by index.

---

## Constants (GanttChart.tsx)

```ts
DAY_W = 38px       // column width per day
ROW_H = 52px       // task row height
GROUP_H = 32px     // group header height
HEADER_H = 64px    // date header height
LEFT_MIN = 260px   // min left panel width
LEFT_DEFAULT = 360px
```

---

## Hard rules when editing this feature

- Never use `any` — all types are in `timeline-types.ts`
- `estimateHours` guard: always use `(v ?? 0) > 0`, never truthy `v &&`
- Do not add new state to GanttChart for hover effects — use CSS `group` / `group-hover`
- `onSave` in QuickEstimateModal passes `hours?: number` (undefined = no estimate, not 0)
- Storage is always localStorage — no API calls from `timeline-storage.ts`
- Import only from `@/lib/timeline-types`, `@/lib/timeline-storage` — never cross-tool imports
- All layouts mobile-first (390px min-width)
- Data/code output uses `font-mono` (JetBrains Mono)

---

## Common prompts

**Add a new field to Task:**
> "Thêm field `X` vào Task type trong `lib/timeline-types.ts`, cập nhật `TaskForm.tsx` để edit được, và hiển thị trong tooltip của `GanttChart.tsx`."

**Fix a Gantt display bug:**
> "Bug trong `GanttChart.tsx`: [mô tả]. Chỉ sửa file đó, không refactor xung quanh."

**Add a new keyboard shortcut trong cell:**
> "Thêm shortcut `[key]` khi hover Gantt cell để [action]. Logic shortcuts nằm trong `useEffect` cell-keyboard trong `GanttChart.tsx` ~line 450."

**Jira sync issue:**
> "Fix Jira sync trong `JiraPanel.tsx`. Bridge script ở `public/jira-bridge.js`."
