// Reads the HN shown on whatever HOSxP window/dialog is on top, straight from its Win32 controls.
// Locator: a visible TcxLabel "HN" / "HN/Q" / "HN :", then the edit right next to it on the same row.
// Windows are scanned in z-order (top first), so a dialog over the main form wins.
import koffi from 'koffi'
import { Worker } from 'node:worker_threads'

const u = koffi.load('user32.dll')
const RECT = koffi.struct('HX_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
const EnumProc = koffi.proto('bool __stdcall HxEnumProc(intptr h, intptr l)')
const EnumWindows = u.func('bool __stdcall EnumWindows(HxEnumProc *cb, intptr l)')
const EnumChildWindows = u.func('bool __stdcall EnumChildWindows(intptr parent, HxEnumProc *cb, intptr l)')
const GetClassName = u.func('int __stdcall GetClassNameW(intptr h, _Out_ uint16 *buf, int n)')
const GetParent = u.func('intptr __stdcall GetParent(intptr h)')
const GetWindowRect = u.func('bool __stdcall GetWindowRect(intptr h, _Out_ HX_RECT *r)')
const GetWindowThreadProcessId = u.func('uint32 __stdcall GetWindowThreadProcessId(intptr h, _Out_ uint32 *pid)')
const IsWindowVisible = u.func('bool __stdcall IsWindowVisible(intptr h)')
const SendMessageTimeout = u.func(
  'intptr __stdcall SendMessageTimeoutW(intptr h, uint32 msg, uintptr wp, _Out_ uint16 *lp, uint32 flags, uint32 timeout, _Out_ uintptr *res)'
)

const WM_GETTEXT = 0x0d, SMTO_ABORTIFHUNG = 0x2
const HN_LABEL = /^\s*HN\s*(\/\s*Q)?\s*[:.]?\s*$/i
const HN_VALUE = /^\d+$/
const MAX_GAP = 60 // px between the label's right edge and its edit box

const buf = Buffer.alloc(1024)
const str = (n) => buf.toString('utf16le', 0, n * 2)
const className = (h) => str(GetClassName(h, buf, buf.length / 2))
// Never blocks on a hung HOSxP: returns null if it doesn't answer within 200ms.
function text(h) {
  const res = [0]
  if (!SendMessageTimeout(h, WM_GETTEXT, buf.length / 2, buf, SMTO_ABORTIFHUNG, 200, res)) return null
  return str(Number(res[0]))
}
function rect(h) {
  const r = {}
  GetWindowRect(h, r)
  return r
}
function pidOf(h) {
  const pid = [0]
  GetWindowThreadProcessId(h, pid)
  return pid[0]
}
function children(parent, pred) {
  const out = []
  EnumChildWindows(parent, (h) => (pred(h) && out.push(h), true), 0)
  return out
}

// Visible top-level HOSxP windows, top of z-order first. Local calls only (no messages to HOSxP).
function hosxpWindows() {
  const all = []
  EnumWindows((h) => (IsWindowVisible(h) && all.push(h), true), 0)
  const main = all.find((h) => className(h) === 'TMainForm')
  if (!main) return []
  const pid = pidOf(main)
  return all.filter((h) => pidOf(h) === pid && className(h) !== 'TApplication')
}

function editRightOf(label) {
  const parent = GetParent(label), lr = rect(label), mid = (lr.top + lr.bottom) / 2
  return children(parent, (h) => GetParent(h) === parent && IsWindowVisible(h) && /Edit$/.test(className(h)))
    .map((h) => ({ h, r: rect(h) }))
    .filter(({ r }) => r.left >= lr.right && r.left - lr.right <= MAX_GAP && r.top <= mid && r.bottom >= mid)
    .sort((a, b) => a.r.left - b.r.left)[0]?.h
}

// First HN box with a value, scanning windows top-down.
function findHnEdit(windows) {
  for (const top of windows) {
    const labels = children(top, (h) => IsWindowVisible(h) && className(h) === 'TcxLabel' && HN_LABEL.test(text(h) ?? ''))
    for (const label of labels) {
      const edit = editRightOf(label)
      if (edit && HN_VALUE.test((text(edit) ?? '').trim())) return edit
    }
  }
  return null
}

let cache = { top: 0, edit: null }
// Current HN, '' when no HOSxP window shows one, null when HOSxP is busy (keep the last value).
export function readHn() {
  const windows = hosxpWindows()
  const top = windows[0] ?? 0
  if (top !== cache.top || !cache.edit || !IsWindowVisible(cache.edit)) cache = { top, edit: findHnEdit(windows) }
  if (!cache.edit) return ''
  const t = text(cache.edit)
  if (t === null) return null
  const hn = t.trim()
  if (HN_VALUE.test(hn)) return hn
  cache.edit = null // box cleared or reused; rescan next tick
  return ''
}

// --- Drug-name box (การสั่งยา) ---
// Locator: a visible TcxLabel "ชื่อยา/ค่าบริการ", then the edit right under it (same panel, left-aligned).
// HOSxP fills the box with "<name> <strength> <units>" once a drug is picked.
const DRUG_LABEL = /^\s*ชื่อยา\s*\/\s*ค่าบริการ\s*$/
function editBelow(label) {
  const parent = GetParent(label), lr = rect(label)
  return children(parent, (h) => GetParent(h) === parent && IsWindowVisible(h) && /Edit$/.test(className(h)))
    .map((h) => ({ h, r: rect(h) }))
    .filter(({ r }) => r.top >= lr.bottom - 2 && r.top - lr.bottom <= 40 && Math.abs(r.left - lr.left) <= 20)
    .sort((a, b) => a.r.top - b.r.top)[0]?.h
}
let drugCache = { top: 0, edit: null }
// Text of the drug-name box on the top HOSxP window; '' when there is none, null when HOSxP is busy.
// ponytail: rescans the window each tick while no box is found; cache per window like readHn if it shows up in profiles
export function readDrugBox() {
  const windows = hosxpWindows()
  const top = windows[0] ?? 0
  if (top !== drugCache.top || !drugCache.edit || !IsWindowVisible(drugCache.edit)) {
    let edit = null
    for (const w of windows) {
      const label = children(w, (h) => IsWindowVisible(h) && className(h) === 'TcxLabel' && DRUG_LABEL.test(text(h) ?? ''))[0]
      if (label && (edit = editBelow(label))) break
    }
    drugCache = { top, edit }
  }
  return drugCache.edit ? text(drugCache.edit) : ''
}

// --- Mouse actions -------------------------------------------------------------------------------
// A global low-level mouse hook (no injection into HOSxP), running in its own worker thread
// (mousehook.js); here we only turn click points into HOSxP controls.
// Ribbon items and grid cells are drawn by DevExpress (not windows): only their host window is seen.
const POINT = koffi.struct('HX_POINT', { x: 'int32', y: 'int32' })
const WindowFromPoint = u.func('intptr __stdcall WindowFromPoint(HX_POINT pt)')
const GetAncestor = u.func('intptr __stdcall GetAncestor(intptr h, uint32 flags)')
const GetDesktopWindow = u.func('intptr __stdcall GetDesktopWindow()')
const PostThreadMessage = u.func('bool __stdcall PostThreadMessageW(uint32 tid, uint32 msg, uintptr wp, intptr lp)')
const GA_PARENT = 1, WM_QUIT = 0x12
const CHECK_CLASS = /CheckBox|RadioButton/ // TcxCheckBox, TcxDBCheckBox, TLMDCheckBox, radio buttons
// DevExpress editors host an inner native edit (TcxCustomInnerTextEdit, TcxCustomComboBoxInnerEdit, ...);
// the click lands on it, but the meaningful control is its parent (TcxTextEdit, TcxComboBox, ...).
const INNER_CLASS = /^Tcx.*Inner/
const MAX_CAPTION = 40

// --- Checkbox state from pixels ---
// DevExpress checkboxes answer 0 to BM_GETCHECK and expose no CHECKED flag over MSAA, so the state is
// read from how the control paints itself (PrintWindow works even when HOSxP is covered): locate the
// glyph box from its dark border, then look inside it. An empty box is flat (even if tinted on
// hover/press); a check mark makes it high-contrast. One read after the click, no before/after race.
const g = koffi.load('gdi32.dll')
const BIH = koffi.struct('HX_BIH', { size: 'uint32', w: 'int32', h: 'int32', planes: 'uint16', bpp: 'uint16', comp: 'uint32', img: 'uint32', xp: 'int32', yp: 'int32', used: 'uint32', imp: 'uint32' })
const PrintWindow = u.func('bool __stdcall PrintWindow(intptr h, intptr hdc, uint32 flags)')
const GetDC = u.func('intptr __stdcall GetDC(intptr h)')
const ReleaseDC = u.func('int __stdcall ReleaseDC(intptr h, intptr dc)')
const CreateCompatibleDC = g.func('intptr __stdcall CreateCompatibleDC(intptr dc)')
const CreateCompatibleBitmap = g.func('intptr __stdcall CreateCompatibleBitmap(intptr dc, int w, int h)')
const SelectObject = g.func('intptr __stdcall SelectObject(intptr dc, intptr obj)')
const DeleteObject = g.func('bool __stdcall DeleteObject(intptr obj)')
const DeleteDC = g.func('bool __stdcall DeleteDC(intptr dc)')
const GetDIBits = g.func('int __stdcall GetDIBits(intptr dc, intptr bmp, uint32 start, uint32 lines, _Out_ uint8 *bits, HX_BIH *bi, uint32 usage)')
const SendMessageTimeoutN = u.func('SendMessageTimeoutW', 'intptr', ['intptr', 'uint32', 'uintptr', 'intptr', 'uint32', 'uint32', koffi.out(koffi.pointer('uintptr'))])
const WM_NULL = 0

// true = ticked, false = empty, null = can't tell (HOSxP not responding, nothing painted, no glyph found).
// PrintWindow has no timeout, so ping first rather than block the main thread on a hung HOSxP.
export function isChecked(h) {
  if (!SendMessageTimeoutN(h, WM_NULL, 0, 0, SMTO_ABORTIFHUNG, 200, [0])) return null
  const r = rect(h)
  const w = r.right - r.left, ht = r.bottom - r.top
  if (w <= 0 || ht <= 0) return null
  const screen = GetDC(0), mem = CreateCompatibleDC(screen), bmp = CreateCompatibleBitmap(screen, w, ht)
  const old = SelectObject(mem, bmp)
  const ok = PrintWindow(h, mem, 0)
  SelectObject(mem, old)
  const bits = Buffer.alloc(w * ht * 4)
  GetDIBits(mem, bmp, 0, ht, bits, { size: 40, w, h: -ht, planes: 1, bpp: 32, comp: 0, img: 0, xp: 0, yp: 0, used: 0, imp: 0 }, 0)
  DeleteObject(bmp)
  DeleteDC(mem)
  ReleaseDC(0, screen)
  if (!ok) return null

  const gw = Math.min(w, Math.round(ht * 0.6)) // glyph column only, not the caption
  const lumAt = (x, y) => {
    const o = (y * w + x) * 4, b = bits[o], gr = bits[o + 1], rd = bits[o + 2]
    return b || gr || rd ? 0.114 * b + 0.587 * gr + 0.299 * rd : null // pure black = unpainted
  }
  const all = []
  for (let y = 0; y < ht; y++) for (let x = 0; x < gw; x++) lumAt(x, y) !== null && all.push(lumAt(x, y))
  if (!all.length) return null
  const median = all.sort((a, b) => a - b)[all.length >> 1]

  // glyph box = bounding box of the strokes clearly darker than the background
  let x0 = gw, y0 = ht, x1 = -1, y1 = -1
  for (let y = 0; y < ht; y++)
    for (let x = 0; x < gw; x++) {
      const l = lumAt(x, y)
      if (l !== null && l < median - 40) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y))
    }
  if (x1 - x0 < 6 || y1 - y0 < 6) return null

  // inside the box (shrunk 30% per side, clear of its borders): flat = empty, contrasty = check mark
  const ix = Math.ceil((x1 - x0) * 0.3), iy = Math.ceil((y1 - y0) * 0.3)
  let lo = 255, hi = 0
  for (let y = y0 + iy; y <= y1 - iy; y++)
    for (let x = x0 + ix; x <= x1 - ix; x++) {
      const l = lumAt(x, y)
      if (l !== null) (lo = Math.min(lo, l)), (hi = Math.max(hi, l))
    }
  return hi - lo > 60
}

