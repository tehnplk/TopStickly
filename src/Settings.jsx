import { useEffect, useRef, useState } from 'react'

const GREEN = '#2e7d32'

const s = {
  page: { font: '14px system-ui', padding: 24, color: '#222', background: '#fff' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' },
  label: { display: 'block', fontSize: 13, color: '#555' },
  input: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '8px 10px', font: 'inherit', border: '1px solid #ccc', borderRadius: 4 },
  row: { display: 'flex', gap: 8, marginTop: 20 },
  btn: { flex: 1, padding: '9px 0', font: 'inherit', borderRadius: 4, cursor: 'pointer', border: `1px solid ${GREEN}` },
}

export default function Settings() {
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const page = useRef(null)

  useEffect(() => {
    window.bar.getDbConfig().then(setCfg)
  }, [])

  // grow/shrink the window to fit everything (e.g. a long error message)
  useEffect(() => {
    if (!page.current) return
    const ro = new ResizeObserver(() => window.bar.fit(page.current.offsetHeight))
    ro.observe(page.current)
    return () => ro.disconnect()
  }, [cfg !== null])

  if (!cfg) return null

  const field = (key, label, type = 'text', span = 1) => (
    <label style={{ ...s.label, gridColumn: `span ${span}` }}>
      {label}
      <input style={s.input} type={type} value={cfg[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })} />
    </label>
  )

  const run = async (fn) => {
    setBusy(true)
    setStatus(null)
    try {
      setStatus(await fn())
    } finally {
      setBusy(false)
    }
  }
  const test = () => run(() => window.bar.testDb(cfg))
  const save = () =>
    run(async () => {
      await window.bar.saveDbConfig(cfg)
      window.close()
    })

  return (
    <div ref={page} style={s.page}>
      <h3 style={{ margin: '0 0 18px', color: GREEN }}>เชื่อมต่อ MySQL HOSxP</h3>
      <div style={{ ...s.grid, gridTemplateColumns: '3fr 1fr' }}>
        {field('host', 'Host')}
        {field('port', 'Port', 'number')}
      </div>
      <div style={{ ...s.grid, marginTop: 14 }}>
        {field('user', 'User')}
        {field('password', 'Password', 'password')}
        {field('database', 'Database', 'text', 2)}
      </div>
      <div style={s.row}>
        <button style={{ ...s.btn, background: '#fff', color: GREEN }} disabled={busy} onClick={test}>
          ทดสอบการเชื่อมต่อ
        </button>
        <button style={{ ...s.btn, background: GREEN, color: '#fff' }} disabled={busy} onClick={save}>
          บันทึก
        </button>
      </div>
      {busy && <p style={{ margin: '14px 0 0', color: '#888' }}>กำลังดำเนินการ...</p>}
      {status && <p style={{ margin: '14px 0 0', color: status.ok ? GREEN : '#c62828', wordBreak: 'break-word' }}>{status.message}</p>}
    </div>
  )
}
