import { useEffect } from 'react'
import { X } from 'lucide-react'

// Modals have no title bar. Every modal starts with this row: the X alone, easy to see. Then the title
// row, then the content. The X sits 8px from the window's top and right edges and 8px above the title,
// whatever padding the modal uses (the modal's own top padding is 0). Esc closes too.
const GAP = 8, SIZE = 32
const row = { flex: 'none', height: GAP + SIZE + GAP }
const btn = { position: 'fixed', top: GAP, right: GAP, width: SIZE, height: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc', borderRadius: 6, background: '#f2f2f2', color: '#222', cursor: 'pointer', zIndex: 10, WebkitAppRegion: 'no-drag' }

export default function Close({ style }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && window.close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return (
    <div style={{ ...row, ...style }}>
      <button className="close-btn" style={btn} onClick={() => window.close()} title="ปิด (Esc)" aria-label="ปิด">
        <X size={20} strokeWidth={2.5} />
      </button>
    </div>
  )
}
