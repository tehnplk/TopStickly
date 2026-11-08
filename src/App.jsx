import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronUp, ClipboardList, Crosshair, Download, FlaskConical, Pill, Settings, ShieldPlus } from 'lucide-react'
import MonkIcon from './MonkIcon.jsx'

// userSelect none: the bar is a control strip (and dragged around), never selectable text. Modals still are.
const bar = { height: '100vh', display: 'flex', alignItems: 'center', background: '#21252B', color: '#e8e8e8', font: '13px system-ui', userSelect: 'none' }
const btn = { background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }
const badge = { padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.12)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }
const ncdBadge = { ...badge, background: '#c62828', color: '#fff', fontWeight: 700, letterSpacing: 0.3, cursor: 'help' }
// alert group badges: icon instead of the group name, then how many switched-on rules this patient meets
const groupBadge = { ...badge, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }
const groupOff = { opacity: 0.45 }
const groupHit = { background: '#b45309', color: '#fff', fontWeight: 700 }
const ppHit = { background: '#2e7d32', color: '#fff', fontWeight: 700 }
const ppbHit = { background: '#2a5f9e', color: '#fff', fontWeight: 700 }
const divider = { width: 1, height: 16, background: 'rgba(255,255,255,0.25)' }
const none = { hits: 0, on: 0 }
const DRAG_PX = 4

const appName = { marginLeft: 12, color: '#e0a54a', fontSize: 11, whiteSpace: 'nowrap' }

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [patient, setPatient] = useState({ hn: '' })
  const { hn, name, ncd } = patient
  useEffect(() => window.bar.onPatient(setPatient), [])
  const [count, setCount] = useState({ rlu: none, rdu: none, ppfs: none, ppb: none }) // group → { hits, on }
  useEffect(() => window.bar.onAlerts(setCount), [])
  const [update, setUpdate] = useState('') // version downloaded and ready to install
  useEffect(() => window.bar.onUpdate(setUpdate), [])
  const [spying, setSpying] = useState(false) // Spy armed: the next click is caught
  useEffect(() => window.bar.onSpying(setSpying), [])
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
      {/* waiting for an HN: the app name and version */}
      {!hn && <span style={appName}>สติ-สตางค์ {__APP_VERSION__}</span>}
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
          {[
            ['rlu', FlaskConical],
            ['rdu', Pill],
          ].map(([key, Icon]) => {
            const { hits, on } = count[key]
            const tip = `${key.toUpperCase()}: เข้าข่าย ${hits} ข้อ จากกฎที่ตั้งเตือน ${on} ข้อ (คลิกเพื่อดู)`
            return (
              <button key={key} style={{ ...btn, ...groupBadge, ...(hits ? groupHit : groupOff) }} onClick={() => window.bar.openHits(key)} title={tip}>
                <Icon size={14} /> {hits}
              </button>
            )
          })}
          {/* PPFS = services to offer, not a warning: set apart, green */}
          <span style={divider} />
          <button
            style={{ ...btn, ...groupBadge, ...(count.ppfs.hits ? ppHit : groupOff) }}
            onClick={() => window.bar.openHits('ppfs')}
            title={`PPFS: ให้บริการได้ ${count.ppfs.hits} รายการ จากที่ตั้งไว้ ${count.ppfs.on} รายการ (คลิกเพื่อดู)`}
          >
            <ShieldPlus size={14} /> PPFS {count.ppfs.hits}
          </button>
          {/* PPB = workload not yet recorded this fiscal year (counts toward the 35% share), blue */}
          <button
            style={{ ...btn, ...groupBadge, ...(count.ppb.hits ? ppbHit : groupOff) }}
            onClick={() => window.bar.openHits('ppb')}
            title={`PPB: ผลงานที่ยังไม่ได้บันทึกปีงบนี้ ${count.ppb.hits} รายการ จากที่ตั้งไว้ ${count.ppb.on} รายการ (คลิกเพื่อดู)`}
          >
            <ClipboardList size={14} /> PPB {count.ppb.hits}
          </button>
        </span>
      )}
      {/* Windows order: app actions first, window control (minimize) at the far right */}
      <span style={{ marginLeft: 'auto' }} />
      {spying && <span style={{ ...appName, marginRight: 8 }}>Spy: คลิกที่ control ใน HOSxP · คลิกที่แถบนี้เพื่อยกเลิก</span>}
      <button
        className="bar-btn"
        style={spying ? { color: '#e0a54a' } : undefined}
        onClick={() => window.bar.spy()}
        title="Spy: ดูข้อมูล control ใน HOSxP"
      >
        <Crosshair size={15} />
      </button>
      <button
        className="bar-btn"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          window.bar.alertMenu(Math.round(r.left), Math.round(r.bottom))
        }}
        title="ตั้งเตือน RLU / RDU / PPFS / PPB"
      >
        <Bell size={15} />
      </button>
      <button className="bar-btn" onClick={() => window.bar.openSettings()} title="ตั้งค่าการเชื่อมต่อ HOSxP">
        <Settings size={15} />
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
