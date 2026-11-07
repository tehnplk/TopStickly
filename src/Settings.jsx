import { useEffect, useState } from 'react'
import { PlugZap, Save } from 'lucide-react'
import Modal, { ModalButton } from './Modal.jsx'

const GREEN = '#2e7d32'

const s = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' },
  label: { display: 'block', color: '#555' },
  input: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 2, padding: '5px 8px', font: 'inherit', border: '1px solid #ccc', borderRadius: 4 },
  row: { display: 'flex', gap: 8, marginTop: 12 },
}

export default function Settings() {
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.bar.getDbConfig().then(setCfg)
  }, [])

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
    <Modal title="เชื่อมต่อ MySQL HOSxP" color={GREEN}>
      <div style={{ ...s.grid, gridTemplateColumns: '3fr 1fr' }}>
        {field('host', 'Host')}
        {field('port', 'Port', 'number')}
      </div>
      <div style={{ ...s.grid, marginTop: 8 }}>
        {field('user', 'User')}
        {field('password', 'Password', 'password')}
        {field('database', 'Database', 'text', 2)}
      </div>
      <div style={s.row}>
        <ModalButton icon={PlugZap} color={GREEN} style={{ flex: 1 }} disabled={busy} onClick={test}>
          ทดสอบการเชื่อมต่อ
        </ModalButton>
        <ModalButton icon={Save} color={GREEN} solid style={{ flex: 1 }} disabled={busy} onClick={save}>
          บันทึก
        </ModalButton>
      </div>
      {busy && <p style={{ margin: '8px 0 0', color: '#888' }}>กำลังดำเนินการ...</p>}
      {status && <p style={{ margin: '8px 0 0', color: status.ok ? GREEN : '#c62828', wordBreak: 'break-word' }}>{status.message}</p>}
    </Modal>
  )
}
