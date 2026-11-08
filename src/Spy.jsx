import { Copy, Crosshair } from 'lucide-react'
import Modal, { ModalButton, tbl } from './Modal.jsx'

const ROWS = [
  ['form', 'Form (class)'],
  ['formTitle', 'Form (ชื่อหน้าต่าง)'],
  ['owner', 'Owner (หน้าต่างแม่)'],
  ['openedBy', 'เปิดโดย'],
  ['openedByPath', 'เปิดโดย (Path)'],
  ['cls', 'Control (class)'],
  ['label', 'Label'],
  ['caption', 'ข้อความ'],
  ['hwnd', 'HWND'],
  ['rect', 'ตำแหน่ง x,y  กว้าง×สูง'],
  ['path', 'Path'],
]

// What Spy caught: info = controlInfo() from electron/hosxp.js, null if nothing was there.
export default function Spy() {
  const info = JSON.parse(new URLSearchParams(location.hash.split('?')[1]).get('info'))
  return (
    <Modal
      title={
        <>
          <Crosshair size={16} /> Spy
        </>
      }
      extra={info && !info.hosxp && <span style={{ color: '#c62828' }}>ไม่ใช่หน้าต่าง HOSxP</span>}
    >
      {!info ? (
        <p style={tbl.note}>ไม่พบ control ตรงจุดนั้น</p>
      ) : (
        <>
          <table style={tbl.table}>
            <tbody>
              {ROWS.map(([k, label]) => (
                <tr key={k}>
                  <td style={{ ...tbl.td, color: '#555', whiteSpace: 'nowrap' }}>{label}</td>
                  <td style={{ ...tbl.td, wordBreak: 'break-all' }}>{info[k] === '' ? <span style={{ color: '#999' }}>—</span> : String(info[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <ModalButton icon={Copy} color="#2a5f9e" onClick={() => navigator.clipboard.writeText(JSON.stringify(info, null, 2))}>
              คัดลอก
            </ModalButton>
          </div>
        </>
      )}
    </Modal>
  )
}
