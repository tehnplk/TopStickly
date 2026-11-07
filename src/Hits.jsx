import { useEffect, useState } from 'react'
import { ShieldPlus, TriangleAlert } from 'lucide-react'
import { thaiDate } from './format.js'
import Modal, { tbl as s } from './Modal.jsx'

const AMBER = '#b45309'
const GREEN = '#2e7d32'
// SQL column aliases → table headers
const HEAD = { lab: 'Lab', order_date: 'สั่งล่าสุด', order_time: 'เวลา', days_ago: 'ผ่านมา (วัน)', result: 'ผล', name: 'ชื่อยา', strength: 'ความแรง', qty: 'จำนวน', units: 'หน่วย', howto: 'วิธีใช้', dx: 'ICD-10', basis: 'เข้าเกณฑ์', last_done: 'ทำล่าสุด', due: 'ต้องทำภายใน' }
// patient info lines under the title (11px)
const line2 = { display: 'block', fontSize: 11, fontWeight: 400, color: '#666' }
const chip = { padding: '0 6px', borderRadius: 8, background: '#fdecea', color: '#b71c1c' }
const chipOff = { ...chip, background: '#eee', color: '#777' }
const cell = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? thaiDate(v) : v ?? '')

// RLU: one line per lab not to order, the reasons being the rules that flag it with that lab's latest order
// (rows come newest first).
function RluTable({ hits }) {
  const labs = new Map()
  for (const h of hits)
    for (const r of h.rows) {
      const why = labs.get(r.lab) ?? labs.set(r.lab, new Map()).get(r.lab)
      if (!why.has(h.id))
        why.set(h.id, `${h.name} · สั่งล่าสุด ${thaiDate(r.order_date)} (${r.days_ago} วันก่อน)${r.result ? ` ผล ${r.result}` : ''}`)
    }
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={{ ...s.th, width: 36, textAlign: 'center' }}>ลำดับ</th>
          <th style={{ ...s.th, width: 160 }}>ชื่อ LAB</th>
          <th style={s.th}>เหตุผล</th>
        </tr>
      </thead>
      <tbody>
        {[...labs].map(([lab, why], i) => (
          <tr key={lab}>
            <td style={{ ...s.td, textAlign: 'center' }}>{i + 1}</td>
            <td style={{ ...s.td, fontWeight: 600 }}>{lab}</td>
            <td style={s.td}>
              {[...why.values()].map((w) => (
                <div key={w}>{w}</div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

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
  // PPFS hits are services to offer, not warnings
  const pp = key === 'ppfs'
  const [Icon, color] = pp ? [ShieldPlus, GREEN] : [TriangleAlert, AMBER]
  const rlu = key === 'rlu'

  return (
    <Modal
      title={
        <span>
          {[p.hn, p.name, p.sex, p.age].filter(Boolean).join(' - ')}
          <span style={line2}>{[p.typeArea, p.pttype].filter(Boolean).join(' | ')}</span>
          <span style={{ ...line2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 2 }}>
            โรคประจำตัว
            {p.chronic?.length
              ? p.chronic.map((c, i) => (
                  // still treated = red; died / referred / lost = grey
                  <span key={i} style={c.status === 'ยังรักษาอยู่' ? chip : chipOff}>
                    {c.name}
                    {c.status && ` · ${c.status}`}
                  </span>
                ))
              : ' -'}
          </span>
        </span>
      }
    >
      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{rlu ? 'LAB ไม่ควรสั่งใน Visit นี้ ตามเกณฑ์ RLU' : group.title}</p>
      {hits.length === 0 && <p style={s.note}>{pp ? 'ไม่มีบริการ PPFS ที่ให้ได้วันนี้' : 'ไม่เข้าข่ายกฎที่ตั้งเตือนไว้'}</p>}
      {rlu && hits.length > 0 && <RluTable hits={hits} />}
      {!rlu && hits.map((h, n) => {
        const cols = Object.keys(h.rows[0])
        return (
          <div key={h.id} style={{ marginTop: n ? 10 : 0 }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 5, color, fontWeight: 600, margin: '0 0 4px' }}>
              <Icon size={13} /> {h.name}{!pp && ` (${h.rows.length} รายการ)`} <span style={{ color: '#666', fontWeight: 400 }}>· {criteria[h.id]}</span>
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
