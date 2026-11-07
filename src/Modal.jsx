import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// The one modal every popup window uses (frameless: no title bar). It brings, so pages don't redo them:
//  - row 1: the X alone, 8px from the window's top/right edges and 8px above the title; Esc closes too
//  - row 2: the title (13px) + optional header items; the whole header drags the window
//  - content (11px), padding 15px left/right, 30px bottom; the content scrolls under the header
//  - the window shrinks/grows to its content (up to 85% of the screen): no empty space
// Two font sizes only: 13px header and buttons, 11px everything else.
const GAP = 8, X_SIZE = 32
const s = {
  page: { font: '11px/1.4 system-ui', color: '#222', background: '#fff', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
  top: { flex: 'none', padding: '0 15px 10px', borderBottom: '1px solid #eee', WebkitAppRegion: 'drag' },
  xRow: { height: GAP + X_SIZE + GAP },
  x: { position: 'fixed', top: GAP, right: GAP, width: X_SIZE, height: X_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc', borderRadius: 6, background: '#f2f2f2', color: '#222', cursor: 'pointer', zIndex: 10, WebkitAppRegion: 'no-drag' },
  head: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 },
  title: { margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 },
  body: { flex: 1, overflow: 'auto', padding: '10px 15px 30px' },
}

export default function Modal({ title, extra, color, border = '#bbb', children }) {
  const head = useRef(null)
  const body = useRef(null)
  const content = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && window.close()
    addEventListener('keydown', onKey)
    // measure the content, not the body: the body stretches to the window and would never let it shrink
    const ro = new ResizeObserver(() => {
      const { paddingTop, paddingBottom } = getComputedStyle(body.current)
      const h = head.current.offsetHeight + content.current.offsetHeight + parseFloat(paddingTop) + parseFloat(paddingBottom) + 2 // + page border
      window.bar.fit(Math.min(h, screen.availHeight * 0.85))
    })
    ro.observe(head.current)
    ro.observe(content.current)
    return () => {
      removeEventListener('keydown', onKey)
      ro.disconnect()
    }
  }, [])

  return (
    <div style={{ ...s.page, border: `1px solid ${border}` }}>
      <div ref={head} style={s.top}>
        <div style={s.xRow}>
          <button className="close-btn" style={s.x} onClick={() => window.close()} title="ปิด (Esc)" aria-label="ปิด">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div style={s.head}>
          <h3 style={{ ...s.title, color }}>{title}</h3>
          {extra}
        </div>
      </div>
      <div ref={body} style={s.body}>
        {/* flow-root keeps the children's margins inside, so the fit measures them */}
        <div ref={content} style={{ display: 'flow-root' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// Accept/reject buttons: big, easy to hit, leading icon. `solid` = filled with `color`, else outlined.
export function ModalButton({ icon: Icon, color, solid, style, children, ...rest }) {
  const look = solid ? { background: color, color: '#fff' } : { background: '#fff', color }
  return (
    <button
      style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 24px', font: 'inherit', fontSize: 13, fontWeight: 600, borderRadius: 6, border: `1px solid ${color}`, cursor: 'pointer', ...look, ...style }}
      {...rest}
    >
      <Icon size={16} strokeWidth={2.25} /> {children}
    </button>
  )
}

// Table look shared by modals that list rows. th sticks under the header while the body scrolls
// (top -10px: the body's 10px top padding).
export const tbl = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontWeight: 600, color: '#555', padding: '6px 8px', borderBottom: '1px solid #ddd', background: '#fafafa', whiteSpace: 'nowrap', position: 'sticky', top: -10 },
  td: { padding: '5px 8px', borderBottom: '1px solid #eee', verticalAlign: 'middle' },
  note: { color: '#777', padding: '14px 0', margin: 0, textAlign: 'center' },
}
