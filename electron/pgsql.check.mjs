// node electron/pgsql.check.mjs — the MySQL → PostgreSQL translations TopStickly relies on.
// End-to-end proof (every rule on a PG schema, values equal to MySQL) needs a PG copy of the HOSxP schema; see HAND-OFF.md.
import assert from 'node:assert/strict'
import { toPg } from './pgsql.js'

const pg = (sql) => toPg(sql).text
const eq = (sql, want) => assert.equal(pg(sql).replace(/\s+/g, ' '), want)

eq('SELECT IF(a > 1, x, NULL)', 'SELECT (CASE WHEN a > 1 THEN x ELSE NULL END)')
eq('ELT(n, 7, 15)', '(CASE n WHEN 1 THEN 7 WHEN 2 THEN 15 END)')
eq('CURDATE() - INTERVAL 10 MONTH', "CURRENT_DATE - INTERVAL '10 month'")
eq('d + INTERVAL ELT(n, 7, 15) DAY', "d + ((CASE n WHEN 1 THEN 7 WHEN 2 THEN 15 END)) * INTERVAL '1 day'")
eq("icd10 REGEXP '^E1[0-4]' AND f NOT REGEXP 'gel'", "icd10 ~* '^E1[0-4]' AND f !~* 'gel'")
eq("COALESCE(MAX(v.vstdate), 'ไม่เคย')", "COALESCE((MAX(v.vstdate))::text, 'ไม่เคย')")
eq("COALESCE(x, '1000-01-01')", "COALESCE(x, '1000-01-01')")
eq("CAST(CONCAT(y, '-09-30') AS DATE)", "CAST(((y)::text || ('-09-30')::text) AS DATE)")
eq('SELECT 1 AS typeArea, 2 AS last_done', 'SELECT 1 AS "typeArea", 2 AS last_done')
eq("o.r + 0 >= 60", "COALESCE(substring((o.r)::text from '^\\s*([-+]?[0-9]*\\.?[0-9]+)')::numeric, 0) >= 60")

const named = toPg("WHERE hn = :hn AND vn = :vn OR hn2 = :hn AND x REGEXP 'A09[09]?:x'")
assert.equal(named.text, "WHERE hn = $1::text AND vn = $2::text OR hn2 = $1::text AND x ~* 'A09[09]?:x'")
assert.deepEqual(named.keys, ['hn', 'vn'])
const positional = toPg('WHERE hn = ? AND icd10 REGEXP ? AND x = ?')
assert.equal(positional.text, 'WHERE hn = $1::text AND icd10 ~* $2::text AND x = $3::text')
assert.deepEqual(positional.keys, [0, 1, 2])

console.log('pgsql: ok')
