import { useEffect, useState } from 'react'
import { ChevronUp, Settings } from 'lucide-react'
import PillIcon from './PillIcon.jsx'
import MonkIcon from './MonkIcon.jsx'
import { thaiDate } from './format.js'

const bar = { height: '100vh', display: 'flex', alignItems: 'center', background: '#21252B', color: '#e8e8e8', font: '13px system-ui' }
const btn = { background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }
const badge = { padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.12)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }
const actionStyle = { padding: '0 5px', borderRadius: 3, background: 'rgba(255,255,255,0.15)', fontSize: 11 }
const ncdBadge ={ ...badge, background: '#c62828', color: '#fff', fontWeight: 700, letterSpacing: 0.3, cursor: 'help' }

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [patient, setPatient] = useState({ hn: '' })
  const { hn, name, ncd, vn, vstdate, vsttime } = patient
  useEffect(() => window.bar.onPatient(setPatient), [])
  const [click, setClick] = useState(null) // last HOSxP action: { action, form, cls, caption, checked }
  useEffect(() => window.bar.onClick(setClick), [])

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

  return (
    <div style={{ ...bar, paddingLeft: 10 }}>
      <span title="TopStickly" style={{ display: 'flex' }}>
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
          {vn && (
            <button className="bar-btn" style={{ width: 30 }} onClick={() => window.bar.openDrugs(patient)} title="ดูยา NSAID ใน visit นี้">
              <PillIcon size={22} />
            </button>
          )}
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
      <button className="bar-btn" onClick={() => window.bar.openSettings()} title="ตั้งค่า">
        <Settings size={16} />
      </button>
      <button className="bar-btn" onClick={toggle} title="ย่อ">
        <ChevronUp size={18} />
      </button>
    </div>
  )
}
