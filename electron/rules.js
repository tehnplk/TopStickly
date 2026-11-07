// Alert rules shown as badges on the bar (one per group) and listed in the rules modal.
// Each rule's sql runs with :hn / :vn of the current patient; any row returned = the rule is hit,
// and the rows are what the modal shows (column aliases → headers in src/Rules.jsx).
// RLU rows must alias the lab name as `lab`: ticking that lab in HOSxP pops up the warning.
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { runSql } from './db.js'

// Rule ids the user switched off (เตือน/ไม่เตือน), kept in userData.
const offFile = () => path.join(app.getPath('userData'), 'rules-off.json')
export function rulesOff() {
  try {
    return JSON.parse(fs.readFileSync(offFile(), 'utf8'))
  } catch {
    return []
  }
}
export function setRuleOn(id, on) {
  const off = new Set(rulesOff())
  on ? off.delete(id) : off.add(id)
  fs.writeFileSync(offFile(), JSON.stringify([...off]))
}

// Orders of these labs (lab_items_name, as named at this hospital) within the last `days` days
// (null = ever), filtered by extra `AND ...` conditions on the patient.
const labWithin = (labs, days, ...where) => `
SELECT i.lab_items_name AS lab, h.order_date, h.order_time,
       DATEDIFF(CURDATE(), h.order_date) AS days_ago, o.lab_order_result AS result
  FROM lab_head h
  JOIN lab_order o ON o.lab_order_number = h.lab_order_number
  JOIN lab_items i ON i.lab_items_code = o.lab_items_code
 WHERE h.hn = :hn
   AND i.lab_items_name IN (${labs.map((l) => `'${l}'`).join(', ')})${days ? `
   AND h.order_date > CURDATE() - INTERVAL ${days} DAY` : ''}${where.map((w) => `
   AND ${w}`).join('')}
 ORDER BY h.order_date DESC, h.order_time DESC`

// Patient has ever been diagnosed with / registered in a clinic for an ICD-10 pattern (stored without the dot).
const dx = (re) => `(EXISTS (SELECT 1 FROM ovstdiag WHERE hn = :hn AND icd10 REGEXP '${re}')
        OR EXISTS (SELECT 1 FROM clinicmember cm JOIN clinic c ON c.clinic = cm.clinic
                    WHERE cm.hn = :hn AND c.icd10 REGEXP '${re}'))`
const DM = '^E1[0-4]', HT = '^I1[0-5]', CKD = '^N18', LIPID = '^E78', PREDM = '^R73', HBV = '^(B16|B18[01]|Z225)', HCV = '^(B171|B182)'
const age = (cond) => `(SELECT TIMESTAMPDIFF(YEAR, birthday, CURDATE()) FROM patient WHERE hn = :hn) ${cond}`
// latest eGFR (lab "GFR"), optionally only from the last `days` days; NULL when there is none
const gfr = (days) => `(SELECT o2.lab_order_result + 0 FROM lab_head h2
          JOIN lab_order o2 ON o2.lab_order_number = h2.lab_order_number
          JOIN lab_items i2 ON i2.lab_items_code = o2.lab_items_code
         WHERE h2.hn = :hn AND i2.lab_items_name = 'GFR' AND o2.lab_order_result <> ''${days ? `
           AND h2.order_date > CURDATE() - INTERVAL ${days} DAY` : ''}
         ORDER BY h2.order_date DESC LIMIT 1)`
const gfrNormal = `${gfr()} >= 60`
const LIPIDS = ['Chol', 'TG', 'HDL', 'LDL-C (cal.)']

