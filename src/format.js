// '2025-11-06' -> '6/11/2568' (Buddhist year, as HOSxP shows it)
export const thaiDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}/${m}/${y + 543}`
}
