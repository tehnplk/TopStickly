import { Fragment, useEffect, useState } from 'react'
import { Bell, BellOff, CircleCheck, CircleMinus, FileText, TriangleAlert } from 'lucide-react'
import { thaiDate } from './format.js'

const AMBER = '#b45309'
const GREEN = '#2e7d32'
const s = {
  page: { font: '14px system-ui', padding: 24, color: '#222', background: '#fff', height: '100vh', boxSizing: 'border-box', overflow: 'auto' },
  head: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 18 },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 22 },
  th: { textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#555', padding: '8px 10px', borderBottom: '2px solid #e0e0e0', background: '#fafafa', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee', verticalAlign: 'top' },
  sqlBtn: { border: 0, background: 'none', padding: 4, cursor: 'pointer', color: '#555', display: 'flex' },
  sql: { margin: 0, padding: 12, background: '#1e1e1e', color: '#d4d4d4', font: '12px Consolas, monospace', whiteSpace: 'pre-wrap', borderRadius: 4 },
  hitHead: { display: 'flex', alignItems: 'center', gap: 8, color: AMBER, fontWeight: 600, margin: '0 0 8px' },
  note: { color: '#777', padding: '24px 0', textAlign: 'center' },
}

// เตือน/ไม่เตือน toggle button: the bell icon is the label
function Toggle({ on, onChange }) {
  const Icon = on ? Bell : BellOff
  return (
    <button
      aria-pressed={on}
      aria-label={on ? 'เตือน' : 'ไม่เตือน'}
      title={on ? 'เตือน (กดเพื่อปิด)' : 'ไม่เตือน (กดเพื่อเปิด)'}
      onClick={() => onChange(!on)}
      style={{ width: 32, height: 28, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${on ? AMBER : '#ccc'}`, background: on ? AMBER : '#fff', color: on ? '#fff' : '#999' }}
    >
      <Icon size={15} />
    </button>
  )
}

// SQL column aliases → table headers
const HEAD = { lab: 'Lab', order_date: 'สั่งล่าสุด', order_time: 'เวลา', days_ago: 'ผ่านมา (วัน)', result: 'ผล', name: 'ชื่อยา', strength: 'ความแรง', qty: 'จำนวน', units: 'หน่วย', howto: 'วิธีใช้', dx: 'ICD-10' }
const cell = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? thaiDate(v) : v ?? '')

// Large modal: every rule in one alert group (ลำดับ / กฎ / Criteria / SQL), then the rows behind each hit.
export default function Rules() {
  const key = new URLSearchParams(location.hash.split('?')[1]).get('group')
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null) // rule id whose SQL is shown
  useEffect(() => {
    window.bar.getAlerts(key).then((d) => {
      document.title = d.group.title
      setData(d)
    })
  }, [])
  if (!data) return null
  const { patient: p, group, hits, off } = data
  const hit = Object.fromEntries(hits.map((h) => [h.id, h]))
  const toggle = async (id, on) => setData({ ...data, ...(await window.bar.setRule(key, id, on)) })

  return (
    <div style={s.page}>
      <div style={s.head}>
        <h3 style={{ margin: 0 }}>{group.title}</h3>
        {p.hn && (
          <span>
            HN <b>{p.hn}</b> {p.name}
          </span>
        )}
        {p.vstdate && (
          <span style={{ color: '#666' }}>
            Visit {thaiDate(p.vstdate)} {p.vsttime.slice(0, 5)}
          </span>
        )}
      </div>

      {group.rules.length === 0 ? (
        <p style={s.note}>ยังไม่มีกฎในกลุ่มนี้</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 50, textAlign: 'center' }}>ลำดับ</th>
              <th style={s.th}>กฎ</th>
              <th style={s.th}>Criteria</th>
              <th style={{ ...s.th, width: 40, textAlign: 'center' }}>SQL</th>
              <th style={{ ...s.th, width: 56, textAlign: 'center' }} title="เตือน/ไม่เตือน">
                <Bell size={15} style={{ verticalAlign: 'middle' }} />
              </th>
            </tr>
          </thead>
          <tbody>
            {group.rules.map((r, i) => {
              const on = !off.includes(r.id)
              const h = on && hit[r.id]
              const Status = !on ? CircleMinus : h ? TriangleAlert : CircleCheck
              return (
                <Fragment key={r.id}>
                  <tr style={h ? { background: '#fff7ed' } : undefined}>
                    <td style={{ ...s.td, textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: h ? AMBER : on ? undefined : '#999' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Status size={16} color={!on ? '#999' : h ? AMBER : GREEN} />
                        {r.name}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: on ? undefined : '#999' }}>{r.criteria}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <button style={s.sqlBtn} onClick={() => setOpen(open === r.id ? null : r.id)} title="ดู SQL">
                        <FileText size={16} />
                      </button>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Toggle on={on} onChange={(v) => toggle(r.id, v)} />
                      </div>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td style={s.td} colSpan={5}>
                        <pre style={s.sql}>{r.sql.trim()}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}

      {hits.map((h) => {
        const cols = Object.keys(h.rows[0])
        return (
          <div key={h.id} style={{ marginBottom: 22 }}>
            <p style={s.hitHead}>
              <TriangleAlert size={16} /> {h.name} ({h.rows.length} รายการ)
            </p>
            <table style={{ ...s.table, marginBottom: 0 }}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c} style={s.th}>
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
    </div>
  )
}
