// Library sync: uploads audio from scripts/library/catalog.json to the private
// `library-audio` bucket and upserts shelves/books/tracks rows.
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
// It never deletes anything. Removing a shelf/book/track is a manual step.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

type CatalogTrack = { file: string; path: string; title: string; subtitle?: string; durationSeconds?: number }
type CatalogBook = {
  slug: string
  title: string
  subtitle?: string
  author?: string
  coverLabel?: string
  cloth?: string
  sourceDir: string
  tracks: CatalogTrack[]
}
type CatalogShelf = { slug: string; title: string; description?: string; books: CatalogBook[] }
type Catalog = { ownerEmail: string; bucket: string; shelves: CatalogShelf[] }

export type ResolvedTrack = {
  title: string
  subtitle: string | null
  position: number
  audioPath: string
  sourceFile: string
  durationSeconds: number | null
  exists: boolean
}
export type ResolvedBook = Omit<CatalogBook, 'tracks' | 'sourceDir'> & { position: number; tracks: ResolvedTrack[] }
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

// ---------- catalog ----------
function loadCatalog(): Catalog {
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog
  if (!raw.ownerEmail || !raw.bucket || !Array.isArray(raw.shelves)) {
    throw new Error(`catalog ${catalogPath} needs ownerEmail, bucket, shelves[]`)
  }
  const paths = new Set<string>()
  for (const shelf of raw.shelves) {
    for (const book of shelf.books ?? []) {
      for (const t of book.tracks ?? []) {
        if (!/^[a-z0-9][a-z0-9/_.-]*$/.test(t.path)) {
          throw new Error(`storage path must be lowercase ASCII (a-z 0-9 / _ . -): "${t.path}"`)
        }
        if (paths.has(t.path)) throw new Error(`duplicate storage path "${t.path}"`)
        paths.add(t.path)
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
      const dir = isAbsolute(book.sourceDir) ? book.sourceDir : resolve(dirname(catalogPath), book.sourceDir)
      return {
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        coverLabel: book.coverLabel,
        cloth: book.cloth,
        position: bi + 1,
        tracks: book.tracks.map((t, ti) => {
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

  if (asJson) {
    process.stdout.write(JSON.stringify({ bucket: catalog.bucket, shelves }))
    return
  }

  console.log(`catalog: ${catalogPath}`)
  const missing: string[] = []
  for (const s of shelves) {
    console.log(`\nชั้น ${s.position}. ${s.title} (${s.slug}) ${s.books.length} เล่ม`)
    for (const b of s.books) {
      if (onlyBook && b.slug !== onlyBook) continue
      console.log(`  เล่ม ${b.title} (${b.slug}) ${b.tracks.length} ตอน`)
      for (const t of b.tracks) {
        if (!t.exists) missing.push(t.sourceFile)
        console.log(`    ${String(t.position).padStart(2)}. ${t.title}  ${fmtDuration(t.durationSeconds)}  -> ${catalog.bucket}/${t.audioPath}${t.exists ? '' : '  [ไม่พบไฟล์]'}`)
      }
    }
  }
  if (missing.length) {
    console.error(`\nไม่พบไฟล์ต้นฉบับ ${missing.length} ไฟล์ หยุดก่อน ไม่แตะอะไรเลย`)
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
        }
      }
    }

    console.log('\nบันทึกข้อมูลชั้น/เล่ม/ตอน...')
    const sqlFile = join(work, 'seed.sql')
    writeFileSync(sqlFile, sql, 'utf8')
    const r = supabase(['db', 'query', '--linked', '-f', sqlFile])
    if (!r.ok) {
      console.error(`  SQL ไม่สำเร็จ\n${r.out}`)
      process.exit(1)
    }
    const check = supabase([
      'db', 'query', '--linked',
      `select (select count(*) from public.library_shelves) as shelves, (select count(*) from public.library_books) as books, (select count(*) from public.library_tracks) as tracks`,
    ])
    console.log(check.out.replace(/^Initialising login role\.\.\.\s*/m, ''))
    console.log('\nเสร็จแล้ว')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main()
