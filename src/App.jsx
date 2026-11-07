import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronUp, Download, FlaskConical, Pill, Receipt, Settings } from 'lucide-react'
import MonkIcon from './MonkIcon.jsx'
import { thaiDate } from './format.js'

// userSelect none: the bar is a control strip (and dragged around), never selectable text. Modals still are.
const bar = { height: '100vh', display: 'flex', alignItems: 'center', background: '#21252B', color: '#e8e8e8', font: '13px system-ui', userSelect: 'none' }
const btn = { background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }
const badge = { padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.12)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }
const actionStyle = { padding: '0 5px', borderRadius: 3, background: 'rgba(255,255,255,0.15)', fontSize: 11 }
const ncdBadge = { ...badge, background: '#c62828', color: '#fff', fontWeight: 700, letterSpacing: 0.3, cursor: 'help' }
// alert group badges: icon instead of the group name, then how many switched-on rules this patient meets
const groupBadge = { ...badge, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }
const groupOff = { opacity: 0.45 }
const groupHit = { background: '#b45309', color: '#fff', fontWeight: 700 }
const none = { hits: 0, on: 0 }
const DRAG_PX = 4
const labelBtn = { width: 'auto', padding: '0 10px', gap: 5, font: 'inherit' } // bar-btn with icon + text

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [patient, setPatient] = useState({ hn: '' })
  const { hn, name, ncd, vstdate, vsttime } = patient
  useEffect(() => window.bar.onPatient(setPatient), [])
  const [count, setCount] = useState({ rlu: none, rdu: none, claim: none }) // group → { on, total }
  useEffect(() => window.bar.onAlerts(setCount), [])
  const [click, setClick] = useState(null) // last HOSxP action: { action, form, cls, caption, checked }
  useEffect(() => window.bar.onClick(setClick), [])
  const [update, setUpdate] = useState('') // version downloaded and ready to install
  useEffect(() => window.bar.onUpdate(setUpdate), [])
  const drag = useRef(null) // { x, y, on } while the button is held

  const toggle = () => {
    window.bar.setCollapsed(!collapsed)
    setCollapsed(!collapsed)
  }

  if (collapsed)
    return (
      <button
        style={{ ...bar, ...btn, width: '100vw', justifyContent: 'center' }}
        onClick={toggle}
        onMouseEnter={() => window.bar.setHover(true)}
        onMouseLeave={() => window.bar.setHover(false)}
        title="ขยาย"
      >
        {/* drawer-pull handle */}
        <span style={{ width: 28, height: 3, borderRadius: 2, background: '#fff' }} />
      </button>
    )

  // Hold and drag anywhere on the bar to move it to another display. It only counts as a drag once the
  // pointer moves past DRAG_PX while held, so a plain click on a button or badge still clicks.
  const endDrag = () => {
    if (drag.current?.on) window.bar.drag(false)
    drag.current = null
  }
  const dragHandlers = {
    onPointerDown: (e) => e.button === 0 && (drag.current = { x: e.clientX, y: e.clientY, on: false }),
    onPointerMove: (e) => {
      const d = drag.current
      if (!d || d.on || Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX) return
      d.on = true
      e.currentTarget.setPointerCapture(e.pointerId) // keep getting pointerup once the cursor leaves the bar
      window.bar.drag(true)
    },
    onPointerUp: endDrag,
    onLostPointerCapture: endDrag,
  }

  return (
    <div style={{ ...bar, paddingLeft: 10, touchAction: 'none' }} {...dragHandlers}>
      <span style={{ display: 'flex' }}>
        <MonkIcon size={24} />
      </span>
      {hn && (
        <span style={{ marginLeft: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>
            HN <b style={{ fontVariantNumeric: 'tabular-nums' }}>{hn}</b>
          </span>
          {name && <span>{name}</span>}
          {ncd && Object.keys(ncd).length > 0 && (
            <span style={ncdBadge} title={Object.entries(ncd).map(([k, src]) => `${k}: ${src.join(', ')}`).join('\n')}>
              {Object.keys(ncd).join('/')}
            </span>
          )}
          {vstdate && (
            <span style={badge} title="Visit ล่าสุด">
              {thaiDate(vstdate)} {vsttime.slice(0, 5)}
            </span>
          )}
          {[
            ['rlu', FlaskConical],
            ['rdu', Pill],
            ['claim', Receipt],
          ].map(([key, Icon]) => {
            const { hits, on } = count[key]
            const tip = `${key.toUpperCase()}: เข้าข่าย ${hits} ข้อ จากกฎที่ตั้งเตือน ${on} ข้อ (คลิกเพื่อดู)`
            return (
              <button key={key} style={{ ...btn, ...groupBadge, ...(hits ? groupHit : groupOff) }} onClick={() => window.bar.openHits(key)} title={tip}>
                <Icon size={14} /> {hits}
              </button>
            )
          })}
        </span>
      )}
      {/* Windows order: app actions first, window control (minimize) at the far right */}
      <span style={{ marginLeft: 'auto', marginRight: 8, fontSize: 12, opacity: 0.85, whiteSpace: 'nowrap' }} title="control ล่าสุดที่คลิกใน HOSxP">
        {click && (
          <>
            <span style={{ opacity: 0.7 }}>{click.form} ›</span> <span style={actionStyle}>{click.action}</span> {click.cls}
            {click.caption && <b> "{click.caption}"</b>}
            {click.action === 'check' && click.checked !== null && (click.checked ? ' ☑' : ' ☐')}
          </>
        )}
      </span>
      <button
        className="bar-btn"
        style={labelBtn}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          window.bar.alertMenu(Math.round(r.left), Math.round(r.bottom))
        }}
        title="ตั้งเตือน RLU / RDU / Claim"
      >
        <Bell size={15} /> ตั้งเตือน
      </button>
      <button className="bar-btn" style={labelBtn} onClick={() => window.bar.openSettings()} title="ตั้งค่าการเชื่อมต่อ HOSxP">
        <Settings size={15} /> เชื่อมต่อ
      </button>
      <button className="bar-btn" onClick={toggle} title="ย่อ">
        <ChevronUp size={18} />
      </button>
      {update && (
        <button className="bar-btn" style={{ color: '#4caf50' }} onClick={() => window.bar.installUpdate()} title={`อัปเดตเป็น v${update} แล้วเปิดใหม่`}>
          <Download size={16} />
        </button>
      )}
    </div>
  )
}
