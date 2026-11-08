# HAND-OFF — TopStickly (สติ-สตางค์)

ส่งต่องาน ณ 2026-11-08 · `main` @ `a22dd7d` · repo: https://github.com/tehnplk/TopStickly

แถบ AppBar สูง 30 DIP เกาะขอบบนจอเหนือ HOSxP อ่าน HN ของคนไข้ที่เปิดอยู่ แล้วรันกฎ SQL 4 กลุ่มกับ DB ของ HOSxP แสดงเป็น **ปุ่มแจ้งเตือน** (alert button) กลุ่มละปุ่ม พร้อมจำนวนข้อที่เข้าข่าย: **RLU** (สั่ง lab ถี่เกิน), **RDU** (ใช้ยาไม่สมเหตุผล — เตือนตั้งแต่ยาอยู่ในช่องชื่อยา), **PPFS** (บริการ PP Fee Schedule ปี 70 ที่เคลมได้วันนี้), **PPB** (ผลงานบริการพื้นฐานที่ยังไม่บันทึกปีงบนี้) ประวัติการพัฒนาอ่านจาก `git log` — แต่ละ commit สรุปฟีเจอร์ไว้แล้ว

## STACK

| ชั้น | ที่ใช้ | หมายเหตุ |
|---|---|---|
| แพลตฟอร์ม | Windows 10/11 เท่านั้น | พึ่ง Win32 API ทั้งหมด |
| Desktop shell | Electron 45 | main process เป็น ESM (`"type": "module"`), preload เป็น CJS ([electron/preload.cjs](electron/preload.cjs)) |
| UI | React 19 + Vite 8 (`@vitejs/plugin-react`) | inline style ล้วน ไม่มี CSS framework; ไอคอน `lucide-react` |
| Win32 FFI | koffi 3 | `user32`: EnumWindows, SendMessageTimeoutW (WM_GETTEXT), SetWindowPos, low-level mouse hook (`SetWindowsHookEx` ใน worker thread); `shell32`: SHAppBarMessage จองพื้นที่จอ |
| ฐานข้อมูล | mysql2 3 → MySQL/MariaDB (ค่าเริ่มต้น) หรือ pg 8 → PostgreSQL ของ HOSxP เลือกในหน้าตั้งค่า | อ่านอย่างเดียว; SQL ทั้งหมดเขียนเป็น MySQL พร้อม named param `:hn` `:vn` `:icode` — ถ้าเป็น PG แปลงด้วย [electron/pgsql.js](electron/pgsql.js) ก่อนรัน |
| เก็บความลับ | Electron `safeStorage` (DPAPI) | รหัสผ่าน DB เข้ารหัสใน userData |
| แพ็กเกจ/อัปเดต | electron-builder 26 (NSIS one-click, `asar: false`) + electron-updater 6 | อัปเดตจาก GitHub Releases |
| แอปเป้าหมาย | HOSxP (Delphi + DevExpress) | อ่านหน้าจอผ่าน window handle ไม่มี API ทางการ |

ไม่มี test framework, linter หรือ TypeScript

## รัน / build

```sh
npm install
npm run dev     # Vite + spawn Electron (vite.config.js); renderer มี HMR, แก้ electron/*.js ต้องรันใหม่
npm run dist    # installer ลง release/ — ออก release = อัป installer + latest.yml ขึ้น GitHub Release เอง
```

- รันใน terminal ของ VS Code: `ELECTRON_RUN_AS_NODE` ทำให้ Electron กลายเป็น Node — vite.config.js ลบให้แล้ว ถ้ารัน `electron .` ตรงให้ unset เอง
- single-instance: ตัวเก่าค้างอยู่ ตัวใหม่จะปิดเอง → `taskkill /f /im electron.exe`
- ตั้งค่า DB ที่ปุ่มเฟืองบนแถบ

## FLOW

