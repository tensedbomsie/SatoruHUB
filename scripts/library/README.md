# Library (ห้องสมุด)

ชั้นหนังสือส่วนตัวใน Satoru HUB เปิดจากวงล้อ (ช่อง Library) หรือ `#library` ต่อท้าย URL ของ Hub
เล่มหนึ่งมีได้ทั้ง **เสียง** (ตอน) และ **ไฟล์อ่าน** (EPUB / PDF / HTML) หรืออย่างใดอย่างหนึ่ง

## ข้อมูลอยู่ที่ไหน

- เสียง: Supabase Storage bucket `library-audio` (private)
- ไฟล์อ่าน: bucket `library-docs` (private)
- ไม่มีไฟล์เสียงหรือไฟล์หนังสือใน git เลย (`*.mp3` `*.epub` `*.pdf` ฯลฯ ถูก ignore)
- ตาราง: `library_shelves` > `library_books` > `library_tracks` / `library_files`
  ตำแหน่งที่ค้าง: `library_progress` (ฟัง), `library_reading_progress` (อ่าน), ที่คั่นและไฮไลต์: `library_bookmarks`
  ทุกตารางมี RLS `owner = auth.uid()` เห็นได้เฉพาะเจ้าของที่ล็อกอิน
- แอปขอ signed URL อายุสั้น (เสียง 3 ชม. ขอใหม่เอง, หนังสือ 10 นาที ใช้ดาวน์โหลดครั้งเดียวตอนเปิด)
- schema: `supabase/migrations/20261006120000_library.sql` และ `20261007120000_library_reader.sql`

## เพิ่ม ebook ที่ซื้อมา (ไม่มี DRM) เข้า Library

1. วางไฟล์ไว้ที่ไหนก็ได้ในเครื่อง เช่น `E:\Books\atomic-habits-th.epub`
2. เปิด `scripts/library/catalog.json` แล้วเพิ่ม `files` ใต้เล่ม
   - เล่มที่มีเสียงอยู่แล้ว: ใส่ `files` ต่อจาก `tracks` ของเล่มนั้นได้เลย กลายเป็นเล่มที่ "ฟังและอ่าน"
   - เล่มใหม่ที่มีแต่ไฟล์อ่าน: เพิ่ม object ใน `books` ไม่ต้องมี `tracks` / `sourceDir`

   ```json
   {
     "slug": "atomic-habits",
     "title": "Atomic Habits",
     "author": "James Clear",
     "coverLabel": "Atomic Habits",
     "cloth": "ochre",
     "files": [
       { "file": "E:/Books/atomic-habits-th.epub", "path": "books/atomic-habits.epub", "title": "Atomic Habits ฉบับภาษาไทย" }
     ]
   }
   ```

   - `file` = ที่อยู่ไฟล์ในเครื่อง (เต็ม หรือเทียบกับ `sourceDir` ของเล่ม) ชื่อไทยได้
   - `path` = ชื่อในคลัง ต้องเป็น a-z 0-9 `/ _ . -` และลงท้ายตามชนิดไฟล์ (`.epub` `.pdf` `.html`)
   - `kind` ไม่ต้องใส่ก็ได้ ดูจากนามสกุลให้เอง
3. ดูก่อน: `npm run library:sync -- --dry-run --only atomic-habits`
   สคริปต์บอกขนาดไฟล์ จำนวนหน้า เวลาอ่านโดยประมาณ และถ้าไฟล์ติด DRM จะหยุดพร้อมบอกเหตุผล
4. อัปโหลดจริง: `npm run library:sync -- --only atomic-habits`
5. เปิด Hub > Library > เล่มนั้น > กด "เริ่มอ่าน" (ไม่ต้อง deploy ใหม่ ข้อมูลอยู่ใน Supabase)

## ลิขสิทธิ์และ DRM (อ่านก่อนใส่ไฟล์)

- ระบบนี้คือ **ชั้นหนังสือส่วนตัวสำหรับไฟล์ที่เจ้าของมีสิทธิ์ใช้เอง** เท่านั้น
- รับเฉพาะไฟล์ **ไม่มี DRM**: ebook ที่ร้านขายแบบไม่ล็อก (DRM-free), ไฟล์แจกฟรีถูกกฎหมาย, งานที่เขียนเอง, สรุปที่ทำเอง
- **ไม่มี** และจะไม่ใส่ฟีเจอร์ลบหรือเลี่ยง DRM ของร้านใดๆ (เช่น Kindle, MEB, Ookbee หรือร้านอื่นที่ล็อกไฟล์)
  ไฟล์แบบนั้นให้อ่านในแอปของร้านตามเดิม สคริปต์ sync ตรวจเจอ DRM ของ EPUB (Adobe/encryption.xml) และ PDF (Adobe DRM) แล้วจะปฏิเสธ ไม่อัปโหลด
- ไม่มีปุ่มแชร์หรือลิงก์สาธารณะ ไฟล์อยู่ใน bucket private และเปิดได้เฉพาะเจ้าของที่ล็อกอิน (RLS + storage policy)
- อย่าเอาไฟล์ของคนอื่นที่ไม่ได้ซื้อ/ไม่ได้รับอนุญาตมาใส่

## เพิ่มชั้น / เล่ม / ตอนเสียง (ไม่ต้องแก้โค้ด)

