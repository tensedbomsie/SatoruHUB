// DEV ONLY: builds the sample files the reader is tested with, into
// scripts/library/samples/ (git-ignored). Every word and pixel here was
// written for this test; no third-party book content is used.
//
//   node scripts/library/make-samples.ts
//
// Produces
//   samples/sample-th-en.epub   EPUB 3, five chapters (Thai + English), nav TOC,
//                               one PNG drawn in code, plus a deliberately
//                               hostile chapter (inline <script>, onerror) so
//                               the reader's script blocking can be verified
//   samples/broken.epub         starts like a ZIP, then garbage: error state
//   samples/mgt2102-study-sheet.pdf
//                               printed by headless Edge from the owner's own
//                               study sheet (E:\projYT\reading), when present
//
// Nothing here is uploaded anywhere. catalog.demo.json points the dev server
// at these files; the production catalog never references them.

import { mkdirSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, 'samples')
mkdirSync(outDir, { recursive: true })

// ---------- CRC32 + a tiny ZIP writer (stored entries, EPUB-safe order) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(0, 8) // stored
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(e.data.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, e.data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(e.data.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + e.data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

// ---------- a PNG drawn in code: lanterns over a canal at night ----------
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      const i = y * (width * 3 + 1) + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const lanterns = [
  { x: 70, y: 60, r: 18, c: [242, 160, 70] },
  { x: 150, y: 44, r: 14, c: [236, 112, 84] },
  { x: 228, y: 66, r: 20, c: [246, 196, 92] },
  { x: 292, y: 40, r: 12, c: [236, 112, 84] },
]
const picture = png(360, 220, (x, y) => {
  const water = y > 150
  const t = y / 220
  let r = 14 + 20 * t
  let g = 16 + 22 * t
  let b = 40 + 46 * t
  if (water) {
    r = 10
    g = 22
    b = 44
  }
  for (const l of lanterns) {
    const ly = water ? 300 - l.y : l.y
    const d = Math.hypot(x - l.x, (y - ly) * (water ? 2.4 : 1))
    const glow = Math.max(0, 1 - d / (l.r * 3.2))
    const k = d < l.r ? (water ? 0.45 : 1) : glow * (water ? 0.25 : 0.5)
    r = r + (l.c[0] - r) * k
    g = g + (l.c[1] - g) * k
    b = b + (l.c[2] - b) * k
  }
  if (Math.abs(y - 150) < 1.5) {
    r = 60
    g = 70
    b = 96
  }
  return [Math.round(r), Math.round(g), Math.round(b)]
})

// ---------- book text (written for this sample) ----------
const xhtml = (title: string, body: string, lang = 'th') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="UTF-8"/><title>${title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`

const p = (s: string) => `<p>${s}</p>`

const ch1 = xhtml(
  'บทนำ',
  `<h1 id="intro">บทนำ: สมุดเล่มนี้มีไว้ทำอะไร</h1>
${p('สมุดเล่มนี้เป็นตัวอย่างทดสอบของห้องสมุดใน Satoru HUB เขียนขึ้นใหม่ทั้งหมดเพื่อให้มีเนื้อหาจริงไว้ลองเปิดอ่าน ลองกดข้ามบท ลองปรับขนาดตัวอักษร แล้วดูว่าภาษาไทยตัดบรรทัดถูกต้องหรือไม่ ตัวอักษรไทยไม่มีการเว้นวรรคระหว่างคำ เบราว์เซอร์จึงต้องใช้พจนานุกรมหาว่าคำจบตรงไหน ถ้าย่อหน้าข้างล่างนี้ตัดกลางคำ แปลว่าการตั้งค่าภาษาของหน้ายังไม่ถูก')}
${p('เวลาอ่านหนังสือเล่มยาว สิ่งที่ช่วยให้ใจนิ่งคือการรู้ว่าตัวเองอยู่ตรงไหนของเล่ม และเหลืออีกเท่าไรถึงจะจบ ตัวอ่านจึงบอกเปอร์เซ็นต์ที่อ่านไปแล้ว ชื่อบทปัจจุบัน และเวลาอ่านโดยประมาณที่เหลือไว้ตลอดเวลา ลองอ่านไปสักหน้าสองหน้า แล้วกดกลับไปที่ชั้นหนังสือ ตัวเลขบนปกควรขยับตาม')}
${p('ข้อความในวงเล็บต่อไปนี้มีคำยาวที่ไม่มีช่องว่าง (ราชบัณฑิตยสถานพจนานุกรมฉบับทดลองตัดบรรทัดภาษาไทยอัตโนมัติ) และตัวเลขอารบิก 1234567890 ปนกับเลขไทย ๑๒๓๔๕ เพื่อดูว่าทุกอย่างอยู่ในกรอบหน้า ไม่ล้นออกด้านข้าง')}
<blockquote><p>อ่านช้าแต่เข้าใจ ดีกว่าอ่านเร็วแล้วต้องย้อนกลับมาอ่านใหม่</p></blockquote>`,
)

const market = [
  'ตลาดริมคลองเปิดตอนพระอาทิตย์ตกดินพอดี แม่ค้าคนแรกที่มาถึงมักเป็นป้าขายขนมครกที่ตั้งเตาถ่านไว้ใต้ต้นมะขาม เสียงพัดลมไม้ไผ่โบกถ่านดังเป็นจังหวะ ควันลอยขึ้นไปพันกับแสงสีส้มของโคมกระดาษที่ห้อยเรียงตามราวสะพาน',
  'คนในซอยรู้กันว่าถ้าอยากได้ที่นั่งริมน้ำต้องมาก่อนหนึ่งทุ่ม หลังจากนั้นโต๊ะพลาสติกจะเต็มไปด้วยกลุ่มนักศึกษาที่หอบสมุดมานั่งทวนบทเรียน เสียงคุยปนเสียงหัวเราะ แต่ไม่มีใครรำคาญใคร เพราะทุกคนมาที่นี่ด้วยเหตุผลเดียวกัน คืออยากได้ที่ที่ไม่เงียบเกินไปและไม่ดังเกินไป',
  'เด็กชายคนหนึ่งเดินถือถาดกล้วยทอดไปตามแถวโต๊ะ เขาไม่ตะโกนขายเหมือนคนอื่น แค่ยิ้มแล้ววางถาดลงให้ดูใกล้ๆ ใครอยากได้ก็หยิบแล้วหย่อนเหรียญลงกระป๋อง วิธีขายแบบนี้ดูเหมือนจะขาดทุน แต่ทุกคืนกระป๋องของเขาเต็มก่อนสองทุ่มเสมอ',
  'พอดึกขึ้น น้ำในคลองจะนิ่งจนเห็นเงาโคมสะท้อนเป็นจุดสีส้มสั่นไหว คนเก็บร้านรุ่นสุดท้ายมักนั่งพักบนบันไดท่าน้ำ คุยกันเรื่องราคาผักที่ขึ้น เรื่องลูกที่เพิ่งสอบติด และเรื่องฝนที่ตกไม่ตรงฤดูเหมือนเมื่อก่อน',
]
const ch2 = xhtml(
  'ตลาดกลางคืนริมคลอง',
  `<h1 id="market">ตลาดกลางคืนริมคลอง</h1>
${market.map(p).join('\n')}
<figure><img src="lanterns.png" alt="ภาพวาดโคมไฟสีส้มเหนือคลองตอนกลางคืน"/><figcaption>ภาพประกอบที่วาดด้วยโค้ด: โคมไฟเหนือคลอง</figcaption></figure>
<h2 id="market-rain">คืนที่ฝนตก</h2>
${market.slice().reverse().map((s) => p(s.replace('ตลาด', 'ตลาดในคืนฝนตก'))).join('\n')}`,
)

const moods = ['อ่านจบไปหนึ่งบท', 'ฟังเสียงฝนแล้วหลับ', 'จดคำศัพท์ใหม่ห้าคำ', 'อ่านทวนโน้ตก่อนสอบ', 'เดินเล่นรอบหอสิบนาที', 'ลองอ่านช้าลงครึ่งหนึ่ง']
const nights = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1
  return `<h3 id="night-${n}">คืนที่ ${n}</h3>
${p(`วันนี้${moods[i % moods.length]} ใช้เวลาไปประมาณ ${10 + ((i * 7) % 35)} นาที สิ่งที่ได้คือความรู้สึกว่าหนังสือไม่ได้ยาวอย่างที่กลัว ถ้าแบ่งเป็นช่วงสั้นๆ และรู้ว่าเหลืออีกเท่าไร การอ่านจะกลายเป็นนิสัยได้เองโดยไม่ต้องฝืน`)}
${p(`โน้ตสั้น: หน้าที่ ${n * 3} มีประโยคที่ชอบ ตรงที่บอกว่าความเข้าใจเกิดตอนเราหยุดอ่านแล้วลองเล่าเรื่องให้ตัวเองฟังอีกครั้ง พรุ่งนี้จะลองเล่าให้เพื่อนฟังดู`)}`
}).join('\n')
const ch3 = xhtml('บันทึกสามสิบคืน', `<h1 id="nights">บันทึกสามสิบคืน</h1>\n${nights}`)

const shelf = [
  'Every reader keeps a quiet shelf somewhere: a corner of a room, a folder on a phone, a stack of paper by the bed. It is the place where unfinished books wait without judging anyone for leaving them halfway.',
  'This chapter exists to check how English text flows next to Thai in the same book. Words here are separated by spaces, so the browser can break lines without a dictionary, and hyphenation should stay off so that nothing looks broken.',
  'A good reading screen disappears. The type is large enough that the eyes never strain, the lines are short enough that the next line is easy to find, and the page tells you exactly how far you have come without asking for attention.',
  'When the evening gets late, the screen should get darker with it. Try the sepia and light themes too; the words and the progress should stay exactly where they were.',
]
const ch4 = xhtml('A Quiet Shelf', `<h1 id="shelf">A Quiet Shelf</h1>\n${shelf.map(p).join('\n')}\n${shelf.map(p).join('\n')}`, 'en')

const ch5 = xhtml(
  'ภาษาผสม Mixed Notes',
  `<h1 id="mixed">ภาษาผสม Mixed Notes</h1>
${p('ย่อหน้านี้ผสม English words กับภาษาไทยในประโยคเดียวกัน เช่น reading progress, bookmark และ table of contents เพื่อดูว่าการตัดบรรทัดยังเป็นธรรมชาติเมื่อสองภาษามาอยู่ด้วยกัน')}
<ul>
  <li>รายการที่หนึ่ง: ลองกดที่คั่นหนังสือ แล้วเปิดแผงที่คั่นดู</li>
  <li>Item two: open the table of contents and jump back to <a href="ch2.xhtml#market-rain">คืนที่ฝนตก</a></li>
  <li>รายการที่สาม: ลิงก์ยาวมากที่ไม่มีช่องว่าง https://example.com/a/very/long/path/that/should/wrap/inside/the/page/and/never/push/the/layout/sideways</li>
</ul>
<p class="test-note">บรรทัดถัดไปเป็นการทดสอบความปลอดภัย: ไฟล์นี้พยายามรันสคริปต์ ตัวอ่านต้องบล็อกไว้ ถ้าเห็นข้อความ "สคริปต์ทำงาน" แปลว่ายังไม่ปลอดภัย</p>
<p id="script-probe">สคริปต์ถูกบล็อก (ถูกต้อง)</p>
<script>
  try { document.getElementById('script-probe').textContent = 'สคริปต์ทำงาน (ไม่ควรเกิด)'; } catch (e) {}
  try { window.parent.__libraryEpubScriptRan = true; window.top.__libraryEpubScriptRan = true; } catch (e) {}
</script>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" onerror="window.top.__libraryEpubOnerrorRan = true" onload="window.top.__libraryEpubOnerrorRan = true"/>
${p('จบเล่มตัวอย่างแล้ว ถ้าตัวเลขความคืบหน้าขึ้น 100% และหน้าเล่มบอกว่าอ่านจบ แปลว่าทุกอย่างทำงานครบ')}`,
)

const css = `body { margin: 0; }
h1 { font-size: 1.5em; line-height: 1.35; margin: 0 0 0.8em; }
h2 { font-size: 1.2em; margin: 1.4em 0 0.6em; }
h3 { font-size: 1.05em; margin: 1.2em 0 0.4em; }
figure { margin: 1.2em 0; text-align: center; }
figure img { max-width: 100%; height: auto; border-radius: 6px; }
figcaption { font-size: 0.85em; opacity: 0.75; margin-top: 0.4em; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 2px solid currentColor; opacity: 0.85; }
.test-note { font-size: 0.9em; opacity: 0.8; }`

const chapters = [
  { id: 'ch1', file: 'ch1.xhtml', title: 'บทนำ: สมุดเล่มนี้มีไว้ทำอะไร', body: ch1 },
  { id: 'ch2', file: 'ch2.xhtml', title: 'ตลาดกลางคืนริมคลอง', body: ch2 },
  { id: 'ch3', file: 'ch3.xhtml', title: 'บันทึกสามสิบคืน', body: ch3 },
  { id: 'ch4', file: 'ch4.xhtml', title: 'A Quiet Shelf', body: ch4 },
  { id: 'ch5', file: 'ch5.xhtml', title: 'ภาษาผสม Mixed Notes', body: ch5 },
]

const nav = xhtml(
  'สารบัญ',
  `<nav epub:type="toc" id="toc"><h1>สารบัญ</h1><ol>
${chapters
  .map((c) =>
    c.id === 'ch2'
      ? `<li><a href="${c.file}">${c.title}</a><ol><li><a href="ch2.xhtml#market-rain">คืนที่ฝนตก</a></li></ol></li>`
      : `<li><a href="${c.file}">${c.title}</a></li>`,
  )
  .join('\n')}
</ol></nav>`,
)

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="th">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:5b0c3a8e-7c1d-4b77-9a51-satoru-sample</dc:identifier>
    <dc:title>สมุดทดลองอ่าน (ตัวอย่างทดสอบ)</dc:title>
    <dc:creator>Satoru HUB ตัวอย่างทดสอบ</dc:creator>
    <dc:language>th</dc:language>
    <meta property="dcterms:modified">2026-10-07T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="img" href="lanterns.png" media-type="image/png"/>
${chapters.map((c) => `    <item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"${c.id === 'ch5' ? ' properties="scripted"' : ''}/>`).join('\n')}
  </manifest>
  <spine>
${chapters.map((c) => `    <itemref idref="${c.id}"/>`).join('\n')}
  </spine>
</package>`

const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`

const epub = zip([
  { name: 'mimetype', data: Buffer.from('application/epub+zip') },
  { name: 'META-INF/container.xml', data: Buffer.from(container) },
  { name: 'OEBPS/content.opf', data: Buffer.from(opf) },
  { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) },
  { name: 'OEBPS/style.css', data: Buffer.from(css) },
  { name: 'OEBPS/lanterns.png', data: picture },
  ...chapters.map((c) => ({ name: `OEBPS/${c.file}`, data: Buffer.from(c.body) })),
])
writeFileSync(join(outDir, 'sample-th-en.epub'), epub)
console.log(`ok samples/sample-th-en.epub  ${(epub.length / 1024).toFixed(1)} KB`)

// Looks like a ZIP for the first four bytes, then nothing usable.
const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('this file was cut in half on purpose '.repeat(40))])
writeFileSync(join(outDir, 'broken.epub'), broken)
console.log('ok samples/broken.epub (broken on purpose)')

// ---------- PDF from the owner's own study sheet ----------
const sheet = 'E:/projYT/reading/mgt2102_study_sheet.html'
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
if (existsSync(sheet) && edge) {
  const profile = mkdtempSync(join(tmpdir(), 'lib-sample-edge-'))
  const out = join(outDir, 'mgt2102-study-sheet.pdf')
  const r = spawnSync(
    edge,
    ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${profile}`, `--print-to-pdf=${out}`, `file:///${sheet}`],
    { encoding: 'utf8', timeout: 60_000 },
  )
  rmSync(profile, { recursive: true, force: true })
  console.log(existsSync(out) ? 'ok samples/mgt2102-study-sheet.pdf' : `PDF not created: ${r.stderr || r.stdout}`)
} else {
  console.log('skip PDF: study sheet or Edge not found')
}