// The form a control lives on: an MDI child of the main window, or a top-level dialog.
// GetAncestor(GA_PARENT), not GetParent, which returns the *owner* for top-level dialogs.
function formWindow(h) {
  const desktop = GetDesktopWindow()
  for (;;) {
    const p = GetAncestor(h, GA_PARENT)
    if (!p || p === desktop || className(p) === 'MDIClient') return h
    h = p
  }
}
function formOf(h) {
  const cls = className(formWindow(h))
  return cls === '#32770' ? 'MessageBox' : cls.replace(/^T/, '') // #32770 = standard Windows dialog class
}

const COMBO_CLASS = /ComboBox/ // TcxComboBox, TcxDBComboBox, TcxLookupComboBox, TcxDBLookupComboBox, TComboBox

const tidy = (s) => {
  s = (s ?? '').replace(/&(?!&)/g, '').replace(/\s+/g, ' ').trim() // drop "&" accelerator marks
  return s.length > MAX_CAPTION ? s.slice(0, MAX_CAPTION) + '…' : s
}

// The HOSxP control under a screen point: { h, cls, caption, form }; null if not HOSxP.
// caption is the control's text (a button/checkbox label, an edit's value), "" if it has none.
function controlAt(pt) {
  let h = WindowFromPoint(pt)
  const main = hosxpWindows()[0]
  if (!h || !main || pidOf(h) !== pidOf(main)) return null
  if (INNER_CLASS.test(className(h))) h = GetAncestor(h, GA_PARENT)
  return { h, cls: className(h), caption: tidy(text(h)), form: formOf(h) }
}

