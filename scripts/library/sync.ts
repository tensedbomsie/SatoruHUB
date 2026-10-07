// Library sync: uploads audio and reading files from scripts/library/catalog.json
// to the private `library-audio` / `library-docs` buckets and upserts
// shelves/books/tracks/files rows.
//
// Runs on Node 24+ directly (built-in TypeScript type stripping), no extra deps.
// Uses the Supabase CLI that is already logged in on this machine:
//   npx supabase storage cp ... --linked --experimental
//   npx supabase db query --linked -f <sql>
//
// Usage (from the repo root):
//   npm run library:sync                 upload every file + upsert rows
//   npm run library:sync -- --dry-run    show plan and SQL, change nothing
//   npm run library:sync -- --skip-upload  rows only (files already uploaded)
//   npm run library:sync -- --only acc1101 only this book slug
//   node scripts/library/sync.ts --json  resolved catalog as JSON (used by the dev server)
//
// It never deletes anything. Removing a shelf/book/track/file is a manual step.
//
// Reading files (EPUB / PDF / HTML) must be DRM-free. The script refuses a
// file that carries publisher DRM; it never tries to remove or work around it.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

type CatalogTrack = { file: string; path: string; title: string; subtitle?: string; durationSeconds?: number }
type DocKind = 'epub' | 'pdf' | 'html'
type CatalogFile = { kind?: DocKind; file: string; path: string; title: string }
type CatalogBook = {
  slug: string
  title: string
  subtitle?: string
  author?: string
  coverLabel?: string
  cloth?: string
  /** folder of the audio files (and of relative `files[].file` paths) */
  sourceDir?: string
  tracks?: CatalogTrack[]
  files?: CatalogFile[]
}
type CatalogShelf = { slug: string; title: string; description?: string; books: CatalogBook[] }
type Catalog = { ownerEmail: string; bucket: string; docsBucket?: string; shelves: CatalogShelf[] }

export type ResolvedTrack = {
  title: string
  subtitle: string | null
  position: number
  audioPath: string
  sourceFile: string
  durationSeconds: number | null
  exists: boolean
}
export type ResolvedFile = {
  kind: DocKind
  title: string
  position: number
  storagePath: string
  sourceFile: string
  exists: boolean
  sizeBytes: number | null
  charCount: number | null
  pageCount: number | null
  estMinutes: number | null
  /** set when the file must not be uploaded (DRM, unreadable) */
  problem: string | null
  /** worth telling the owner, but not blocking */
  note: string | null
}
export type ResolvedBook = Omit<CatalogBook, 'tracks' | 'sourceDir' | 'files'> & {
  position: number
  tracks: ResolvedTrack[]
  files: ResolvedFile[]
}
export type ResolvedShelf = Omit<CatalogShelf, 'books'> & { position: number; books: ResolvedBook[] }

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const catalogPath = resolve(option('--catalog') ?? join(here, 'catalog.json'))
const onlyBook = option('--only')
const dryRun = flag('--dry-run')
const asJson = flag('--json')
const skipUpload = flag('--skip-upload')

// ---------- MP3 duration (frame scan, no ffprobe needed) ----------
const BITRATES: Record<string, number[]> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

export function mp3DurationSeconds(buf: Buffer): number | null {
  let i = 0
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    i = 10 + size + (buf[5] & 0x10 ? 10 : 0)
  }
  let seconds = 0
  let frames = 0
  while (i + 4 <= buf.length) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const verBits = (buf[i + 1] >> 3) & 3
      const layerBits = (buf[i + 1] >> 1) & 3
      const brIdx = buf[i + 2] >> 4
      const srIdx = (buf[i + 2] >> 2) & 3
      const pad = (buf[i + 2] >> 1) & 1
      if (verBits !== 1 && layerBits !== 0 && brIdx !== 0 && brIdx !== 15 && srIdx !== 3) {
        const v1 = verBits === 3
        const layer = 4 - layerBits
        const table = v1 ? BITRATES[`1-${layer}`] : BITRATES[layer === 1 ? '2-1' : '2-2']
        const br = table[brIdx] * 1000
        const sr = SAMPLE_RATES[verBits][srIdx]
        const samples = layer === 1 ? 384 : layer === 2 ? 1152 : v1 ? 1152 : 576
        const len =
          layer === 1
            ? (Math.floor((12 * br) / sr) + pad) * 4
            : Math.floor(((layer === 3 && !v1 ? 72 : 144) * br) / sr) + pad
        if (len > 4) {
          seconds += samples / sr
          frames++
          i += len
          continue
        }
      }
    }
    i++
  }
  return frames > 0 ? Math.round(seconds * 100) / 100 : null
}

