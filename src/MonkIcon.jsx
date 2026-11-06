// Little novice monk with hands in a wai (original drawing).
export default function MonkIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="เณรน้อยพนมมือ">
      {/* robe */}
      <path d="M5 32C5 24.5 9.5 20.5 16 20.5S27 24.5 27 32Z" fill="#f39c12" />
      <path d="M9.5 22.5 21 32h-4.5L8 24.8Z" fill="#d35400" />
      {/* ears + shaved head */}
      <circle cx="8.3" cy="12.5" r="1.8" fill="#f0b98d" />
      <circle cx="23.7" cy="12.5" r="1.8" fill="#f0b98d" />
      <circle cx="16" cy="12" r="8" fill="#f8d2ad" />
      <path d="M8.2 10.6A8 8 0 0 1 23.8 10.6 9 6 0 0 0 8.2 10.6Z" fill="#c9a483" opacity=".55" />
      {/* closed eyes, smile, cheeks */}
      <path d="M11.6 12.6q1.6 1.3 3.2 0M17.2 12.6q1.6 1.3 3.2 0M14.4 15.8q1.6 1.2 3.2 0" fill="none" stroke="#5d4037" strokeWidth=".9" strokeLinecap="round" />
      <circle cx="11.4" cy="15" r="1.1" fill="#f1948a" opacity=".6" />
      <circle cx="20.6" cy="15" r="1.1" fill="#f1948a" opacity=".6" />
      {/* hands pressed together */}
      <path d="M16 18.2C13.2 20.6 12.8 26 13.4 29H18.6C19.2 26 18.8 20.6 16 18.2Z" fill="#f8d2ad" stroke="#b07a52" strokeWidth=".7" />
      <path d="M16 19V29" stroke="#b07a52" strokeWidth=".7" />
    </svg>
  )
}
