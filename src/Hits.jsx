import { useEffect, useState } from 'react'
import { ClipboardList, ShieldPlus, TriangleAlert } from 'lucide-react'
import { thaiDate } from './format.js'
import Modal, { tbl as s } from './Modal.jsx'

const AMBER = '#b45309'
const GREEN = '#2e7d32'
const BLUE = '#2a5f9e'
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

// PPFS / PPB: one numbered card per claimable item, a thick rule between cards so each item stands apart.
// Fields (basis, last_done, due...) as "header: value" pairs instead of a one-row table per item.
// The fee at the end of a criteria text ("... - 60 บาท", "... · 100 บาท"), shown as a pill instead.
const FEE = /\s*[-·]\s*(\d[\d,]*)\s*บาท\s*$/
// 13px: the modal's larger size (two sizes only), so the fee stands out from the 11px content
const feePill = { marginLeft: 'auto', flex: 'none', padding: '3px 12px', borderRadius: 12, background: '#15803d', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }

const feeOf = (text) => Number((text ?? '').match(FEE)?.[1].replace(/,/g, '') ?? 0)

function PpList({ hits, criteria, color }) {
  const total = hits.reduce((sum, h) => sum + feeOf(criteria[h.id]), 0)
  return (
    <>
      {hits.map((h, n) => {
    const text = criteria[h.id] ?? ''
    const fee = text.match(FEE)?.[1]
    return (
    <div key={h.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: n ? '2px solid #d0d7de' : 0 }}>
      <span style={{ flex: 'none', width: 22, height: 22, borderRadius: 11, background: color, color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {n + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0, borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 'none', color, fontWeight: 700 }}>{h.name}</span>
          {text && <span style={{ flex: 1, minWidth: 0, color: '#666' }}>· {text.replace(FEE, '')}</span>}
          {fee && <span style={feePill}>฿ {fee} บาท</span>}
        </div>
        {h.rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 2, marginTop: 4 }}>
            {Object.entries(row).map(([c, v]) => (
              <span key={c}>
                <span style={{ color: '#666' }}>{HEAD[c] ?? c}:</span> <b style={{ fontWeight: 600 }}>{cell(v) || '—'}</b>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
    )
      })}
      {/* footer: what all the items above earn together */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 10, borderTop: '2px solid #15803d', fontSize: 13, fontWeight: 700 }}>
          รวม {hits.length} รายการ
          <span style={{ ...feePill, marginLeft: 0 }}>฿ {total.toLocaleString()} บาท</span>
        </div>
      )}
    </>
  )
}

// Alert button click: the rules (switched on) this patient meets in one group, with the rows behind each.
export default function Hits() {
  const key = new URLSearchParams(location.hash.split('?')[1]).get('group')
  const [data, setData] = useState(null)
  useEffect(() => {
    window.bar.getAlerts(key).then(setData)
  }, [])
  if (!data) return null
  const { patient: p, group, hits } = data
  const criteria = Object.fromEntries(group.rules.map((r) => [r.id, r.criteria]))
  // PPFS / PPB hits are work to do (services to offer / workload to record), not warnings
  const pp = key === 'ppfs' || key === 'ppb'
  const [Icon, color] = { ppfs: [ShieldPlus, GREEN], ppb: [ClipboardList, BLUE] }[key] ?? [TriangleAlert, AMBER]
  const empty = { ppfs: 'ไม่มีบริการ PPFS ที่ให้ได้วันนี้', ppb: 'บันทึกผลงาน PPB ครบแล้วในปีงบนี้' }[key] ?? 'ไม่เข้าข่ายกฎที่ตั้งเตือนไว้'
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
      {hits.length === 0 && <p style={s.note}>{empty}</p>}
      {rlu && hits.length > 0 && <RluTable hits={hits} />}
      {pp && <PpList hits={hits} criteria={criteria} color={color} />}
      {!rlu && !pp && hits.map((h, n) => {
        const cols = Object.keys(h.rows[0])
        return (
          <div key={h.id} style={{ marginTop: n ? 10 : 0 }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 5, color, fontWeight: 600, margin: '0 0 4px' }}>
              <Icon size={13} /> {h.name} ({h.rows.length} รายการ) <span style={{ color: '#666', fontWeight: 400 }}>· {criteria[h.id]}</span>
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
