import { Check, FlaskConical, Pill, TriangleAlert } from 'lucide-react'
import { thaiDate } from './format.js'
import Modal, { ModalButton } from './Modal.jsx'

const AMBER = '#b45309'
const s = {
  rule: { display: 'flex', alignItems: 'center', gap: 4, color: AMBER, fontWeight: 700, margin: 0 },
  item: { display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #eee' },
  muted: { color: '#666' },
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

  return (
    <Modal
      title={
        <>
          <TriangleAlert size={16} /> แจ้งเตือน
        </>
      }
      color={AMBER}
      border={AMBER}
      extra={
        <span style={s.muted}>
          HN {q.hn} {q.patient}
        </span>
      }
    >
      {items.map(({ group, rule, rows }) => {
        const [label, Icon] = GROUP[group]
        return (
          <div key={rule} style={s.item}>
            <p style={s.rule}>
              <Icon size={13} /> {label} · {rule}
            </p>
            {rows.map((r, i) => (
              <Line key={i} r={r} />
            ))}
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <ModalButton icon={Check} color={AMBER} solid style={{ minWidth: 140 }} onClick={() => window.close()} autoFocus>
          รับทราบ
        </ModalButton>
      </div>
    </Modal>
  )
}
