// Worker thread owning the global low-level mouse hook. It must live on its own thread with its own
// message loop: Windows silently removes an LL hook whose thread doesn't answer within ~300ms, and the
// main thread is regularly blocked on (timed) SendMessage calls to HOSxP.
// Posts { down|up, x, y } for left-button events; stops on WM_QUIT (sent via PostThreadMessage).
// Spy: while spy[0] = 1 the next left click is swallowed (the app under it never gets it) and posted
// as { spy, x, y }. A shared flag, since this thread sits in GetMessage and never reads parentPort.
import { parentPort, workerData } from 'node:worker_threads'
import koffi from 'koffi'

const u = koffi.load('user32.dll')
const k = koffi.load('kernel32.dll')
const POINT = koffi.struct('MH_POINT', { x: 'int32', y: 'int32' })
const MSLL = koffi.struct('MH_MSLL', { pt: POINT, mouseData: 'uint32', flags: 'uint32', time: 'uint32', extra: 'uintptr' })
const MSG = koffi.struct('MH_MSG', { hwnd: 'intptr', message: 'uint32', wParam: 'uintptr', lParam: 'intptr', time: 'uint32', pt: POINT, priv: 'uint32' })
const HookProc = koffi.proto('intptr __stdcall MH_HookProc(int code, uintptr wParam, void *lParam)')
const SetWindowsHookEx = u.func('intptr __stdcall SetWindowsHookExW(int id, MH_HookProc *fn, intptr hmod, uint32 tid)')
const CallNextHookEx = u.func('intptr __stdcall CallNextHookEx(intptr hhk, int code, uintptr wParam, void *lParam)')
const UnhookWindowsHookEx = u.func('bool __stdcall UnhookWindowsHookEx(intptr hhk)')
const GetMessage = u.func('int __stdcall GetMessageW(_Out_ MH_MSG *msg, intptr hwnd, uint32 min, uint32 max)')
const GetModuleHandle = k.func('intptr __stdcall GetModuleHandleW(void *name)')
const GetCurrentThreadId = k.func('uint32 __stdcall GetCurrentThreadId()')

const WH_MOUSE_LL = 14, WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202
const spy = new Int32Array(workerData.spy)

const cb = koffi.register((code, wParam, lParam) => {
  if (code >= 0 && (wParam === WM_LBUTTONDOWN || wParam === WM_LBUTTONUP)) {
    const { pt } = koffi.decode(lParam, MSLL)
    if (Atomics.load(spy, 0)) {
      if (wParam === WM_LBUTTONUP) {
        Atomics.store(spy, 0, 0)
        parentPort.postMessage({ type: 'spy', x: pt.x, y: pt.y })
      }
      return 1 // swallowed
    }
    parentPort.postMessage({ type: wParam === WM_LBUTTONDOWN ? 'down' : 'up', x: pt.x, y: pt.y })
  }
  return CallNextHookEx(0, code, wParam, lParam)
}, koffi.pointer(HookProc))

const hook = SetWindowsHookEx(WH_MOUSE_LL, cb, GetModuleHandle(null), 0)
parentPort.postMessage({ type: 'ready', tid: GetCurrentThreadId(), ok: !!hook })

const msg = {}
while (GetMessage(msg, 0, 0, 0) > 0); // hook callbacks run inside this loop; 0 = WM_QUIT
UnhookWindowsHookEx(hook)
koffi.unregister(cb)