// RLU rules from แนวทาง RLU ฉบับปรับปรุงครั้งที่ 3 (กรมวิทยาศาสตร์การแพทย์ 2566); ref = page in that guideline.
// Only "ordered more often than recommended" rules whose labs exist at this hospital.
const RLU = [
  {
    id: 'dmA1c',
    name: 'DM: HbA1c ไม่เกิน 4 ครั้ง/ปี',
    criteria: 'ผู้ป่วยเบาหวาน (E10–E14) ตรวจ HbA1c ห่างกันอย่างน้อย 3 เดือน (ปีละ 2–4 ครั้ง)',
    ref: 'หน้า 13',
    sql: labWithin(['HbA1C'], 90, dx(DM)),
  },
  {
    id: 'dmCr',
    name: 'DM: Creatinine/eGFR ปีละครั้งถ้าปกติ',
    criteria: 'เบาหวาน และ eGFR ล่าสุด ≥ 60: ตรวจ Cr ปีละครั้ง',
    ref: 'หน้า 14',
    sql: labWithin(['Cr.', 'GFR'], 365, dx(DM), gfrNormal),
  },
  {
    id: 'dmLipid',
    name: 'DM: Lipid ไม่ถี่กว่าทุก 3 เดือน',
    criteria: 'เบาหวาน: lipid ปกติตรวจปีละครั้ง ผิดปกติทุก 3–6 เดือน (สั่งซ้ำภายใน 90 วัน = ถี่เกิน)',
    ref: 'หน้า 14',
    sql: labWithin(LIPIDS, 90, dx(DM)),
  },
  {
    id: 'dmUacr',
    name: 'DM: UACR ไม่ถี่กว่าทุก 3 เดือน',
    criteria: 'เบาหวาน: UACR ปกติตรวจปีละครั้ง ผิดปกติทุก 3–6 เดือน (สั่งซ้ำภายใน 90 วัน = ถี่เกิน)',
    ref: 'หน้า 14',
    sql: labWithin(['Alb./Cr.Ratio.(Level)', 'Alb./Cr. Ratio(ค่า)', 'Alb.Urine (ค่า)', 'Mic.Cr.urine'], 90, dx(DM)),
  },
  {
    id: 'htCr',
    name: 'HT: Creatinine ปีละครั้งถ้าปกติ',
    criteria: 'ความดันโลหิตสูง (I10–I15) ไม่เป็นเบาหวาน และ eGFR ล่าสุด ≥ 60: ตรวจ Cr ปีละครั้ง',
    ref: 'หน้า 15',
    sql: labWithin(['Cr.', 'GFR'], 365, dx(HT), `NOT ${dx(DM)}`, gfrNormal),
  },
  {
    id: 'cuLipid',
    name: 'ตรวจสุขภาพ: Lipid ทุก 5 ปี',
    criteria: 'อายุ ≥ 20 ปี ไม่มี DM/HT/ไขมันสูง (E78)/CKD: ตรวจไขมันทุก 5 ปี',
    ref: 'หน้า 7',
    sql: labWithin(LIPIDS, 1825, age('>= 20'), `NOT ${dx([DM, HT, LIPID, CKD].join('|'))}`),
  },
  {
    id: 'cuFpg',
    name: 'ตรวจสุขภาพ: FPG อายุ 35–60 ทุก 3 ปี',
    criteria: 'อายุ 35–60 ปี ไม่มี DM/ภาวะก่อนเบาหวาน (R73): ตรวจ FPG ทุก 3 ปี',
    ref: 'หน้า 7',
    sql: labWithin(['FBS(Non DM)'], 1095, age('BETWEEN 35 AND 60'), `NOT ${dx([DM, PREDM].join('|'))}`),
  },
  {
    id: 'cuFpg60',
    name: 'ตรวจสุขภาพ: FPG อายุ > 60 ปีละครั้ง',
    criteria: 'อายุ > 60 ปี ไม่มี DM/ภาวะก่อนเบาหวาน: ตรวจ FPG ปีละครั้ง',
    ref: 'หน้า 7',
    sql: labWithin(['FBS(Non DM)'], 365, age('> 60'), `NOT ${dx([DM, PREDM].join('|'))}`),
  },
  {
    id: 'cuCr',
    name: 'ตรวจสุขภาพ: Creatinine ปีละครั้ง',
    criteria: 'อายุ ≥ 35 ปี ไม่มี DM/HT/CKD: ตรวจ Cr ปีละครั้ง',
    ref: 'หน้า 7',
    sql: labWithin(['Cr.', 'GFR'], 365, age('>= 35'), `NOT ${dx([DM, HT, CKD].join('|'))}`),
  },
  {
    id: 'cuHbsag',
    name: 'ตรวจสุขภาพ: HBsAg ครั้งเดียว',
    criteria: 'เคยตรวจ HBsAg แล้ว และไม่มีประวัติไวรัสตับอักเสบบี (B16, B18.0–1, Z22.5): ตรวจครั้งเดียว (ยกเว้น ALT/AST สูง หรือกลุ่มเสี่ยง)',
    ref: 'หน้า 8',
    sql: labWithin(['HBsAg'], null, `NOT ${dx(HBV)}`),
  },
  {
    id: 'cuHcv',
    name: 'ตรวจสุขภาพ: Anti-HCV ครั้งเดียว',
    criteria: 'เคยตรวจ Anti-HCV แล้ว และไม่มีประวัติไวรัสตับอักเสบซี (B17.1, B18.2): ตรวจครั้งเดียว (ยกเว้น ALT/AST สูง หรือมีความเสี่ยงใหม่)',
    ref: 'หน้า 8',
    sql: labWithin(['Anti -HCV'], null, `NOT ${dx(HCV)}`),
  },
]