// --- Spy (control inspector) ---
const siblings = (parent) => children(parent, (c) => GetParent(c) === parent)

// The label a control is known by: a sibling label on the same row to its left, else right above it.
// (Plain Delphi TLabel is painted, not a window: only windowed labels like TcxLabel are seen.)
function labelFor(h) {
  const r = rect(h), mid = (r.top + r.bottom) / 2
  const labels = siblings(GetParent(h))
    .filter((l) => l !== h && IsWindowVisible(l) && /Label/.test(className(l)))
    .map((l) => ({ l, r: rect(l) }))
  const left = labels.filter((x) => x.r.right <= r.left + 2 && x.r.top <= mid && x.r.bottom >= mid).sort((a, b) => b.r.right - a.r.right)[0]
  const above = labels
    .filter((x) => x.r.bottom <= r.top + 2 && r.top - x.r.bottom <= 40 && x.r.left < r.right && x.r.right > r.left)
    .sort((a, b) => b.r.bottom - a.r.bottom)[0]
  const hit = left ?? above
  return hit ? tidy(text(hit.l)) : ''
}

// Class chain from the form down to the control; [n] = index among same-class siblings when not unique.
function classPath(h, form) {
  const parts = []
  for (let c = h; c && c !== form; c = GetAncestor(c, GA_PARENT)) {
    const cls = className(c), same = siblings(GetParent(c)).filter((s) => className(s) === cls)
    parts.unshift(same.length > 1 ? `${cls}[${same.indexOf(c)}]` : cls)
  }
  return [className(form), ...parts].join(' > ')
}

