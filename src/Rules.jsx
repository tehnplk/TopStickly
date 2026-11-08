import { Fragment, useEffect, useState } from 'react'
import { Bell, BellOff, Check, Copy, FileText, Search } from 'lucide-react'
import Modal, { tbl as s } from './Modal.jsx'

const AMBER = '#b45309'
const sqlBtn = { border: 0, background: 'none', padding: 2, cursor: 'pointer', color: '#555', display: 'flex', margin: '0 auto' }
const search = { marginLeft: 'auto', WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', border: '1px solid #ccc', borderRadius: 4 }
const searchInput = { border: 0, outline: 'none', font: 'inherit', padding: '3px 0', width: 200 }
const copyBtn = { position: 'absolute', top: 4, right: 4, width: 24, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #444', borderRadius: 4, background: '#2d2d2d', color: '#ccc', cursor: 'pointer' }
const sqlPre = { margin: 0, padding: '8px 36px 8px 10px', background: '#1e1e1e', color: '#d4d4d4', font: '11px/1.4 Consolas, monospace', whiteSpace: 'pre-wrap', borderRadius: 4 }

// SQL text with a copy icon in its corner; the icon turns into a tick for a moment once copied
function SqlBlock({ sql }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const Icon = copied ? Check : Copy
  return (
    <div style={{ position: 'relative' }}>
      <pre style={sqlPre}>{sql}</pre>
      <button style={copyBtn} onClick={copy} title={copied ? 'คัดลอกแล้ว' : 'คัดลอก SQL'} aria-label="คัดลอก SQL">
        <Icon size={13} color={copied ? '#4caf50' : undefined} />
      </button>
    </div>
  )
}

// เตือน/ไม่เตือน toggle button: the bell icon is the label
function Toggle({ on, onChange, title = on ? 'เตือน (กดเพื่อปิด)' : 'ไม่เตือน (กดเพื่อเปิด)' }) {
  const Icon = on ? Bell : BellOff
  return (
    <button
      aria-pressed={on}
      aria-label={on ? 'เตือน' : 'ไม่เตือน'}
      title={title}
      onClick={() => onChange(!on)}
      style={{ width: 26, height: 20, margin: '0 auto', padding: 0, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${on ? AMBER : '#ccc'}`, background: on ? AMBER : '#fff', color: on ? '#fff' : '#999' }}
    >
      <Icon size={13} />
    </button>
  )
}

// ตั้งเตือน: which rules of one group warn, for every patient (ลำดับ / กฎ / Criteria / SQL / เตือน).
export default function Rules() {
  const key = new URLSearchParams(location.hash.split('?')[1]).get('group')
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null) // rule id whose SQL is shown
  const [q, setQ] = useState('')
  useEffect(() => {
    window.bar.getAlerts(key).then(setData)
  }, [])
  if (!data) return null
  const { group, off } = data
  const toggle = async (id, on) => setData({ ...data, ...(await window.bar.setRule(key, id, on)) })
  const onCount = group.rules.filter((r) => !off.includes(r.id)).length
  // search กฎ + Criteria; ลำดับ keeps the rule's place in the full list
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = group.rules.map((r, i) => [r, i]).filter(([r]) => words.every((w) => `${r.name} ${r.criteria}`.toLowerCase().includes(w)))

  return (
    <Modal
      title={
        <>
          <Bell size={15} /> ตั้งเตือน · {group.title}
        </>
      }
      extra={
        group.rules.length > 0 && (
          <>
            <span style={{ color: '#666' }}>
              เปิดเตือน {onCount} จาก {group.rules.length} กฎ
            </span>
            <label style={search}>
              <Search size={13} color="#888" />
              <input style={searchInput} type="search" placeholder="ค้นหาเรื่อง / เงื่อนไข" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </label>
          </>
        )
      }
    >
        {group.rules.length === 0 ? (
          <p style={s.note}>ยังไม่มีกฎในกลุ่มนี้</p>
        ) : (
          <table style={{ ...s.table, tableLayout: 'fixed' }}>{/* fixed: columns don't jump while searching */}
            <thead>
              <tr>
                <th style={{ ...s.th, width: 36, textAlign: 'center' }}>ลำดับ</th>
                <th style={{ ...s.th, width: 220 }}>{key === 'ppfs' || key === 'ppb' ? 'บริการ' : 'เรื่องที่เตือน'}</th>
                <th style={s.th}>เงื่อนไข</th>
                <th style={{ ...s.th, width: 30, textAlign: 'center' }}>SQL</th>
                {/* header bell: any rule on → switch all off; all off → switch all on */}
                <th style={{ ...s.th, width: 38, textAlign: 'center' }}>
                  <Toggle
                    on={onCount > 0}
                    onChange={(v) => toggle(group.rules.map((r) => r.id), v)}
                    title={onCount > 0 ? 'ปิดเตือนทุกกฎ (Off All)' : 'เปิดเตือนทุกกฎ (On All)'}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td style={{ ...s.td, ...s.note }} colSpan={5}>
                    ไม่พบกฎที่ตรงกับ "{q}"
                  </td>
                </tr>
              )}
              {shown.map(([r, i]) => {
                const on = !off.includes(r.id)
                const dim = on ? undefined : '#999'
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td style={{ ...s.td, textAlign: 'center', color: dim }}>{i + 1}</td>
                      <td style={{ ...s.td, fontWeight: 600, color: dim }}>{r.name}</td>
                      <td style={{ ...s.td, color: dim }}>{r.criteria}</td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <button style={sqlBtn} onClick={() => setOpen(open === r.id ? null : r.id)} title="ดู SQL">
                          <FileText size={14} />
                        </button>
                      </td>
                      <td style={s.td}>
                        <Toggle on={on} onChange={(v) => toggle(r.id, v)} />
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td style={s.td} colSpan={5}>
                          <SqlBlock sql={r.sql.trim()} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
    </Modal>
  )
}