// HOSxP has no NSAID flag and therapeuticgroup is filled in inconsistently (often blank for
// celecoxib/meloxicam/etoricoxib), so match on generic names. Low-dose aspirin is left out on purpose.
const NSAIDS = [
  'IBUPROFEN', 'DEXIBUPROFEN', 'DICLOFENAC', 'ACECLOFENAC', 'NAPROXEN', 'KETOPROFEN', 'DEXKETOPROFEN',
  'FLURBIPROFEN', 'KETOROLAC', 'INDOMETHACIN', 'SULINDAC', 'ETODOLAC', 'NABUMETONE', 'MEFENAMIC',
  'TOLFENAMIC', 'FLUFENAMIC', 'FLOCTAFENINE', 'PIROXICAM', 'MELOXICAM', 'TENOXICAM', 'LORNOXICAM', 'NIMESULIDE',
  'CELECOXIB', 'ETORICOXIB', 'PARECOXIB', 'PHENYLBUTAZONE',
].join('|')

// The visit's items: what is saved in opitemrece, plus :icode = the drug sitting in HOSxP's drug-name
// box but not saved yet ('' = none), so RDU can warn before the order is saved.
const ITEMS = `(SELECT icode, qty, drugusage, item_no FROM opitemrece WHERE vn = :vn
         UNION ALL SELECT :icode, NULL, NULL, 999999)`
// Drugs of this visit matching `match`, filtered by extra `AND ...` conditions.
const drugsIn = (match, ...where) => `
SELECT d.name, d.strength, o.qty, d.units,
       TRIM(CONCAT_WS(' ', du.name1, du.name2, du.name3)) AS howto
  FROM ${ITEMS} o
  JOIN drugitems d ON d.icode = o.icode
  LEFT JOIN drugusage du ON du.drugusage = o.drugusage
 WHERE ${match}${where.map((w) => `
   AND ${w}`).join('')}
 ORDER BY o.item_no, d.name`
const drug = (re, t = 'd') => `CONCAT_WS(' ', ${t}.name, ${t}.generic_name) REGEXP '${re}'`
const visitDx = (re) => `EXISTS (SELECT 1 FROM ovstdiag WHERE vn = :vn AND icd10 REGEXP '${re}')`
const visitDrug = (re) => `EXISTS (SELECT 1 FROM ${ITEMS} o2 JOIN drugitems d2 ON d2.icode = o2.icode
                WHERE ${drug(re, 'd2')})`

// Systemic antibiotics (ATC J01). drugitems.atc_code is empty and the antibiotic flag is incomplete here,
// so also match generic names; skip topical forms and oral metronidazole (P01AB, not J01).
const ABX = `(d.antibiotic = 'Y' OR ${drug('CILLIN|CEF|CEPH|MYCIN|CYCLINE|FLOXACIN|TRIMOXAZOLE|SULFAMETH|TRIMETHOPRIM|NITROFURANTOIN|FOSFOMYCIN|PENEM|CLAVULAN|LINEZOLID|COLISTIN')})
   AND NOT ${drug('METRONIDAZOLE')}
   AND COALESCE(d.dosageform, '') NOT REGEXP 'cream|ointment|eye|ear|drop|gel|lotion|topical'`
// ICD-10 sets from คำชี้แจงตัวชี้วัด Service Plan สาขา RDU (สป.สธ. ปรับปรุง 20 ธ.ค. 2559)
const URI = '^(J00|J01[0-489]|J02[09]|J03[089]|J04[0-2]|J05[01]|J06[089]|J101|J111|J20[0-9]|J21[089]|H65[019]|H66[049]|H67[018]|H72[0-289])$'
const AD = '^(A00[019]|A020|A03[0-389]|A04[0-9]|A05[0349]|A08[0-5]|A09[09]?|K52[189])$'
const FTW = '^(S0[01]|S05|S0[7-9]|S1[01]|S1[6-9]|S2[01]|S2[89]|S3[01]|S3[89]|S4[01]|S4[6-9]|S5[01]|S5[6-9]|S6[01]|S6[6-9]|S7[01]|S7[6-9]|S8[01]|S8[6-9]|S9[01]|S9[6-9]|T0[01]|T0[4-7]|T09[01]|T11[01]|T13[01]|T14[0-16-9]|T2[0-5]|T29|T3[0-2]|W5[0-9]|W6[0-4]|X[0-3][0-9])'
const PREG = '^(Z321|Z33|Z34|Z35)'
const SEDATING_FREE = 'CETIRIZINE|DESLORATADINE|FEXOFENADINE|LORATADINE'
// warfarin, statins (not "STATIN": nystatin), ergots
const PREG_X = 'WARFARIN|ATORVASTATIN|SIMVASTATIN|ROSUVASTATIN|PRAVASTATIN|LOVASTATIN|FLUVASTATIN|PITAVASTATIN|ERGOTAMINE|ERGOMETRINE|ERGONOVINE'
const ICS = 'BUDESONIDE|FLUTICASONE|BECLOMETASONE|BECLOMETHASONE|CICLESONIDE|MOMETASONE'