// ---------- reading files: length hints + DRM check (no deps) ----------

/** Minimal ZIP reader: returns the entries of an EPUB as name -> bytes getter. */
function readZip(buf: Buffer): Map<string, () => Buffer> {
  const out = new Map<string, () => Buffer>()
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('ไม่ใช่ไฟล์ ZIP/EPUB ที่สมบูรณ์ (หา central directory ไม่เจอ)')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('โครงสร้าง ZIP เสียหาย')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    out.set(name, () => {
      const lnameLen = buf.readUInt16LE(local + 26)
      const lextraLen = buf.readUInt16LE(local + 28)
      const start = local + 30 + lnameLen + lextraLen
      const data = buf.subarray(start, start + csize)
      if (method === 0) return Buffer.from(data)
      if (method === 8) return inflateRawSync(data)
      throw new Error(`ZIP method ${method} ไม่รองรับ`)
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, 'x')
}

/** Characters that take reading time: everything except whitespace. */
function countChars(text: string): { total: number; thai: number } {
  let total = 0
  let thai = 0
  for (const ch of text) {
    if (/\s/.test(ch)) continue
    total++
    const c = ch.codePointAt(0)!
    if (c >= 0x0e00 && c <= 0x0e7f) thai++
  }
  return { total, thai }
}

// Silent reading pace, deliberately conservative: Thai has no spaces and is
// usually read slower per character than English.
const THAI_CHARS_PER_MIN = 650
const OTHER_CHARS_PER_MIN = 1000
function estimateMinutes(c: { total: number; thai: number }): number | null {
  if (c.total === 0) return null
  return Math.max(1, Math.round(c.thai / THAI_CHARS_PER_MIN + (c.total - c.thai) / OTHER_CHARS_PER_MIN))
}

// Font obfuscation is not DRM (EPUB spec + Adobe's variant); everything else in
// encryption.xml means the text itself is locked.
const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']
const DRM_MESSAGE = 'ไฟล์นี้มี DRM ของร้านหนังสือ ระบบรับเฉพาะไฟล์ที่ไม่มี DRM (ไม่มีการปลดล็อกให้)'

type FileMetrics = Pick<ResolvedFile, 'charCount' | 'pageCount' | 'estMinutes' | 'problem' | 'note'>

function measureEpub(buf: Buffer): FileMetrics {
  const zip = readZip(buf)
  const mimetype = zip.get('mimetype')?.().toString('utf8').trim()
  if (mimetype !== 'application/epub+zip') {
    return { charCount: null, pageCount: null, estMinutes: null, problem: 'ไม่ใช่ EPUB (ไม่มี mimetype application/epub+zip)', note: null }
  }
  if (zip.has('META-INF/rights.xml')) {
    return { charCount: null, pageCount: null, estMinutes: null, problem: DRM_MESSAGE, note: null }
  }
  const enc = zip.get('META-INF/encryption.xml')?.().toString('utf8')
  if (enc) {
    const algorithms = [...enc.matchAll(/Algorithm\s*=\s*"([^"]+)"/g)].map((m) => m[1])
    if (algorithms.some((a) => !FONT_OBFUSCATION.includes(a))) {
      return { charCount: null, pageCount: null, estMinutes: null, problem: DRM_MESSAGE, note: null }
    }
  }
  const counts = { total: 0, thai: 0 }
  for (const [name, get] of zip) {
    if (!/\.(x?html?)$/i.test(name) || /(^|\/)(nav|toc)\.x?html?$/i.test(name)) continue
    const c = countChars(visibleText(get().toString('utf8')))
    counts.total += c.total
    counts.thai += c.thai
  }
  return { charCount: counts.total, pageCount: null, estMinutes: estimateMinutes(counts), problem: null, note: null }
}

function measurePdf(buf: Buffer): FileMetrics {
  if (buf.toString('latin1', 0, 5) !== '%PDF-') {
    return { charCount: null, pageCount: null, estMinutes: null, problem: 'ไม่ใช่ไฟล์ PDF (ไม่มี %PDF- ที่ต้นไฟล์)', note: null }
  }
  const s = buf.toString('latin1')
  // Adobe DRM (ADEPT / EBX) and LiveCycle policy servers lock the content.
  if (/\/Filter\s*\/(EBX_HANDLER|Adobe\.APS|FOPN_)/.test(s)) {
    return { charCount: null, pageCount: null, estMinutes: null, problem: DRM_MESSAGE, note: null }
  }
  const pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length
  const counts = [...s.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]))
  const pageCount = pages || (counts.length ? Math.max(...counts) : 0) || null
  const note = /\/Encrypt\b/.test(s) ? 'PDF มีการตั้งรหัส/สิทธิ์ ถ้าเปิดไม่ได้ในแอปให้ใช้ไฟล์ที่ไม่ล็อกแทน' : null
  return { charCount: null, pageCount, estMinutes: null, problem: null, note }
}

