# TopStickly (สติ-สตางค์)

แถบเครื่องมือเกาะขอบบนจอสำหรับ HOSxP (Windows) อ่าน HN ของคนไข้ที่เปิดอยู่ในหน้าจอ HOSxP แล้วตรวจเกณฑ์จากฐานข้อมูลทันที แสดงเป็นปุ่มแจ้งเตือน 4 กลุ่ม:

- **RLU** — สั่ง lab ถี่เกินแนวทาง
- **RDU** — ใช้ยาไม่สมเหตุผล (เตือนตั้งแต่ยาอยู่ในช่องชื่อยา ก่อนบันทึก)
- **PPFS** — บริการ PP Fee Schedule ที่คนไข้รับได้วันนี้ (โอกาสเคลม)
- **PPB** — ผลงานบริการพื้นฐานที่ยังไม่บันทึกในปีงบนี้

ติดตั้งสำหรับผู้ใช้: ดาวน์โหลด `TopStickly-Setup-<version>.exe` จาก [Releases](https://github.com/tehnplk/TopStickly/releases) แอปอัปเดตตัวเองจากหน้านั้น

## 1. STACK

| ชั้น | ที่ใช้ |
|---|---|
| แพลตฟอร์ม | Windows 10/11 เท่านั้น |
| Desktop shell | Electron 45 (main process เป็น ESM) |
| UI | React 19 + Vite 8, ไอคอน lucide-react, inline style |
| อ่านหน้าจอ HOSxP | koffi (Win32 FFI) — `user32` / `shell32` |
| ฐานข้อมูล | mysql2 → MySQL/MariaDB ของ HOSxP (อ่านอย่างเดียว) |
| เก็บรหัสผ่าน DB | Electron `safeStorage` (DPAPI) |
| แพ็กเกจ / อัปเดต | electron-builder (NSIS) + electron-updater (GitHub Releases) |

ไม่มี test framework, linter หรือ TypeScript รายละเอียดเชิงลึกของแต่ละชั้นอยู่ใน [HAND-OFF.md](HAND-OFF.md#stack)

### เริ่มพัฒนา

ต้องมี Node.js 22+ (Vite 8) และเครื่องที่เปิด HOSxP และต่อ DB ของ HOSxP ได้

```sh
npm install
npm run dev     # Vite + Electron, renderer มี HMR (แก้ electron/*.js ต้องรันใหม่)
npm run dist    # สร้าง installer ใน release/
```

เปิดแอปแล้วตั้งค่าการเชื่อมต่อ DB ที่ปุ่มเฟืองบนแถบ

## 2. การพัฒนา → [HAND-OFF.md](HAND-OFF.md)

อ่านก่อนแก้โค้ด มีครบ:

- **FLOW** — ดึง HN จากหน้าจอ HOSxP → คิวรีตามเงื่อนไข → แสดงผล และสายคิวรีทั้งหมดที่โค้ดมี
- **เพิ่มเงื่อนไขใหม่** — เพิ่ม object `{ id, name, criteria, sql }` ใน `electron/rules.js` ที่เดียว
- **แผนที่โค้ด** — ไฟล์ไหนทำอะไร
- **สิ่งที่ไม่เห็นจากโค้ด** — พฤติกรรมของ HOSxP ที่ต้องรู้ (เช่น ห้ามส่ง Alt เข้า HOSxP)
- **งานค้าง** — สิ่งที่วางแผนไว้แต่ยังไม่ได้ทำ

## 3. การทำ PR

1. **แตก branch จาก `main`** ตั้งชื่อตามงาน เช่น `rule/pp-xray-cxr`, `fix/readhn-dialog`, `ui/hits-modal`
   ```sh
   git switch main && git pull
   git switch -c rule/pp-xray-cxr
   ```
2. **แก้ให้เล็กที่สุดที่ทำงานได้** หนึ่ง PR = หนึ่งเรื่อง
3. **ทดสอบบนเครื่องที่มี HOSxP จริง** (repo นี้ไม่มี test อัตโนมัติ — build ผ่านอย่างเดียวไม่พอ)
   - `npm run build` ต้องผ่าน
   - เปิดคนไข้ใน HOSxP แล้วดูปุ่มแจ้งเตือน / modal ที่เกี่ยวข้องกับสิ่งที่แก้
   - กฎใหม่: รัน SQL กับ DB จริง หาคนไข้ทั้งที่**เข้า**และ**ไม่เข้า**เงื่อนไข
4. **commit** ข้อความภาษาอังกฤษ บรรทัดแรกบอกว่าเปลี่ยนอะไร
5. **push แล้วเปิด PR เข้า `main`**
   ```sh
   git push -u origin rule/pp-xray-cxr
   gh pr create --base main
   ```
   ในคำอธิบาย PR ใส่:
   - **ทำอะไร / ทำไม** — อ้างเอกสารหรือเกณฑ์ที่ใช้ (เช่น หน้าในคู่มือ PPFS)
   - **ทดสอบอย่างไร** — DB ที่ใช้ (PCU / รพ.), ขั้นตอน, ผลที่เห็น; ภาพหน้าจอถ้าแก้ UI
   - **ผลกระทบ** — กฎ/คิวรีที่เพิ่มต่อรอบ, ต้องตั้งค่าอะไรเพิ่มไหม
6. **รอ review** แก้ตามคอมเมนต์ใน branch เดิม แล้ว merge โดยเจ้าของ repo

### ข้อห้ามใน PR

- ห้ามมีข้อมูลคนไข้ (ชื่อ, เลขบัตรประชาชน, เบอร์, ที่อยู่) ในโค้ด, commit, คำอธิบาย PR หรือภาพหน้าจอ — เบลอก่อนแนบ; อ้าง HN / rule id ได้
- ห้ามใส่รหัสผ่าน DB, API key หรือไฟล์ config ของเครื่อง
- ห้ามเขียนข้อมูลลง DB ของ HOSxP — แอปนี้อ่านอย่างเดียว
- ห้าม commit `docs/`, `clip/`, `release/`, `dist/` (อยู่ใน `.gitignore` แล้ว)
- กฎที่จับด้วยชื่อ lab/ยาของหน่วยบริการใดหน่วยหนึ่ง ให้บอกใน PR — แอปใช้ทั้ง PCU และ รพ. ควรจับด้วยรหัสมาตรฐาน (`provis_labcode`, ICD-10, `pp_special_code`) ถ้าทำได้

### ออก release (เจ้าของ repo)

แก้ `version` ใน `package.json` → `npm run dist` → สร้าง GitHub Release แท็ก `v<version>` แล้วอัป `release/TopStickly-Setup-<version>.exe`, `.exe.blockmap` และ `release/latest.yml` แอปที่ติดตั้งแล้วจะดาวน์โหลดเอง

## License

Open source ภายใต้ [MIT License](LICENSE) — ใช้ แก้ไข แจกจ่าย และพัฒนาต่อได้อิสระ รวมถึงเชิงการค้า โดยต้องคงข้อความลิขสิทธิ์และสัญญาอนุญาตไว้ในสำเนา ซอฟต์แวร์ให้มาตามสภาพ ไม่มีการรับประกัน

Copyright (c) 2026 tehnplk
