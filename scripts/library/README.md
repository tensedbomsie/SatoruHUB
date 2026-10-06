# Library (ห้องสมุดเสียง)

หน้าชั้นหนังสือเสียงใน Satoru HUB เปิดจากวงล้อ (ช่อง Library) หรือ `#library` ต่อท้าย URL ของ Hub

## ข้อมูลอยู่ที่ไหน

- เสียง: Supabase Storage bucket `library-audio` (private) ไม่มีไฟล์เสียงใน git เลย (`*.mp3` ถูก ignore)
- ตาราง: `library_shelves` > `library_books` > `library_tracks` และ `library_progress` (ตำแหน่งที่ฟังค้าง) ทุกตารางมี RLS `owner = auth.uid()`
- แอปขอ signed URL อายุ 3 ชั่วโมง และขอใหม่เองเมื่อใกล้หมดหรือเล่นแล้ว error
- schema: `supabase/migrations/20261006120000_library.sql`

## เพิ่มชั้น / เล่ม / ตอน (ไม่ต้องแก้โค้ด)

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
รันซ้ำได้ปลอดภัย (upsert) และไม่ลบอะไรเลย ถ้าจะลบเล่ม/ตอนให้ลบเองใน Supabase
ความยาวตอนคำนวณจากไฟล์ MP3 เอง (ไฟล์ชนิดอื่นใส่ `durationSeconds` ใน catalog เอง)

## ทดสอบแบบไม่ต้องล็อกอิน (dev server เท่านั้น)

`npm run dev` แล้วเปิด `http://localhost:5187/?libraryDemo#library`

- ใช้ catalog + ไฟล์เสียงในเครื่องผ่าน dev server (ไม่แตะ Supabase) ตำแหน่งที่ฟังเก็บใน localStorage
- `&libraryTtl=62` ทำให้ "signed URL" ปลอมหมดอายุเร็ว ใช้ทดสอบการขอ URL ใหม่
- `&libraryEmpty` ทดสอบหน้าตอนห้องสมุดว่าง
- โค้ดส่วนนี้ถูกตัดออกจาก production build ทั้งหมด (`import.meta.env.DEV`)