หัวใจของแอป: **ดึง HN จากหน้าจอ HOSxP → ใช้ HN คิวรี DB ตามเงื่อนไขของกฎ → แสดงผลบนแถบ**

```
HOSxP (หน้าจอ)                     TopStickly main process                         แถบ (renderer)
──────────────                     ───────────────────────                         ──────────────
ช่อง HN บนฟอร์ม  ──WM_GETTEXT──▶  ① readHn()  ทุก 1 วิ (setInterval)
                                    │ HN ไม่เปลี่ยน → จบรอบ
                                    │ HN เปลี่ยน → ล้างผลเก่า ──────────────────▶  แสดง HN ทันที
                                    ▼
MySQL ของ HOSxP  ◀──SELECT──────   ② getPatient(hn)  ชื่อ, อายุ, สิทธิ, NCD, vn ของ visit ล่าสุด ─▶  ชื่อ + badge โรคประจำตัว
                                    ▼
MySQL ของ HOSxP  ◀──SELECT ×N───   ③ checkRules({ hn, vn })  รันกฎทุกข้อที่เปิดอยู่
                                    │ กฎ = SQL หนึ่งก้อน; คืนแถว ≥ 1 = เข้าข่าย
                                    ▼
                                   ④ นับต่อกลุ่ม ──────────────────────────────▶  ปุ่มแจ้งเตือน RLU / RDU / PPFS / PPB
                                    │ RDU ที่เข้าข่ายครั้งแรก → popup เตือน          (PPFS/PPB > 0 กระพริบ 3 ครั้ง)
                                    ▼
                                   กดปุ่มแจ้งเตือน → modal แสดงแถวที่ SQL คืนมา (src/Hits.jsx)
```

ตัวอ่าน HN — `readHn()` ใน [electron/hosxp.js](electron/hosxp.js) ไม่แตะ DB: หาป้าย `HN` บนหน้าต่าง HOSxP ที่อยู่บนสุด แล้วอ่านช่อง edit ข้างป้าย คืน `''` = ไม่มี HN บนจอ, `null` = HOSxP ไม่ตอบ (คงค่าเดิม)

### สายคิวรี (ทั้งหมดที่ codebase มี)

คิวรีทุกตัวผ่าน connection เดียวใน [electron/db.js](electron/db.js) (`connect()` เลือก mysql2 หรือ pg ตาม `type`; ยกเว้นสาย E) กฎรันทีละข้อตามลำดับ (`await` ในลูป) ไม่ขนาน; กฎที่ error จะ log แล้วข้าม ไม่ล้มทั้งรอบ

| สาย | ทริกเกอร์ | เรียกอะไร | จำนวนคิวรี | ผลลัพธ์ |
|---|---|---|---|---|
| **A. เปลี่ยนคนไข้** | `hnTimer` (ทุก 1 วิ) เห็น HN ใหม่ | `recheck()` → `getPatient(hn)` → `checkRules({ hn, vn })` ทุกกลุ่ม | 5 + 47 | ชื่อ/NCD/ปุ่มแจ้งเตือน; RDU ที่เข้าข่ายครั้งแรก → popup |
| **B. คลิกใน HOSxP** | `watchClicks` แล้วหยุดคลิก 1.5 วิ (`recheckSoon`) | `recheck()` เหมือนสาย A | 5 + 47 | ปุ่มแจ้งเตือนตามยา/lab ที่เพิ่งสั่ง |
| **C. ยาในช่องชื่อยา (ยังไม่บันทึก)** | `hnTimer` อ่าน `readDrugBox()` แล้วข้อความเปลี่ยน | `checkPendingDrug()` → หา `icode` จาก `drugitems` → `checkRules({ hn, vn, icode }, ['rdu'])` | 1 + 13 | popup เตือนก่อนกดบันทึก |
| **D. เปิด/ปิดกฎ** | สวิตช์ในหน้าตั้งเตือน (IPC `set-rule`) | `checkRules({ hn, vn })` ทุกกลุ่ม (ไม่เรียก `getPatient`) | 47 | ปุ่มแจ้งเตือนอัปเดตทันที |
| **E. ทดสอบการเชื่อมต่อ** | ปุ่มทดสอบในหน้าตั้งค่า (IPC `test-db`) | `testDb(cfg)` เปิด connection ใหม่ ไม่ใช้ pool | 1 (`opdconfig`) | ชื่อหน่วยบริการ |