function measureHtml(buf: Buffer): FileMetrics {
  const c = countChars(visibleText(buf.toString('utf8')))
  return { charCount: c.total, pageCount: null, estMinutes: estimateMinutes(c), problem: null, note: null }
}

function kindOf(f: CatalogFile): DocKind {
  if (f.kind) return f.kind
  const ext = f.file.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'html' || ext === 'htm') return 'html'
  return 'epub'
}

function resolveFile(f: CatalogFile, i: number, dir: string): ResolvedFile {
  const sourceFile = isAbsolute(f.file) ? f.file : resolve(dir, f.file)
  const exists = existsSync(sourceFile)
  const kind = kindOf(f)
  const base: ResolvedFile = {
    kind,
    title: f.title,
    position: i + 1,
    storagePath: f.path,
    sourceFile,
    exists,
    sizeBytes: exists ? statSync(sourceFile).size : null,
    charCount: null,
    pageCount: null,
    estMinutes: null,
    problem: null,
    note: null,
  }
  if (!exists) return base
  try {
    const buf = readFileSync(sourceFile)
    const m = kind === 'epub' ? measureEpub(buf) : kind === 'pdf' ? measurePdf(buf) : measureHtml(buf)
    return { ...base, ...m }
  } catch (err) {
    return { ...base, problem: `อ่านไฟล์ไม่ได้: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ---------- catalog ----------
const PATH_RE = /^[a-z0-9][a-z0-9/_.-]*$/
const DOC_EXT: Record<DocKind, RegExp> = { epub: /\.epub$/, pdf: /\.pdf$/, html: /\.html?$/ }

function loadCatalog(): Catalog {
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog
  if (!raw.ownerEmail || !raw.bucket || !Array.isArray(raw.shelves)) {
    throw new Error(`catalog ${catalogPath} needs ownerEmail, bucket, shelves[]`)
  }
  const paths = new Set<string>()
  const docPaths = new Set<string>()
  for (const shelf of raw.shelves) {
    for (const book of shelf.books ?? []) {
      if ((book.tracks?.length ?? 0) > 0 && !book.sourceDir) throw new Error(`book "${book.slug}" has tracks but no sourceDir`)
      for (const t of book.tracks ?? []) {
        if (!PATH_RE.test(t.path)) {
          throw new Error(`storage path must be lowercase ASCII (a-z 0-9 / _ . -): "${t.path}"`)
        }
        if (paths.has(t.path)) throw new Error(`duplicate storage path "${t.path}"`)
        paths.add(t.path)
      }
      for (const f of book.files ?? []) {
        if (!f.file || !f.path || !f.title) throw new Error(`book "${book.slug}": every file needs file, path, title`)
        if (!PATH_RE.test(f.path)) {
          throw new Error(`storage path must be lowercase ASCII (a-z 0-9 / _ . -): "${f.path}"`)
        }
        if (!DOC_EXT[kindOf(f)].test(f.path)) throw new Error(`path "${f.path}" should end with .${kindOf(f)}`)
        if (docPaths.has(f.path)) throw new Error(`duplicate file path "${f.path}"`)
        docPaths.add(f.path)
      }
    }
  }
  return raw
}

function resolveCatalog(catalog: Catalog): ResolvedShelf[] {
  return catalog.shelves.map((shelf, si) => ({
    slug: shelf.slug,
    title: shelf.title,
    description: shelf.description,
    position: si + 1,
    books: (shelf.books ?? []).map((book, bi) => {
      const sourceDir = book.sourceDir ?? '.'
      const dir = isAbsolute(sourceDir) ? sourceDir : resolve(dirname(catalogPath), sourceDir)
      return {
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        coverLabel: book.coverLabel,
        cloth: book.cloth,
        position: bi + 1,
        files: (book.files ?? []).map((f, fi) => resolveFile(f, fi, dir)),
        tracks: (book.tracks ?? []).map((t, ti) => {
          const sourceFile = join(dir, t.file)
          const exists = existsSync(sourceFile)
          let duration = t.durationSeconds ?? null
          if (duration == null && exists && /\.mp3$/i.test(t.file)) duration = mp3DurationSeconds(readFileSync(sourceFile))
          return {
            title: t.title,
            subtitle: t.subtitle ?? null,
            position: ti + 1,
            audioPath: t.path,
            sourceFile,
            durationSeconds: duration,
            exists,
          }
        }),
      }
    }),
  }))
}

// ---------- SQL ----------
const q = (v: string | null | undefined) => (v == null || v === '' ? 'null' : `'${v.replace(/'/g, "''")}'`)
const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? 'null' : String(v))

