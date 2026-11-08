// MySQL → PostgreSQL for the SQL TopStickly writes (electron/rules.js, electron/db.js). Not a general translator:
// it covers the MySQL-only constructs those queries use, keeping MySQL semantics where they differ
// (case-insensitive REGEXP, CONCAT returning NULL on a NULL part, "5.6 mg" + 0 = 5.6, '' = date-free COALESCE).
// Parameters: named :name and positional ? both become $n::text; `keys` maps $n back to the caller's params.

const DATE_LIT = /^'\d{4}-\d{2}-\d{2}'$/
const isStr = (a) => /^'.*'$/s.test(a.trim())
const age = (from, to) => `AGE((${to})::date, (${from})::date)`

const FUNCS = {
  CURDATE: () => 'CURRENT_DATE',
  IF: ([c, a, b]) => `(CASE WHEN ${c} THEN ${a} ELSE ${b} END)`,
  ELT: ([n, ...xs]) => `(CASE ${n} ${xs.map((x, i) => `WHEN ${i + 1} THEN ${x}`).join(' ')} END)`,
  YEAR: ([x]) => `EXTRACT(YEAR FROM (${x})::date)::int`,
  MONTH: ([x]) => `EXTRACT(MONTH FROM (${x})::date)::int`,
  DATEDIFF: ([a, b]) => `((${a})::date - (${b})::date)::numeric`,
  TIMESTAMPDIFF: ([unit, a, b]) => {
    const u = unit.trim().toUpperCase()
    if (u === 'YEAR') return `EXTRACT(YEAR FROM ${age(a, b)})::int`
    if (u === 'MONTH') return `(EXTRACT(YEAR FROM ${age(a, b)}) * 12 + EXTRACT(MONTH FROM ${age(a, b)}))::int`
    throw new Error(`TIMESTAMPDIFF unit ${u}`)
  },
  DATE_FORMAT: ([x, f]) => {
    if (f.trim() !== "'%Y-%m-%d'") throw new Error(`DATE_FORMAT ${f}`)
    return `to_char(${x}, 'YYYY-MM-DD')`
  },
  CONCAT: (xs) => `(${xs.map((x) => `(${x})::text`).join(' || ')})`,
  // MySQL mixes types in COALESCE; PG needs one: a non-date text fallback ('ไม่เคย', '?') makes it text
  COALESCE: (xs) =>
    xs.some((x) => isStr(x) && !DATE_LIT.test(x.trim()))
      ? `COALESCE(${xs.map((x) => (isStr(x) ? x : `(${x})::text`)).join(', ')})`
      : `COALESCE(${xs.join(', ')})`,
}

const endOfString = (s, i) => {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "'" && s[j + 1] === "'") j++
    else if (s[j] === "'") return j + 1
  }
  throw new Error('unterminated string')
}
const closeParen = (s, open) => {
  for (let i = open + 1, depth = 1; i < s.length; i++) {
    if (s[i] === "'") i = endOfString(s, i) - 1
    else if (s[i] === '(') depth++
    else if (s[i] === ')' && --depth === 0) return i
  }
  throw new Error('unbalanced parentheses')
}
const splitArgs = (s) => {
  const out = []
  let start = 0
  for (let i = 0, depth = 0; i < s.length; i++) {
    if (s[i] === "'") i = endOfString(s, i) - 1
    else if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (s[i] === ',' && depth === 0) (out.push(s.slice(start, i)), (start = i + 1))
  }
  return [...out, s.slice(start)].map((a) => a.trim())
}
const skipSpace = (s, i) => {
  while (/\s/.test(s[i] ?? '')) i++
  return i
}

function translate(s, keys) {
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === "'") {
      const j = endOfString(s, i)
      out += s.slice(i, j)
      i = j
      continue
    }
    if (c === '?' || (c === ':' && /[A-Za-z_]/.test(s[i + 1] ?? '') && s[i - 1] !== ':')) {
      const name = c === '?' ? keys.filter((k) => typeof k === 'number').length : /^[A-Za-z_]\w*/.exec(s.slice(i + 1))[0]
      let n = keys.indexOf(name)
      if (n < 0 || c === '?') n = keys.push(name) - 1
      out += `$${n + 1}::text`
      i += c === '?' ? 1 : name.length + 1
      continue
    }
    const word = /[A-Za-z_]/.test(c) && !/[\w.]/.test(s[i - 1] ?? '') ? /^[A-Za-z_]\w*/.exec(s.slice(i))[0] : null
    if (!word) {
      out += c
      i++
      continue
    }
    const up = word.toUpperCase()
    const after = skipSpace(s, i + word.length)
    if (FUNCS[up] && s[after] === '(') {
      const close = closeParen(s, after)
      const inner = s.slice(after + 1, close)
      out += FUNCS[up](inner.trim() ? splitArgs(inner).map((a) => translate(a, keys)) : [])
      i = close + 1
    } else if (up === 'INTERVAL') {
      // INTERVAL <number | call | (expr)> DAY|MONTH|YEAR
      let end = /^\d+/.exec(s.slice(after))?.[0].length
      end = end ? after + end : s[after] === '(' ? closeParen(s, after) + 1 : closeParen(s, after + /^\w+\s*/.exec(s.slice(after))[0].length) + 1
      const unit = /^\s*(DAY|MONTH|YEAR)\b/i.exec(s.slice(end))
      if (!unit) throw new Error('INTERVAL unit')
      const operand = s.slice(after, end).trim()
      out += /^\d+$/.test(operand) ? `INTERVAL '${operand} ${unit[1].toLowerCase()}'` : `(${translate(operand, keys)}) * INTERVAL '1 ${unit[1].toLowerCase()}'`
      i = end + unit[0].length
    } else if (up === 'REGEXP') {
      out += '~*'
      i += word.length
    } else if (up === 'NOT' && /^REGEXP\b/i.test(s.slice(after))) {
      out += '!~*'
      i = after + 'REGEXP'.length
    } else if (up === 'AS' && /^(?=\w*[a-z])(?=\w*[A-Z])[A-Za-z_]\w*/.test(s.slice(after))) {
      const alias = /^\w+/.exec(s.slice(after))[0] // camelCase alias: PG would fold it to lower case
      out += `AS "${alias}"`
      i = after + alias.length
    } else {
      out += word
      i += word.length
    }
  }
  // MySQL "x + 0" turns a text result into its leading number ("5.6 mg" → 5.6, "Negative" → 0)
  return out.replace(/\b(\w+\.\w+) \+ 0\b/g, (_, col) => `COALESCE(substring((${col})::text from '^\\s*([-+]?[0-9]*\\.?[0-9]+)')::numeric, 0)`)
}

const cache = new Map()
// { text, keys }: keys[n] = the param name (named) or index (positional) behind $n+1
export function toPg(sql) {
  if (!cache.has(sql)) {
    const keys = []
    cache.set(sql, { text: translate(sql, keys), keys })
  }
  return cache.get(sql)
}
