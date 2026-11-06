import { useEffect, useState } from 'react'
import { thaiDate } from './format.js'

const GREEN = '#2e7d32'
const s = {
  page: { font: '14px system-ui', padding: 20, color: '#222', background: '#fff', height: '100vh', boxSizing: 'border-box', overflow: 'auto' },
  head: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#555', padding: '8px 10px', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' },
  td: { padding: '9px 10px', borderBottom: '1px solid #eee', verticalAlign: 'top' },
  note: { color: '#777', padding: '24px 0', textAlign: 'center' },
}

export default function Drugs() {
  const q = new URLSearchParams(location.hash.split('?')[1])
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.bar.getNsaids(q.get('vn')).then(setRows, (e) => setError(e.message))
  }, [])

  return (
    <div style={s.page}>
      <div style={s.head}>
        <h3 style={{ margin: 0, color: GREEN }}>ยา NSAID</h3>
        <span>
          HN <b>{q.get('hn')}</b> {q.get('name')}
        </span>
        <span style={{ color: '#666' }}>
          Visit {thaiDate(q.get('vstdate'))} {q.get('vsttime').slice(0, 5)}
        </span>
      </div>
      {error ? (
        <p style={{ ...s.note, color: '#c62828' }}>{error}</p>
      ) : !rows ? (
        <p style={s.note}>กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <p style={s.note}>ไม่มียา NSAID ใน visit นี้</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>ชื่อยา</th>
              <th style={s.th}>ความแรง</th>
              <th style={{ ...s.th, textAlign: 'right' }}>จำนวน</th>
              <th style={s.th}>วิธีใช้</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...s.td, fontWeight: 600 }}>{r.name}</td>
                <td style={s.td}>{r.strength}</td>
                <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.qty} {r.units}
                </td>
                <td style={s.td}>{r.howto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