function buildSql(email: string, shelves: ResolvedShelf[]): string {
  const out: string[] = []
  out.push('begin;')
  out.push(
    `do $$ begin if not exists (select 1 from auth.users where email = ${q(email)}) then raise exception 'owner ${email.replace(/'/g, "''")} not found in auth.users'; end if; end $$;`,
  )
  const owner = `(select id from auth.users where email = ${q(email)})`
  for (const s of shelves) {
    out.push(
      `insert into public.library_shelves (owner, slug, title, description, position) values (${owner}, ${q(s.slug)}, ${q(s.title)}, ${q(s.description)}, ${s.position})
  on conflict (owner, slug) do update set title = excluded.title, description = excluded.description, position = excluded.position;`,
    )
    for (const b of s.books) {
      if (onlyBook && b.slug !== onlyBook) continue
      out.push(
        `insert into public.library_books (owner, shelf_id, slug, title, subtitle, author, cover_label, cloth, position)
  values (${owner}, (select id from public.library_shelves where owner = ${owner} and slug = ${q(s.slug)}), ${q(b.slug)}, ${q(b.title)}, ${q(b.subtitle)}, ${q(b.author)}, ${q(b.coverLabel)}, ${q(b.cloth)}, ${b.position})
  on conflict (owner, slug) do update set shelf_id = excluded.shelf_id, title = excluded.title, subtitle = excluded.subtitle, author = excluded.author, cover_label = excluded.cover_label, cloth = excluded.cloth, position = excluded.position;`,
      )
      for (const t of b.tracks) {
        out.push(
          `insert into public.library_tracks (owner, book_id, title, subtitle, position, audio_path, duration_seconds)
  values (${owner}, (select id from public.library_books where owner = ${owner} and slug = ${q(b.slug)}), ${q(t.title)}, ${q(t.subtitle)}, ${t.position}, ${q(t.audioPath)}, ${n(t.durationSeconds)})
  on conflict (owner, audio_path) do update set book_id = excluded.book_id, title = excluded.title, subtitle = excluded.subtitle, position = excluded.position, duration_seconds = coalesce(excluded.duration_seconds, library_tracks.duration_seconds);`,
        )
      }
      for (const f of b.files) {
        out.push(
          `insert into public.library_files (owner, book_id, kind, title, storage_path, size_bytes, char_count, page_count, est_minutes, position)
  values (${owner}, (select id from public.library_books where owner = ${owner} and slug = ${q(b.slug)}), ${q(f.kind)}, ${q(f.title)}, ${q(f.storagePath)}, ${n(f.sizeBytes)}, ${n(f.charCount)}, ${n(f.pageCount)}, ${n(f.estMinutes)}, ${f.position})
  on conflict (owner, storage_path) do update set book_id = excluded.book_id, kind = excluded.kind, title = excluded.title, size_bytes = excluded.size_bytes, char_count = excluded.char_count, page_count = excluded.page_count, est_minutes = excluded.est_minutes, position = excluded.position;`,
        )
      }
    }
  }
  out.push('commit;')
  return out.join('\n')
}

