// Windows AppBar: reserves a strip of the screen edge so other windows' work area shrinks.
import koffi from 'koffi'
import { screen } from 'electron'

const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
const APPBARDATA = koffi.struct('APPBARDATA', {
  cbSize: 'uint32',
  hWnd: 'intptr',
  uCallbackMessage: 'uint32',
  uEdge: 'uint32',
  rc: RECT,
  lParam: 'intptr',
})
const SHAppBarMessage = koffi
  .load('shell32.dll')
  .func('uintptr_t __stdcall SHAppBarMessage(uint32_t msg, _Inout_ APPBARDATA *data)')
const SetWindowPos = koffi
  .load('user32.dll')
  .func('bool __stdcall SetWindowPos(intptr hWnd, intptr after, int x, int y, int cx, int cy, uint32 flags)')

const ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3, ABE_TOP = 1
const SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_NOSENDCHANGING = 0x400

const hwnd = (win) => win.getNativeWindowHandle().readBigInt64LE(0)

function data(win) {
  return {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: hwnd(win),
    uCallbackMessage: 0,
    uEdge: ABE_TOP,
    rc: { left: 0, top: 0, right: 0, bottom: 0 },
    lParam: 0n,
  }
}

// Primary display bounds and scale in physical pixels.
export function primaryScreen() {
  const d = screen.getPrimaryDisplay()
  return { ...screen.dipToScreenRect(null, d.bounds), scale: d.scaleFactor }
}

// Places the window in physical pixels. SWP_NOSENDCHANGING skips WM_WINDOWPOSCHANGING, where Windows
// would otherwise clamp us to its minimum track height (~38 DIP), which win.setBounds/minHeight can't beat.
export function setRect(win, { x, y, width, height }) {
  SetWindowPos(hwnd(win), 0n, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSENDCHANGING)
}

// Registers the reserved strip and returns its rect in physical pixels.
export function dockTop(win, heightDip) {
  const { x, y, width, scale } = primaryScreen()
  const h = Math.round(heightDip * scale)

  const abd = data(win)
  SHAppBarMessage(ABM_NEW, abd)
  abd.rc = { left: x, top: y, right: x + width, bottom: y + h }
  SHAppBarMessage(ABM_QUERYPOS, abd) // shell may move us below another top appbar
  abd.rc.bottom = abd.rc.top + h
  SHAppBarMessage(ABM_SETPOS, abd)

  const { left, top, right, bottom } = abd.rc
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function undock(win) {
  SHAppBarMessage(ABM_REMOVE, data(win))
}
