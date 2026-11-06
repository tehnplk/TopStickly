// Flat (2D) round scored tablet, original drawing: top face, edge for thickness, score line.
export default function PillIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M2.5 10.5v3.2a9.5 5.3 0 0 0 19 0v-3.2Z" fill="#b8c2c9" />
      <ellipse cx="12" cy="10.5" rx="9.5" ry="5.3" fill="#f4f6f8" />
      <path d="M4.3 10.5h15.4" stroke="#b8c2c9" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
