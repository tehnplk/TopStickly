// HOSxP database connection (MySQL or PostgreSQL), settings stored in userData with the password encrypted by
// the OS (DPAPI). All SQL is written for MySQL; on PostgreSQL it is translated by toPg first.
import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import pg from 'pg'
import { toPg } from './pgsql.js'

const file = () => path.join(app.getPath('userData'), 'db.json')
export const PORTS = { mysql: 3306, pg: 5432 }
const DEFAULTS = { type: 'mysql', host: '', port: PORTS.mysql, user: '', password: '', database: 'hosxp' }

// dates as 'YYYY-MM-DD' strings like mysql2's dateStrings, not JS Dates
for (const oid of [1082, 1114, 1184]) pg.types.setTypeParser(oid, (v) => v)

// { query(sql, params) → rows, end() }. params: an object for :named, an array for ? placeholders.
function connect({ type, host, port, user, password, database }) {
  if (type === 'pg') {
    const pool = new pg.Pool({ host, port: Number(port) || PORTS.pg, user, password, database, max: 2, connectionTimeoutMillis: 5000 })
    return {
      query: async (sql, params = []) => {
        const { text, keys } = toPg(sql)
        return (await pool.query(text, keys.map((k) => params[k] ?? null))).rows
      },
      end: () => pool.end(),
    }
  }
  const pool = mysql.createPool({ host, port: Number(port) || PORTS.mysql, user, password, database, connectionLimit: 2, connectTimeout: 5000, dateStrings: true })
  return {
    query: async (sql, params = []) => (await pool.query(Array.isArray(params) ? sql : { sql, namedPlaceholders: true }, params))[0],
    end: () => pool.end(),
  }
}

export async function loadDbConfig() {
  try {
    const { password, ...rest } = JSON.parse(fs.readFileSync(file(), 'utf8'))
    const plain = password ? (await safeStorage.decryptStringAsync(Buffer.from(password, 'base64'))).result : ''
    return { ...DEFAULTS, ...rest, password: plain }
  } catch {
    return { ...DEFAULTS }
  }
}

let db = null
async function getDb() {
  if (!db) {
    const cfg = await loadDbConfig()
    if (!cfg.host) return null
    db = connect(cfg)
  }
  return db
}

// Chronic conditions, each from the clinic registry and/or past diagnoses. ICD-10 is stored without
// the dot ('E119'). Clinics are matched by clinic.icd10, not by clinic code, which varies by site.
const NCD = {
  DM: { re: '^E11', clinic: 'ทะเบียนคลินิกเบาหวาน', diag: 'ประวัติวินิจฉัย E11 (เบาหวาน Type 2)' },
  HT: { re: '^I1[0-5]', clinic: 'ทะเบียนคลินิกความดัน', diag: 'ประวัติวินิจฉัย I10–I15 (ความดันโลหิตสูง)' },
}

// { DM: ['ทะเบียนคลินิกเบาหวาน', ...], HT: [...] } — only conditions that were found.
async function getNcd(p, hn) {
  const out = {}
  for (const [key, { re, clinic, diag }] of Object.entries(NCD)) {
    const [r] = await p.query(
      `SELECT EXISTS(SELECT 1 FROM ovstdiag WHERE hn = ? AND icd10 REGEXP ?) AS diag,
              EXISTS(SELECT 1 FROM clinicmember cm JOIN clinic c ON c.clinic = cm.clinic
                      WHERE cm.hn = ? AND c.icd10 REGEXP ?) AS clinic`,
      [hn, re, hn, re]
    )
    const found = [r.clinic && clinic, r.diag && diag].filter(Boolean)
    if (found.length) out[key] = found
  }
  return out
}

