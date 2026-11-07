import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { thaiDate } from './format.js'
import Modal, { tbl as s } from './Modal.jsx'

const AMBER = '#b45309'
// SQL column aliases → table headers
const HEAD = { lab: 'Lab', order_date: 'สั่งล่าสุด', order_time: 'เวลา', days_ago: 'ผ่านมา (วัน)', result: 'ผล', name: 'ชื่อยา', strength: 'ความแรง', qty: 'จำนวน', units: 'หน่วย', howto: 'วิธีใช้', dx: 'ICD-10' }
const cell = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? thaiDate(v) : v ?? '')

// Badge click: the rules (switched on) this patient meets in one group, with the rows behind each.
export default function Hits() {
  const key = new URLSearchParams(location.hash.split('?')[1]).get('group')
  const [data, setData] = useState(null)
  useEffect(() => {
    window.bar.getAlerts(key).then(setData)
  }, [])
  if (!data) return null
  const { patient: p, group, hits } = data
  const criteria = Object.fromEntries(group.rules.map((r) => [r.id, r.criteria]))

  return (
    <Modal
      title={group.title}
      extra={
        <>
          <span>
            HN <b>{p.hn}</b> {p.name}
          </span>
          {p.vstdate && (
            <span style={{ color: '#666' }}>
              Visit {thaiDate(p.vstdate)} {p.vsttime.slice(0, 5)}
            </span>
          )}
        </>
      }
    >
      {hits.length === 0 && <p style={s.note}>ไม่เข้าข่ายกฎที่ตั้งเตือนไว้</p>}
      {hits.map((h, n) => {
        const cols = Object.keys(h.rows[0])
        return (
          <div key={h.id} style={{ marginTop: n ? 10 : 0 }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 5, color: AMBER, fontWeight: 600, margin: '0 0 4px' }}>
              <TriangleAlert size={13} /> {h.name} ({h.rows.length} รายการ) <span style={{ color: '#666', fontWeight: 400 }}>· {criteria[h.id]}</span>
            </p>
            <table style={s.table}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c} style={{ ...s.th, position: 'static' }}>
                      {HEAD[c] ?? c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h.rows.map((row, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c} style={s.td}>
                        {cell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </Modal>
  )
}
