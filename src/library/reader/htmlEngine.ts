// HTML engine for self-made study sheets (E:\projYT\reading\*_study_sheet.html).
//
// The page runs in an iframe sandboxed WITHOUT allow-same-origin: it gets an
// opaque origin, so even its own scripts cannot read the Hub's storage, cookies
// or login. A CSP meta allows only inline scripts (the sheet's own answer
// toggles plus a small position bridge) and blocks every other network load
// except Google Fonts stylesheets; offline, the system font is used instead.
// The bridge talks to the reader through postMessage only.
import { ReaderError, type EngineInit, type ReaderEngine, type ReaderPrefs, type TocItem } from './engine'

const SHEET_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:"

const BRIDGE = `<script>(function(){
var post=function(m){m.__lib=1;parent.postMessage(m,'*')};
var hs=[].slice.call(document.querySelectorAll('h1,h2,h3'));
hs.forEach(function(h,i){if(!h.id)h.id='lib-h-'+i});
function sized(){return innerHeight>0&&innerWidth>0}
function frac(){var d=document.documentElement;var max=d.scrollHeight-innerHeight;return max>0?Math.min(1,Math.max(0,scrollY/max)):1}
function cur(){var y=scrollY+innerHeight*0.3,c=null;for(var i=0;i<hs.length;i++){if(hs[i].getBoundingClientRect().top+scrollY<=y)c=hs[i].textContent.trim();else break}return c}
function text(){return (document.body&&document.body.innerText)||''}
function pos(){if(sized())post({type:'pos',fraction:frac(),chapter:cur()})}
var want=null;
function apply(){if(want==null||!sized())return;var m=document.documentElement.scrollHeight-innerHeight;scrollTo(0,Math.max(0,want*m));pos()}
['wheel','touchstart','keydown','pointerdown'].forEach(function(n){addEventListener(n,function(){want=null},{passive:true})});
var t=0;addEventListener('scroll',function(){if(t)return;t=setTimeout(function(){t=0;pos()},150)},{passive:true});
addEventListener('resize',function(){setTimeout(function(){if(want!=null)apply();else pos()},100)});
addEventListener('message',function(e){if(e.source!==parent)return;var d=e.data||{};
if(d.type==='goto-fraction'){want=d.fraction;apply()}
else if(d.type==='goto-heading'){want=null;var h=document.getElementById(d.id);if(h)h.scrollIntoView()}
else if(d.type==='zoom'){document.documentElement.style.zoom=String(d.zoom);if(want!=null)setTimeout(apply,50)}
else if(d.type==='page'){want=null;scrollBy({top:d.dir*innerHeight*0.88,behavior:'smooth'})}});
addEventListener('keydown',function(e){post({type:'key',key:e.key,shift:e.shiftKey,ctrl:e.ctrlKey||e.metaKey,alt:e.altKey})});
addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('a,button,summary,input,label,details'))return;if(String(getSelection()).length)return;post({type:'tap',x:e.clientX/innerWidth})});
function ready(){post({type:'ready',toc:hs.map(function(h){return{id:h.id,label:h.textContent.trim(),depth:+h.tagName[1]-1}}),fraction:sized()?frac():0,chapter:sized()?cur():null,text:text().slice(0,400000)});setTimeout(pos,400)}
if(document.readyState==='complete')ready();else addEventListener('load',ready);
})();</script>`