ไม่คิวรี (ใช้ผลที่ cache ไว้ใน `alerts`):
- **ติ๊ก lab ใน HOSxP** → ถ้าตรงกับคอลัมน์ `lab` ในแถวของกฎ RLU ที่เข้าข่าย → popup เตือนทันที
- **กดปุ่มแจ้งเตือน / เปิด modal** → IPC `get-alerts` ส่งแถวที่มีอยู่แล้ว

รายละเอียดจำนวนคิวรี:
- `getPatient` = 5: `patient` (ชื่อ เพศ อายุ typearea), `ovst` (visit ล่าสุด → `vn`, สิทธิ), `clinicmember` (โรคประจำตัว), NCD × 2 (DM, HT จาก `ovstdiag` + ทะเบียนคลินิก)
- `checkRules` = 1 คิวรีต่อกฎที่เปิดอยู่: RLU 11 · RDU 13 · PPFS 18 (รวม ANC/PNC 5) · PPB 5 = 47 (ปิดกฎในหน้าตั้งเตือน = คิวรีน้อยลง)
- ป้องกันผลค้าง: หลังทุก `await` เช็ก `patient.hn !== hn` (และข้อความช่องยา) ถ้าผู้ใช้เปลี่ยนคนไข้ระหว่างรอ ผลเก่าจะถูกทิ้ง

### เพิ่มเงื่อนไขใหม่
เพิ่ม object หนึ่งตัวในอาร์เรย์ของกลุ่มที่ต้องการใน [electron/rules.js](electron/rules.js) (`RLU`, `RDU`, `PPFS`, `PPB`) — ไม่ต้องแก้ main.js หรือ UI:

```js
{
  id: 'ppExample',            // ไม่ซ้ำ ใช้เก็บสถานะเปิด/ปิด
  name: 'ชื่อที่โชว์ใน modal',
  criteria: 'เกณฑ์ (PPFS/PPB)', // ท้ายข้อความ "- 100 บาท" จะกลายเป็นป้ายราคา
  sql: `SELECT ... WHERE hn = :hn ...`, // คืนแถว = เข้าข่าย; alias คอลัมน์ = หัวตารางใน modal
}
```
ดูกฎที่มีอยู่เป็นตัวอย่าง และ helper (`labLast`, `drug`, `pp`, `ppLast`, ...) ในไฟล์เดียวกัน ทดสอบ SQL กับ DB จริงก่อนใส่

เขียน SQL เป็น MySQL เสมอ — ถ้าใช้ฟังก์ชัน MySQL ที่ [electron/pgsql.js](electron/pgsql.js) ยังไม่รู้จัก ต้องเพิ่มใน `FUNCS` และเพิ่มกรณีใน `node electron/pgsql.check.mjs` ด้วย ข้อห้ามที่ PG รับไม่ได้: บวกค่า boolean เป็นตัวเลข (ใช้ `IF(cond, 1, 0)`), เทียบ text กับตัวเลข, ค่าวันที่เป็น string ลอยๆ บวก INTERVAL (ใช้คอลัมน์หรือ `DATE '...'`)

## แผนที่โค้ด