// Which click opened which window. Windows keeps no such link (only the owner form), so every click
// compares HOSxP's top-level windows before and after it: a window that shows up within OPEN_WAIT_MS
// is credited to that click. form hwnd → { form, cls, caption, path } of the control clicked.
const GetWindow = u.func('intptr __stdcall GetWindow(intptr h, uint32 cmd)')
const IsWindow = u.func('bool __stdcall IsWindow(intptr h)')
const GW_OWNER = 4
const OPEN_POLL_MS = 200, OPEN_WAIT_MS = 3000 // HOSxP often loads data before showing a dialog
const openers = new Map()
function creditNewWindows(before, click) {
  const start = Date.now()
  const timer = setInterval(() => {
    const fresh = hosxpWindows().filter((h) => !before.has(h) && !POPUP_CLASS.test(className(h)))
    for (const h of fresh) openers.set(h, click)
    if (fresh.length || Date.now() - start > OPEN_WAIT_MS) {
      clearInterval(timer)
      for (const h of openers.keys()) if (!IsWindow(h)) openers.delete(h)
    }
  }, OPEN_POLL_MS)
}

// Everything knowable from outside about the window under a screen point (any app, hosxp tells if it's HOSxP).
// The Delphi component name (btnSave...) lives only inside HOSxP's memory: not reachable from here.
export function controlInfo(pt) {
  let h = WindowFromPoint(pt)
  if (!h) return null
  if (INNER_CLASS.test(className(h))) h = GetAncestor(h, GA_PARENT)
  const form = formWindow(h), r = rect(h), main = hosxpWindows()[0], cls = className(h)
  const owner = GetWindow(form, GW_OWNER), by = openers.get(form)
  return {
    owner: owner ? `${className(owner)} ${(text(owner) ?? '').trim()}`.trim() : '',
    openedBy: by ? `${by.caption || '(ไม่มีข้อความ)'} · ${by.cls} บน ${by.form}` : '',
    openedByPath: by?.path ?? '',
    hosxp: !!main && pidOf(h) === pidOf(main),
    form: className(form),
    formTitle: (text(form) ?? '').trim(),
    cls,
    label: /Button|CheckBox/.test(cls) ? '' : labelFor(h), // these carry their own caption; a neighbour's label isn't theirs
    caption: (text(h) ?? '').trim(),
    hwnd: '0x' + h.toString(16).toUpperCase(), // changes every HOSxP start; Delphi's control ID is the same number
    rect: `${r.left},${r.top}  ${r.right - r.left}×${r.bottom - r.top}`,
    path: classPath(h, form),
  }
}