// { name, sex: 'หญิง', age: '45 ปี 2 เดือน 3 วัน', typeArea: '1-มีชื่อตามทบ.ในเขต และอยู่จริง', chronic: [{ name, status }], ncd,
//   vn, vstdate: '2025-11-06', vsttime: '09:12:20', pttype: 'บัตรประกันสุขภาพถ้วนหน้า (UC)' } for the latest visit.
// Fields are empty when not found or the DB is not configured / unreachable.
export async function getPatient(hn) {
  const empty = { name: '', sex: '', age: '', typeArea: '', chronic: [], ncd: {}, vn: '', vstdate: '', vsttime: '', pttype: '' }
  try {
    const p = await getDb()
    if (!p) return empty
    const [pt] = await p.query(
      `SELECT CONCAT(COALESCE(pname,''), fname, ' ', lname) AS name,
              CASE sex WHEN '1' THEN 'ชาย' WHEN '2' THEN 'หญิง' ELSE '' END AS sex,
              CONCAT(TIMESTAMPDIFF(YEAR, birthday, CURDATE()), ' ปี ',
                     TIMESTAMPDIFF(MONTH, birthday, CURDATE()) % 12, ' เดือน ',
                     DATEDIFF(CURDATE(), birthday + INTERVAL TIMESTAMPDIFF(MONTH, birthday, CURDATE()) MONTH), ' วัน') AS age,
              (SELECT t.house_regist_type_name FROM person pe
                 JOIN house_regist_type t ON t.house_regist_type_id = pe.house_regist_type_id
                WHERE pe.patient_hn = patient.hn LIMIT 1) AS typeArea
         FROM patient WHERE hn = ? LIMIT 1`,
      [hn]
    )
    if (!pt) return empty
    const [v] = await p.query(
      `SELECT o.vn, o.vstdate, o.vsttime, COALESCE(t.name, '') AS pttype
         FROM ovst o LEFT JOIN pttype t ON t.pttype = o.pttype
        WHERE o.hn = ? ORDER BY o.vstdate DESC, o.vsttime DESC LIMIT 1`,
      [hn]
    )
    // โรคประจำตัว: the clinic registries (clinicmember) with their status, e.g. { name: 'โรคDM', status: 'ยังรักษาอยู่' }
    const chronic = await p.query(
      `SELECT c.name, COALESCE(s.clinic_member_status_name, '') AS status
         FROM clinicmember cm
         JOIN clinic c ON c.clinic = cm.clinic
         LEFT JOIN clinic_member_status s ON s.clinic_member_status_id = cm.clinic_member_status_id
        WHERE cm.hn = ?
        ORDER BY cm.regdate`,
      [hn]
    )
    return {
      ...empty, name: pt.name ?? '', sex: pt.sex, age: pt.age ?? '', typeArea: pt.typeArea ?? '',
      chronic, ncd: await getNcd(p, hn), ...v,
    }
  } catch (e) {
    console.error('getPatient', e.message)
    return empty
  }
}

// A rule's SQL with :hn / :vn of the current patient.
export async function runSql(sql, params) {
  const p = await getDb()
  return p ? p.query(sql, params) : []
}

export async function saveDbConfig(cfg) {
  db?.end().catch(() => {})
  db = null // reconnect with the new settings on next query
  const password = cfg.password ? (await safeStorage.encryptStringAsync(cfg.password)).toString('base64') : ''
  fs.writeFileSync(file(), JSON.stringify({ ...cfg, port: Number(cfg.port) || PORTS[cfg.type], password }))
}

export async function testDb(cfg) {
  const conn = connect(cfg)
  try {
    await conn.query('SELECT 1')
    // opdconfig exists in every HOSxP database; confirms we hit the right schema
    const rows = await conn.query('SELECT hospitalname FROM opdconfig LIMIT 1').catch(() => [])
    return { ok: true, message: rows[0]?.hospitalname ? `เชื่อมต่อสำเร็จ: ${rows[0].hospitalname}` : 'เชื่อมต่อสำเร็จ (ไม่พบตาราง opdconfig)' }
  } catch (e) {
    return { ok: false, message: e.message }
  } finally {
    await conn.end().catch(() => {})
  }
}