| ไฟล์ | หน้าที่ |
|---|---|
| [electron/main.js](electron/main.js) | poll HN ทุก 1 วิ → `getPatient` + `checkRules` → renderer; เปิด popup; tray; updater |
| [electron/hosxp.js](electron/hosxp.js) | อ่าน HOSxP: `readHn`, `readDrugBox`, `watchClicks`, `controlInfo` (Spy) — วิธีหา control อธิบายในคอมเมนต์หัวไฟล์ |
| [electron/mousehook.js](electron/mousehook.js) | mouse hook (worker); กลืนคลิกตอน Spy |
| [electron/appbar.js](electron/appbar.js) | dock/undock แถบ ขนาดจริง = `BAR_HEIGHT × display scale` |
| [electron/rules.js](electron/rules.js) | กฎทั้งหมด + แหล่งอ้างอิงของแต่ละกลุ่มในคอมเมนต์ |
| [electron/db.js](electron/db.js) | connection (MySQL หรือ PG), ข้อมูลคนไข้, NCD, config |
| [electron/pgsql.js](electron/pgsql.js) | แปลง SQL MySQL → PostgreSQL (`toPg`) เฉพาะ construct ที่ codebase ใช้; ตรวจด้วย `node electron/pgsql.check.mjs` |
| [src/main.jsx](src/main.jsx) | route ตาม `location.hash`: settings / rules / hits / warn / spy / (แถบ) |
| [src/App.jsx](src/App.jsx) | ตัวแถบ |
| [src/Hits.jsx](src/Hits.jsx) · [Rules.jsx](src/Rules.jsx) · [Warn.jsx](src/Warn.jsx) · [Spy.jsx](src/Spy.jsx) · [Settings.jsx](src/Settings.jsx) | modal ทั้งหมด ใช้ [src/Modal.jsx](src/Modal.jsx) ร่วมกัน |

## สิ่งที่ไม่เห็นจากโค้ด (เรียนรู้มาแล้ว)

- **ห้ามส่งปุ่ม Alt เข้า HOSxP** — ribbon เข้าโหมดเมนู ลูกศร/Enter ต่อจากนั้นอาจไปกด Log out/Exit
- Control ID ของ HOSxP = HWND เปลี่ยนทุกรอบ ระบุ control ด้วย form class + control class + caption แทน (ใช้ Spy ดู)
- หัวแท็บของ HOSxP เป็นภาพวาด: MSAA ไม่เห็นแท็บ, Ctrl+Tab/ลูกศรสลับแท็บไม่ได้ — ต้องคลิกพิกัด
- หน้า Visit List ไม่มีช่อง HN → `readHn` คืน `''`; เปิดคนไข้ใหม่จึงนับเป็นเปลี่ยนคน (ปุ่มแจ้งเตือน PPFS/PPB กระพริบทุกครั้ง)
- คำศัพท์: **ปุ่มแจ้งเตือน** = ปุ่ม RLU/RDU/PPFS/PPB (กดได้, `alertBtn` ใน App.jsx) · **badge** = ป้ายโรคประจำตัว DM/HT (สถานะ กดไม่ได้) · **ปุ่มตั้งเตือน** = ไอคอนกระดิ่ง เปิด/ปิดกฎ
- `readHn` ใช้ ~0.4 ms/ครั้ง — poll ทุก 1 วิไม่กระทบ CPU
- ทดสอบได้แค่ DB ของ PCU (Turbo_HOSxP_PCU) **แต่แอปจะใช้ที่ รพ. ด้วย** lab จับด้วยชื่อ **หรือ** `provis_labcode` (`LAB_CODE` / `labIs` ใน rules.js) จึงใช้ข้ามที่ได้ถ้าที่นั้นกรอกรหัส 43 แฟ้มไว้; lab ที่ไม่มีรหัส (DCIP, ABO, PAP, Alb.Urine) และ HBsAg (รหัส 0741499 ซ้ำกับ Anti-HBs) ยังจับด้วยชื่ออย่างเดียว ห้ามใช้ `LIKE '%ชื่อ%'`: `%Hb%` ติด HbA1C/HBsAg, `%Cr.%` ติด Alb./Cr. Ratio, `%Chol%` ติด Cholinesterase; xray และยายังจับด้วยชื่อ
- modal ใช้ฟอนต์ 2 ขนาด: header 13px, content 11px (ป้ายราคา PPFS/PPB 13px)
- **PostgreSQL ยังไม่เคยรันกับ HOSxP-PG ที่มีข้อมูลจริง** — พิสูจน์แล้ว 3 ทาง (2026-11-08): กฎทุกข้อรันผ่านบน schema HOSxP ที่สร้างใน PG (คอลัมน์ตาม MySQL, ไม่มีข้อมูล), ฟังก์ชันที่แปลงให้ค่าตรงกับ MySQL บนค่าทดสอบ 41 กรณี, และฝั่ง MySQL ผลเหมือนเดิมทุกแถว ข้อต่างที่ยังเหลือ: PG เทียบ string แบบตัวพิมพ์เล็ก/ใหญ่ต่างกัน (`IN ('HbA1C')`) ส่วน MySQL ไม่สน; `CURDATE()` บน PG ใช้ timezone ของ server/session