const REPAINT_MS = 150 // let HOSxP repaint/update the control after the click before reading it
const READ_TRIES = 10 // a click often makes HOSxP reload data and stop answering for a while: retry ~1.5s

// Calls read() REPAINT_MS from now, retrying while it returns null; then done(result).
function readSoon(read, done, tries = READ_TRIES) {
  setTimeout(() => {
    const v = read()
    if (v === null && tries > 1) readSoon(read, done, tries - 1)
    else done(v)
  }, REPAINT_MS)
}

// DevExpress dropdown lists are separate top-level popup windows (TcxComboBoxPopupWindow, ...).
const POPUP_CLASS = /Popup/i
const POPUP_POLL_MS = 100
const POPUP_OPEN_WAIT_MS = 1000 // no popup by then: the click didn't open the list
const POPUP_MAX_MS = 5 * 60 * 1000 // stop watching a list left open this long

function popupOpen(pid) {
  let open = false
  EnumWindows((h) => {
    if (IsWindowVisible(h) && pidOf(h) === pid && POPUP_CLASS.test(className(h))) open = true
    return !open
  }, 0)
  return open
}

// After a click on a combobox: wait for its dropdown to open, then to close (the value is committed
// then, whether picked by mouse or by keyboard in the list); read it and call onSelect(value) if changed.
function watchComboClose(combo, onSelect) {
  const pid = pidOf(combo.h), start = Date.now()
  let opened = false
  const timer = setInterval(() => {
    const open = popupOpen(pid), age = Date.now() - start
    if (open) opened = true
    if (open ? age < POPUP_MAX_MS : !opened && age < POPUP_OPEN_WAIT_MS) return
    clearInterval(timer)
    if (!opened) return
    readSoon(
      () => text(combo.h),
      (raw) => {
        const value = tidy(raw)
        if (raw !== null && value !== combo.caption) onSelect(value)
      }
    )
  }, POPUP_POLL_MS)
}

// Reports what the user does in HOSxP with the mouse, as onAction({ action, form, cls, caption, checked }):
//   click  – any control pressed and released (caption = its text)
//   check  – a checkbox clicked; checked = true/false after the click, null if unreadable
//   select – a combobox's dropdown closed with a new value (caption = the new value)
// Keyboard-only interaction (without opening a list by mouse) is not seen.
// Spy: spy(true) arms it; the next left click anywhere is swallowed and reported as onSpy({ x, y }).
// Returns { stop, spy }: stop removes the hook.
export function watchClicks(onAction, onSpy) {
  let pressed = null, before = null, tid = 0
  const armed = new Int32Array(new SharedArrayBuffer(4))
  const worker = new Worker(new URL('./mousehook.js', import.meta.url), { workerData: { spy: armed.buffer } })
  worker.on('message', (m) => {
    if (m.type === 'spy') {
      onSpy({ x: m.x, y: m.y })
    } else if (m.type === 'ready') {
      tid = m.tid
      if (!m.ok) console.error('mouse hook: SetWindowsHookEx failed')
    } else if (m.type === 'down') {
      pressed = controlAt({ x: m.x, y: m.y }) // read the caption on press; the control's action runs on release
      before = pressed && new Set(hosxpWindows())
    } else if (m.type === 'up') {
      const p = pressed
      pressed = null
      const up = p && controlAt({ x: m.x, y: m.y })
      if (p && up?.h === p.h) {
        // released on the control it was pressed on: a click
        const base = { form: p.form, cls: p.cls, caption: p.caption, checked: null }
        creditNewWindows(before, { ...base, path: classPath(p.h, formWindow(p.h)) })
        if (CHECK_CLASS.test(p.cls)) readSoon(() => isChecked(p.h), (checked) => onAction({ ...base, action: 'check', checked }))
        else onAction({ ...base, action: 'click' })
        if (COMBO_CLASS.test(p.cls)) watchComboClose(p, (value) => onAction({ ...base, action: 'select', caption: value }))
      }
    }
  })
  worker.on('error', (e) => console.error('mouse hook worker', e))
  return {
    stop: () => tid && PostThreadMessage(tid, WM_QUIT, 0, 0), // ends the worker's GetMessage loop
    spy: (on) => Atomics.store(armed, 0, on ? 1 : 0),
  }
}
