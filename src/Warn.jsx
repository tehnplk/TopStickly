import { useEffect, useRef } from 'react'
import { FlaskConical, Pill, TriangleAlert, X } from 'lucide-react'
import { thaiDate } from './format.js'

const AMBER = '#b45309'
const s = {
  // frameless window: the page is the drag handle, buttons opt out
  page: { font: '14px system-ui', padding: '18px 22px', color: '#222', background: '#fff', minHeight: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${AMBER}`, WebkitAppRegion: 'drag', position: 'relative' },
  close: { position: 'absolute', top: 0, right: 0, width: 40, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, background: 'none', color: '#555', cursor: 'pointer', WebkitAppRegion: 'no-drag' },
  head: { display: 'flex', alignItems: 'center', gap: 10, color: AMBER, fontSize: 16, fontWeight: 700, margin: '0 0 4px', paddingRight: 28 },
  item: { display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10, marginBottom: 4, borderBottom: '1px solid #eee' },
  muted: { color: '#666' },
  btn: { marginTop: 'auto', alignSelf: 'flex-end', padding: '8px 22px', font: 'inherit', borderRadius: 4, border: 0, background: AMBER, color: '#fff', cursor: 'pointer', WebkitAppRegion: 'no-drag' },
}
const GROUP = { rlu: ['RLU', FlaskConical], rdu: ['RDU', Pill] }

// One line per row a rule returned: a lab order (RLU), a drug (RDU) or a diagnosis.
function Line({ r }) {
  if (r.lab)
    return (
      <div>
        {r.lab} สั่งครั้งล่าสุด <b>{thaiDate(r.order_date)}</b> {(r.order_time ?? '').slice(0, 5)} <span style={s.muted}>({r.days_ago} วันก่อน)</span> · ผล:{' '}
        <b>{r.result || <span style={s.muted}>ยังไม่มีผล</span>}</b>
      </div>
    )
  if (r.name)
    return (
      <div>
        • <b>{r.name}</b> {r.strength} <span style={s.muted}>{r.howto}</span>
      </div>
    )
  return <div>• ICD-10 {r.dx}</div>
}

// The warning modal: rules this patient just hit (RLU when a flagged lab is ticked, RDU when a rule is hit).
export default function Warn() {
  const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1]))
  const items = JSON.parse(q.items)
  const page = useRef(null)
  useEffect(() => {
    const ro = new ResizeObserver(() => window.bar.fit(page.current.scrollHeight))
    ro.observe(page.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={page} style={s.page}>
      <button className="close-btn" style={s.close} onClick={() => window.close()} title="ปิด" aria-label="ปิด">
        <X size={18} />
      </button>
      {items.map(({ group, rule, rows }) => {
        const [label, Icon] = GROUP[group]
        return (
          <div key={rule} style={s.item}>
            <p style={s.head}>
              <TriangleAlert size={22} /> {rule}
            </p>
            <div style={{ ...s.muted, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <Icon size={13} /> {label}
            </div>
            {rows.map((r, i) => (
              <Line key={i} r={r} />
            ))}
          </div>
        )
      })}
      <div style={s.muted}>
        HN {q.hn} {q.patient}
      </div>
      <button style={s.btn} onClick={() => window.close()} autoFocus>
        รับทราบ
      </button>
    </div>
  )
}