function prepare(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${SHEET_CSP}">`
  let out = html
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => `${m}${meta}`)
  else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, (m) => `${m}<head>${meta}</head>`)
  else out = `<!DOCTYPE html><html><head>${meta}</head><body>${out}</body></html>`
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${BRIDGE}</body>`)
  else out += BRIDGE
  return out
}

type BridgeMsg =
  | { type: 'ready'; toc: { id: string; label: string; depth: number }[]; fraction: number; chapter: string | null; text: string }
  | { type: 'pos'; fraction: number; chapter: string | null }
  | { type: 'key'; key: string; shift: boolean; ctrl: boolean; alt: boolean }
  | { type: 'tap'; x: number }

export async function createHtmlEngine({ container, data, prefs, initial, callbacks }: EngineInit): Promise<ReaderEngine> {
  const html = new TextDecoder('utf-8').decode(data)
  if (!html.trim()) throw new ReaderError('ไฟล์ HTML นี้ว่างเปล่า', 'ตรวจไฟล์ต้นฉบับแล้ว sync ใหม่')

  const frame = document.createElement('iframe')
  frame.className = 'lib-html-frame'
  frame.title = 'เนื้อหาหน้าสรุป'
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.srcdoc = prepare(html)
  container.append(frame)

  let current: ReaderPrefs = prefs
  let toc: TocItem[] = []
  let minutesTotal: number | null = null
  let lastFraction = 0
  const send = (m: Record<string, unknown>) => frame.contentWindow?.postMessage(m, '*')

  const relocate = (fraction: number, chapter: string | null) => {
    lastFraction = Math.min(1, Math.max(0, fraction))
    callbacks.onRelocate({
      locator: { fraction: Math.round(lastFraction * 10000) / 10000 },
      percent: lastFraction * 100,
      chapter,
      minutesLeft: minutesTotal != null ? Math.round(minutesTotal * (1 - lastFraction)) : null,
    })
  }

  let cleanup = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new ReaderError('หน้าสรุปนี้โหลดไม่เสร็จ', 'ไฟล์อาจใหญ่หรือมีสคริปต์ที่ค้าง ลองเปิดไฟล์ต้นฉบับในเบราว์เซอร์ตรวจดูก่อน')),
      15000,
    )
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return
      const m = e.data as BridgeMsg & { __lib?: number }
      if (!m || m.__lib !== 1) return
      if (m.type === 'ready') {
        window.clearTimeout(timer)
        toc = m.toc.map((h) => ({ label: h.label || 'ไม่มีชื่อหัวข้อ', target: h.id, depth: Math.max(0, h.depth) }))
        const { thai, other } = [...m.text].reduce(
          (acc, ch) => {
            if (/\s/.test(ch)) return acc
            const c = ch.codePointAt(0)!
            if (c >= 0x0e00 && c <= 0x0e7f) acc.thai++
            else acc.other++
            return acc
          },
          { thai: 0, other: 0 },
        )
        minutesTotal = thai + other > 0 ? Math.max(1, thai / 650 + other / 1000) : null
        send({ type: 'zoom', zoom: current.fontScale })
        if (initial?.fraction) {
          // The sheet's web font and zoom can still change its height right after
          // load; aim again once things settle so the restore lands where it should.
          // The bridge keeps the target until the reader scrolls, re-aiming on resize.
          const target = initial.fraction
          lastFraction = target
          send({ type: 'goto-fraction', fraction: target })
          relocate(target, m.chapter)
        } else relocate(m.fraction, m.chapter)
        resolve()
      } else if (m.type === 'pos') relocate(m.fraction, m.chapter)
      else if (m.type === 'key') callbacks.onKey(new KeyboardEvent('keydown', { key: m.key, shiftKey: m.shift, ctrlKey: m.ctrl, altKey: m.alt }))
      else if (m.type === 'tap') callbacks.onTap('center')
    }
    window.addEventListener('message', onMessage)
    cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
  })
  try {
    await ready
  } catch (err) {
    cleanup()
    frame.remove()
    throw err
  }

  return {
    kind: 'html',
    get toc() {
      return toc
    },
    paged: false,
    async goTo(target) {
      send({ type: 'goto-heading', id: target })
    },
    async goToFraction(f) {
      send({ type: 'goto-fraction', fraction: Math.min(1, Math.max(0, f)) })
    },
    next: () => send({ type: 'page', dir: 1 }),
    prev: () => send({ type: 'page', dir: -1 }),
    applyPrefs(p) {
      current = p
      send({ type: 'zoom', zoom: p.fontScale })
    },
    destroy() {
      cleanup()
      frame.remove()
    },
  }
}