## งานค้าง

- [ ] lab จับด้วย `provis_labcode` แล้ว (2026-11-08) ที่เหลือ: xray (`CXR|Chest`) และยายังจับด้วยชื่อ; เพิ่มกฎเฉพาะ รพ. (TSH/TMS ทารก, DXA, U/S, ดาวน์) ให้แต่ละที่ปิดเองได้ — **ยังไม่เคยทดสอบกับ DB รพ.**
- [ ] `ppAnemiaTeen` (ปี 70 = 1 ครั้งต่อคน) และ `ppIronInfant` (ปี 70 = ต่อปีงบ) ยังเป็นเกณฑ์ปี 69
- [ ] Overlay ยืนยันก่อนกดปุ่มใน HOSxP: แผ่นใสทับปุ่ม (หาด้วย form class + `TcxButton` + caption) ถามยืนยันแล้วค่อยส่งคลิกต่อ
- [ ] Spy "เปิดโดย" (`creditNewWindows` ใน hosxp.js) ยังไม่ได้ทดสอบกับ dialog จริง
- [ ] เติมค่าเชื่อมต่อ DB อัตโนมัติจากไฟล์ตั้งค่าของ HOSxP (`cds_cache`)

## ไฟล์ที่ไม่อยู่ใน git (ขอจากเจ้าของโปรเจกต์)

- `docs/` — PDF รายการและคู่มือเบิก PP Fee Schedule ปี 2570 ที่กฎ PPFS อ้างอิง

## กติกา

- DB ของ HOSxP อ่านอย่างเดียว ห้ามเขียนกลับ
- ห้ามใส่ข้อมูลคนไข้ (ชื่อ, เลขบัตร, เบอร์, ที่อยู่) ใน commit, log, issue หรือภาพ — อ้าง HN / rule id ได้
- หาเคสทดสอบด้วย SQL จริงกับ DB อย่าเดา; ไม่มี test อัตโนมัติ ต้องลองบนเครื่องที่มี HOSxP จริงทุกครั้ง (build ผ่านไม่พอ)
- ห้ามสั่งให้ HOSxP บันทึก/ยืนยันอะไรโดยอัตโนมัติถ้าไม่ได้รับอนุญาต

## Suggested skills (ถ้าทำต่อด้วย Claude Code)

| งาน | skill |
|---|---|
| รันแอปและดูผลบนเครื่องจริง | `run` |
| ออกแบบ/ปรับ UI ของ modal หรือแถบ | `impeccable` |
| ตรวจโค้ดก่อน merge | `code-review` |
| ถ้ายังไม่แน่ใจว่าบั๊กเกิดจากอะไร หรืองานแก้หลายไฟล์ | `pstack:poteto-mode` |
| ส่งต่องานรอบถัดไป | `handoff` |