// RDU rules: the per-visit indicators of Service Plan สาขา RDU (target values from กบรส. 2566).
// APL (ยาปฏิชีวนะในหญิงคลอดปกติ) is an inpatient indicator and left out.
const RDU = [
  {
    id: 'ri',
    name: 'URI/หลอดลมอักเสบเฉียบพลัน ได้ยาปฏิชีวนะ',
    criteria: 'Dx visit นี้อยู่ในชุด URI 50 รหัส (J00–J06, J10.1, J11.1, J20–J21, H65–H67, H72) และได้ยาปฏิชีวนะ (J01)',
    ref: 'เป้า ≤20–30%',
    sql: drugsIn(ABX, visitDx(URI)),
  },
  {
    id: 'ad',
    name: 'อุจจาระร่วงเฉียบพลัน ได้ยาปฏิชีวนะ',
    criteria: 'Dx visit นี้ A00–A09, K52.1/8/9 (อุจจาระร่วงเฉียบพลัน) และได้ยาปฏิชีวนะ (J01)',
    ref: 'เป้า ≤20%',
    sql: drugsIn(ABX, visitDx(AD)),
  },
  {
    id: 'ftw',
    name: 'แผลสดจากอุบัติเหตุ ได้ยาปฏิชีวนะ',
    criteria: 'Dx visit นี้ S/T/W/X ตามชุด FTW (แผลสดภายใน 6 ชม.) และได้ยาปฏิชีวนะ (J01) กินหรือฉีด',
    ref: 'เป้า ≤40–50%',
    sql: drugsIn(ABX, visitDx(FTW)),
  },
  {
    id: 'ras',
    name: 'HT ได้ RAS blockade 2 ชนิดร่วมกัน',
    criteria: 'Dx visit นี้ I10 และได้ยา 2 กลุ่มขึ้นไปใน ACEI (-pril), ARB (-sartan), aliskiren (ยกเว้น captopril stat dose)',
    ref: 'เป้า 0%',
    sql: drugsIn(drug('PRIL|SARTAN|ALISKIREN'), visitDx('^I10'), `(${visitDrug('PRIL')} + ${visitDrug('SARTAN')} + ${visitDrug('ALISKIREN')}) >= 2`),
  },
  {
    id: 'ckdNsaid',
    name: 'CKD ระยะ 3 ขึ้นไป ได้ NSAIDs',
    criteria: 'เคยวินิจฉัย N18.3, N18.4, N18.5, N18.9 และ visit นี้ได้ NSAIDs กินหรือฉีด (M01A, ไม่นับ aspirin)',
    ref: 'เป้า ≤10%',
    sql: drugsIn(drug(NSAIDS), dx('^N18[3459]')),
  },
  {
    id: 'nsaidDup',
    name: 'ได้ NSAIDs ซ้ำซ้อน ≥ 2 ชนิด',
    criteria: 'visit นี้ได้ NSAIDs ตั้งแต่ 2 ชนิดขึ้นไป (ยกเว้น aspirin ร่วมกับ NSAID)',
    ref: 'เป้า ≤5%',
    // ponytail: "ชนิด" = distinct generic_name, which this hospital doesn't fill consistently
    sql: drugsIn(drug(NSAIDS), `(SELECT COUNT(DISTINCT d2.generic_name) FROM ${ITEMS} o2 JOIN drugitems d2 ON d2.icode = o2.icode
                WHERE ${drug(NSAIDS, 'd2')}) >= 2`),
  },
  {
    id: 'metformin',
    name: 'DM ได้ metformin ทั้งที่มีข้อห้ามใช้',
    criteria: 'เบาหวาน E11 ได้ metformin (รวมยาผสม) และ eGFR ล่าสุดใน 6 เดือน ≤ 30 หรือเคยวินิจฉัย N18.4/N18.5',
    sql: drugsIn(drug('METFORMIN'), dx('^E11'), `(${dx('^N18[45]')} OR ${gfr(180)} <= 30)`),
  },
  {
    id: 'glib',
    name: 'DM ได้ glibenclamide ในผู้สูงอายุ/ไตเสื่อม',
    criteria: 'เบาหวาน E11 ได้ glibenclamide และ อายุ > 65 ปี หรือ eGFR ล่าสุดใน 6 เดือน < 60',
    ref: 'เป้า ≤5%',
    sql: drugsIn(drug('GLIBENCLAMIDE|GLYBURIDE'), dx('^E11'), `(${age('> 65')} OR ${gfr(180)} < 60)`),
  },
  {
    id: 'elderBzd',
    name: 'ผู้สูงอายุได้ benzodiazepine ออกฤทธิ์ยาว',
    criteria: 'อายุ ≥ 65 ปี ได้ chlordiazepoxide, diazepam, clorazepate ชนิดกิน',
    ref: 'เป้า ≤5%',
    sql: drugsIn(drug('CHLORDIAZEPOXIDE|DIAZEPAM|CLORAZEPATE'), age('>= 65'), `COALESCE(d.dosageform, '') NOT REGEXP 'inj'`),
  },
  {
    id: 'childAntihist',
    name: 'เด็ก URI ได้ antihistamine ชนิดไม่ง่วง',
    criteria: 'อายุ ≤ 12 ปี Dx visit นี้อยู่ในชุด URI และได้ cetirizine, levocetirizine, desloratadine, fexofenadine, loratadine',
    ref: 'เป้า ≤20%',
    sql: drugsIn(drug(SEDATING_FREE), age('<= 12'), visitDx(URI)),
  },
  {
    id: 'pregX',
    name: 'ตั้งครรภ์ได้ยาที่ห้ามใช้',
    criteria: 'Dx visit นี้ Z32.1, Z33, Z34, Z35 (ตั้งครรภ์) และได้ warfarin, statins, ergots (ยกเว้น warfarin ใน mechanical heart valve Z95.2)',
    ref: 'เป้า 0 ราย',
    sql: drugsIn(drug(PREG_X), visitDx(PREG), `NOT (${drug('WARFARIN')} AND ${dx('^Z952')})`),
  },
  {
    id: 'asthmaIcs',
    name: 'หืดไม่ได้ inhaled corticosteroid',
    criteria: 'Dx visit นี้ J45/J46 (หืด) และไม่ได้ ICS (budesonide, fluticasone, beclometasone, ciclesonide, mometasone) ใน visit นี้',
    ref: 'เป้า ≥80% ได้ ICS',
    sql: `
SELECT icd10 AS dx FROM ovstdiag
 WHERE vn = :vn AND icd10 REGEXP '^J4[56]'
   AND NOT ${visitDrug(ICS)}`,
  },
]

