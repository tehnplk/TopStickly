import { TriangleAlert, X } from 'lucide-react'
import { thaiDate } from './format.js'

const AMBER = '#b45309'
const s = {
  // frameless window: the page is the drag handle, buttons opt out
  page: { font: '14px system-ui', padding: '18px 22px', color: '#222', background: '#fff', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${AMBER}`, WebkitAppRegion: 'drag', position: 'relative' },
  close: { position: 'absolute', top: 0, right: 0, width: 40, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, background: 'none', color: '#555', cursor: 'pointer', WebkitAppRegion: 'no-drag' },
  head: { display: 'flex', alignItems: 'center', gap: 10, color: AMBER, fontSize: 16, fontWeight: 700, margin: '0 0 6px' },
  muted: { color: '#666' },
  btn: { marginTop: 'auto', alignSelf: 'flex-end', padding: '8px 22px', font: 'inherit', borderRadius: 4, border: 0, background: AMBER, color: '#fff', cursor: 'pointer', WebkitAppRegion: 'no-drag' },
}

// Shown when a lab checkbox is clicked for a patient who already had that lab within the last year.
export default function LabWarn() {
  const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1]))
  return (
    <div style={s.page}>
      <button className="close-btn" style={s.close} onClick={() => window.close()} title="ปิด" aria-label="ปิด">
        <X size={18} />
      </button>
      <p style={s.head}>
        <TriangleAlert size={22} /> {q.lab} เคยสั่งแล้ว ยังไม่ครบ 1 ปี
      </p>
      <div>
        สั่งครั้งล่าสุด <b>{thaiDate(q.order_date)}</b> {q.order_time.slice(0, 5)} <span style={s.muted}>({q.days_ago} วันก่อน)</span>
      </div>
      <div>
        ผล: <b>{q.result || <span style={s.muted}>ยังไม่มีผล</span>}</b>
      </div>
      <div style={s.muted}>
        HN {q.hn} {q.patient}
      </div>
      <button style={s.btn} onClick={() => window.close()} autoFocus>
        รับทราบ
      </button>
    </div>
  )
}