// ---------- CLI helpers ----------
function supabase(cliArgs: string[], cwd?: string): { ok: boolean; out: string } {
  const quoted = cliArgs.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
  // --workdir keeps the CLI pointed at this repo's linked project even when
  // cwd is the temp folder.
  const command = ['npx', '--yes', 'supabase', ...quoted, '--workdir', `"${repoRoot}"`].join(' ')
  const r = spawnSync(command, { shell: true, encoding: 'utf8', cwd })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

function fmtDuration(s: number | null) {
  if (s == null) return '?'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

// ---------- main ----------
function main() {
  const catalog = loadCatalog()
  const shelves = resolveCatalog(catalog)

  const docsBucket = catalog.docsBucket ?? 'library-docs'

  if (asJson) {
    process.stdout.write(JSON.stringify({ bucket: catalog.bucket, docsBucket, shelves }))
    return
  }

  console.log(`catalog: ${catalogPath}`)
  const missing: string[] = []
  const refused: string[] = []
  for (const s of shelves) {
    console.log(`\nชั้น ${s.position}. ${s.title} (${s.slug}) ${s.books.length} เล่ม`)
    for (const b of s.books) {
      if (onlyBook && b.slug !== onlyBook) continue
      const parts = [b.tracks.length ? `${b.tracks.length} ตอน` : '', b.files.length ? `${b.files.length} ไฟล์อ่าน` : ''].filter(Boolean)
      console.log(`  เล่ม ${b.title} (${b.slug}) ${parts.join(' + ') || 'ยังว่าง'}`)
      for (const t of b.tracks) {
        if (!t.exists) missing.push(t.sourceFile)
        console.log(`    ${String(t.position).padStart(2)}. ${t.title}  ${fmtDuration(t.durationSeconds)}  -> ${catalog.bucket}/${t.audioPath}${t.exists ? '' : '  [ไม่พบไฟล์]'}`)
      }
      for (const f of b.files) {
        if (!f.exists) missing.push(f.sourceFile)
        else if (f.problem) refused.push(`${f.sourceFile}: ${f.problem}`)
        const size =
          f.sizeBytes == null ? '?' : f.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(f.sizeBytes / 1024))} KB` : `${(f.sizeBytes / 1024 / 1024).toFixed(1)} MB`
        const length = [f.pageCount ? `${f.pageCount} หน้า` : '', f.estMinutes ? `อ่านราว ${f.estMinutes} นาที` : ''].filter(Boolean).join(', ')
        console.log(
          `    [${f.kind}] ${f.title}  ${size}${length ? `  ${length}` : ''}  -> ${docsBucket}/${f.storagePath}${f.exists ? '' : '  [ไม่พบไฟล์]'}${f.problem ? `  [ไม่รับ: ${f.problem}]` : ''}`,
        )
        if (f.note) console.log(`        หมายเหตุ: ${f.note}`)
      }
    }
  }
  if (missing.length) {
    console.error(`\nไม่พบไฟล์ต้นฉบับ ${missing.length} ไฟล์ หยุดก่อน ไม่แตะอะไรเลย`)
    process.exit(1)
  }
  if (refused.length) {
    console.error(`\nมีไฟล์ที่รับไม่ได้ ${refused.length} ไฟล์ หยุดก่อน ไม่แตะอะไรเลย\n  ${refused.join('\n  ')}`)
    process.exit(1)
  }

  const sql = buildSql(catalog.ownerEmail, shelves)
  if (dryRun) {
    console.log('\n--- SQL (dry run, not executed) ---\n' + sql)
    return
  }

  const work = mkdtempSync(join(tmpdir(), 'library-sync-'))
  try {
    if (!skipUpload) {
      console.log('\nอัปโหลดไฟล์เสียง...')
      for (const s of shelves) {
        for (const b of s.books) {
          if (onlyBook && b.slug !== onlyBook) continue
          for (const t of b.tracks) {
            // Copy to an ASCII temp name first so the CLI never sees non-ASCII paths,
            // and pass it relative to cwd: an absolute Windows path ("C:\...") gets
            // parsed as a URL with scheme "c" and the CLI rejects the copy.
            // The source file is only read, never modified.
            const tmpName = t.audioPath.replace(/\//g, '__')
            copyFileSync(t.sourceFile, join(work, tmpName))
            const ext = t.audioPath.split('.').pop()?.toLowerCase()
            const type = ext === 'm4a' || ext === 'mp4' ? 'audio/mp4' : ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
            const r = supabase(
              [
                'storage', 'cp', tmpName, `ss:///${catalog.bucket}/${t.audioPath}`,
                '--linked', '--experimental', '--content-type', type, '--cache-control', 'max-age=86400',
              ],
              work,
            )
            if (!r.ok) {
              console.error(`  อัปโหลดไม่สำเร็จ ${t.audioPath}\n${r.out}`)
              process.exit(1)
            }
            console.log(`  ok ${t.audioPath}`)
          }
          for (const f of b.files) {
            const tmpName = `doc__${f.storagePath.replace(/\//g, '__')}`
            copyFileSync(f.sourceFile, join(work, tmpName))
            const type = f.kind === 'pdf' ? 'application/pdf' : f.kind === 'html' ? 'text/html' : 'application/epub+zip'
            const r = supabase(
              [
                'storage', 'cp', tmpName, `ss:///${docsBucket}/${f.storagePath}`,
                '--linked', '--experimental', '--content-type', type, '--cache-control', 'max-age=3600',
              ],
              work,
            )
            if (!r.ok) {
              console.error(`  อัปโหลดไม่สำเร็จ ${f.storagePath}\n${r.out}`)
              process.exit(1)
            }
            console.log(`  ok ${docsBucket}/${f.storagePath}`)
          }
        }
      }
    }

    console.log('\nบันทึกข้อมูลชั้น/เล่ม/ตอน/ไฟล์อ่าน...')
    const sqlFile = join(work, 'seed.sql')
    writeFileSync(sqlFile, sql, 'utf8')
    const r = supabase(['db', 'query', '--linked', '-f', sqlFile])
    if (!r.ok) {
      console.error(`  SQL ไม่สำเร็จ\n${r.out}`)
      process.exit(1)
    }
    const check = supabase([
      'db', 'query', '--linked',
      `select (select count(*) from public.library_shelves) as shelves, (select count(*) from public.library_books) as books, (select count(*) from public.library_tracks) as tracks, (select count(*) from public.library_files) as files`,
    ])
    console.log(check.out.replace(/^Initialising login role\.\.\.\s*/m, ''))
    console.log('\nเสร็จแล้ว')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main()