export const GROUPS = {
  rlu: {
    title: 'RLU · การใช้ Lab อย่างสมเหตุผล',
    rules: RLU,
  },
  rdu: {
    title: 'RDU · การใช้ยาอย่างสมเหตุผล',
    rules: RDU,
  },
  claim: { title: 'Claim · การเบิกจ่าย', rules: [] }, // placeholder: rules to come
}

// { group: [{ id, name, rows }] } — only switched-on rules that returned rows. A failing rule is logged and skipped.
// params = { hn, vn, icode? } (icode: a pending, unsaved drug — see ITEMS).
export async function checkRules(params, groups = Object.keys(GROUPS)) {
  const off = new Set(rulesOff())
  const out = {}
  for (const group of groups) {
    out[group] = []
    for (const { id, name, sql } of GROUPS[group].rules) {
      if (off.has(id)) continue
      const rows = await runSql(sql, { icode: '', ...params }).catch((e) => (console.error('rule', id, e.message), []))
      if (rows.length) out[group].push({ id, name, rows })
    }
  }
  return out
}

// The drug in HOSxP's drug-name box ("<name> <strength> <units>", as HOSxP fills it after a pick) →
// the RDU rules it would trip for this visit if ordered: [{ id, name, rows }], only rules whose rows
// include that drug (a rule already hit by saved drugs alone is the badge's job).
export async function checkPendingDrug({ hn, vn }, boxText) {
  const t = boxText.trim()
  if (!t || !vn) return []
  const [d] = await runSql(
    `SELECT icode, name FROM drugitems WHERE istatus = 'Y' AND :t IN (CONCAT_WS(' ', name, strength, units), name)
      ORDER BY CHAR_LENGTH(name) DESC LIMIT 1`,
    { t }
  )
  if (!d) return []
  const { rdu } = await checkRules({ hn, vn, icode: d.icode }, ['rdu'])
  return rdu.filter((h) => h.rows.some((r) => r.name === d.name))
}
