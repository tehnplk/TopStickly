// HOSxP MySQL connection settings, stored in userData with the password encrypted by the OS (DPAPI).
import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'

const file = () => path.join(app.getPath('userData'), 'db.json')
const DEFAULTS = { host: '', port: 3306, user: '', password: '', database: 'hosxp' }

export async function loadDbConfig() {
  try {
    const { password, ...rest } = JSON.parse(fs.readFileSync(file(), 'utf8'))
    const plain = password ? (await safeStorage.decryptStringAsync(Buffer.from(password, 'base64'))).result : ''
    return { ...DEFAULTS, ...rest, password: plain }
  } catch {
    return { ...DEFAULTS }
  }
}

let pool = null
async function getPool() {
  if (!pool) {
    const cfg = await loadDbConfig()
    if (!cfg.host) return null
    pool = mysql.createPool({ ...cfg, connectionLimit: 2, connectTimeout: 5000, dateStrings: true })
  }
  return pool
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
    const [[r]] = await p.query(
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

// { name, ncd, vn, vstdate: '2025-11-06', vsttime: '09:12:20' } for the patient's latest visit.
// Fields are empty when not found or the DB is not configured / unreachable.
export async function getPatient(hn) {
  const empty = { name: '', ncd: {}, vn: '', vstdate: '', vsttime: '' }
  try {
    const p = await getPool()
    if (!p) return empty
    const [[pt]] = await p.query("SELECT CONCAT(COALESCE(pname,''), fname, ' ', lname) AS name FROM patient WHERE hn = ? LIMIT 1", [hn])
    if (!pt) return empty
    const [[v]] = await p.query('SELECT vn, vstdate, vsttime FROM ovst WHERE hn = ? ORDER BY vstdate DESC, vsttime DESC LIMIT 1', [hn])
    return { ...empty, name: pt.name ?? '', ncd: await getNcd(p, hn), ...v }
  } catch (e) {
    console.error('getPatient', e.message)
    return empty
  }
}

// A rule's SQL with :hn / :vn of the current patient.
export async function runSql(sql, params) {
  const p = await getPool()
  if (!p) return []
  const [rows] = await p.query({ sql, namedPlaceholders: true }, params)
  return rows
}

export async function saveDbConfig(cfg) {
  pool?.end().catch(() => {})
  pool = null // reconnect with the new settings on next query
  const password = cfg.password ? (await safeStorage.encryptStringAsync(cfg.password)).toString('base64') : ''
  fs.writeFileSync(file(), JSON.stringify({ ...cfg, port: Number(cfg.port) || 3306, password }))
}

export async function testDb(cfg) {
  let conn
  try {
    conn = await mysql.createConnection({ ...cfg, port: Number(cfg.port) || 3306, connectTimeout: 5000 })
    // opdconfig exists in every HOSxP database; confirms we hit the right schema
    const [rows] = await conn.query('SELECT hospitalname FROM opdconfig LIMIT 1').catch(() => [[]])
    return { ok: true, message: rows[0]?.hospitalname ? `เชื่อมต่อสำเร็จ: ${rows[0].hospitalname}` : 'เชื่อมต่อสำเร็จ (ไม่พบตาราง opdconfig)' }
  } catch (e) {
    return { ok: false, message: e.message }
  } finally {
    await conn?.end().catch(() => {})
  }
}