1. แก้ `scripts/library/catalog.json`
   - ชั้นใหม่: เพิ่ม object ใน `shelves` (`slug` ภาษาอังกฤษ, `title` ภาษาไทยได้)
   - เล่มใหม่: เพิ่มใน `books` ของชั้นนั้น ใส่ `sourceDir` = โฟลเดอร์ไฟล์เสียงในเครื่อง
   - ตอน: `file` = ชื่อไฟล์จริง (ภาษาไทยได้), `path` = ชื่อใน storage ต้องเป็น a-z 0-9 `/ _ . -` เท่านั้น, `title` = ชื่อที่โชว์
   - `cloth` = สีปก: `ink` `moss` `clay` `dusk` `ochre` `plum`
   - `coverLabel` = ข้อความใหญ่บนปก (ไม่ใส่จะใช้ `title`)
2. ดูก่อนว่าจะทำอะไร: `npm run library:sync -- --dry-run`
3. อัปโหลด + บันทึก: `npm run library:sync`
   - เฉพาะเล่มเดียว: `npm run library:sync -- --only <book-slug>`
   - ไฟล์ขึ้นไปแล้ว อยากแก้แค่ชื่อ/ลำดับ: `npm run library:sync -- --skip-upload`

สคริปต์ใช้ Supabase CLI ที่ล็อกอินไว้แล้วในเครื่อง (`npx supabase ... --linked`) ไม่ต้องใส่คีย์อะไรเพิ่ม
รันซ้ำได้ปลอดภัย (upsert) และไม่ลบอะไรเลย ถ้าจะลบเล่ม/ตอน/ไฟล์ ให้ลบเองใน Supabase
ความยาวตอนคำนวณจากไฟล์ MP3 เอง (ไฟล์ชนิดอื่นใส่ `durationSeconds` ใน catalog เอง)
เวลาอ่านโดยประมาณของ EPUB/HTML นับจากตัวอักษรจริงในไฟล์ (ไทยราว 650 ตัว/นาที อังกฤษราว 1000 ตัว/นาที) PDF นับจำนวนหน้า และตัวอ่านประเมินเวลาจากข้อความในหน้าตอนเปิด

## หน้าอ่าน

- EPUB (foliate-js) พลิกทีละหน้าหรือเลื่อนยาว, PDF (pdf.js) เลื่อนต่อเนื่องหรือทีละหน้า, HTML (หน้าสรุปที่ทำเอง) เลื่อนยาว
- จำตำแหน่งอัตโนมัติ (ขึ้น Supabase ทุกครั้งที่หยุดอ่านราว 1.5 วินาที และตอนปิดหน้า)
- สารบัญ, ที่คั่น, ไฮไลต์ (EPUB), ค้นหาในเล่ม (EPUB/PDF), ขนาดตัวอักษร, ระยะบรรทัด, ธีมมืด/สว่าง/ซีเปีย (จำค่าต่อเครื่อง)
- คีย์บอร์ด: ลูกศรซ้าย/ขวา หรือ PageUp/PageDown เปลี่ยนหน้า, Esc ปิดแผง; มือถือแตะขอบซ้าย/ขวาเพื่อพลิกหน้า แตะกลางจอซ่อน/โชว์แถบ
- เปิดฟังเสียงค้างไว้แล้วเข้าหน้าอ่านได้ ตัวเล่นอยู่ล่างจอและไม่บังข้อความ

## ทดสอบแบบไม่ต้องล็อกอิน (dev server เท่านั้น)

`npm run dev` แล้วเปิด `http://localhost:5187/?libraryDemo#library`

- ใช้ catalog + ไฟล์ในเครื่องผ่าน dev server (ไม่แตะ Supabase) ตำแหน่งที่ฟัง/อ่านและที่คั่นเก็บใน localStorage
- ไฟล์อ่านตัวอย่าง: รัน `node scripts/library/make-samples.ts` ครั้งเดียว (สร้าง EPUB ไทย/อังกฤษที่เขียนเอง, ไฟล์เสียจงใจ, และ PDF จากสรุป MGT2102 ของเราเอง ลง `scripts/library/samples/` ซึ่งไม่เข้า git)
  `catalog.demo.json` เอาไฟล์พวกนี้มาโชว์ในชั้น "ตัวอย่างทดสอบ" และใส่ PDF/HTML ให้เล่ม MGT2102 เฉพาะใน dev ไม่มีผลกับ `library:sync`
- `&libraryTtl=62` ทำให้ "signed URL" ของเสียงหมดอายุเร็ว ใช้ทดสอบการขอ URL ใหม่
- `&libraryDocFail` จำลองขอลิงก์ไฟล์อ่านไม่สำเร็จ (ดูหน้าข้อความ error)
- `&libraryEmpty` ทดสอบหน้าตอนห้องสมุดว่าง
- โค้ดส่วนนี้ถูกตัดออกจาก production build ทั้งหมด (`import.meta.env.DEV`)

## ตรวจ RLS ด้วย SQL

`scripts/library/checks/reader-rls.sql` สร้างข้อมูลทดสอบในทรานแซกชันแล้ว rollback ทิ้ง
ผลที่ถูกต้อง: owner เห็น 1 แถวทุกตาราง, ผู้ใช้อื่นและคนไม่ล็อกอินเห็น 0

```
npx supabase db query --linked -f scripts/library/checks/reader-rls.sql
```
