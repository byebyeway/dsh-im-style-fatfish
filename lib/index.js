/**
 * dsh-im-style-fatfish — 宿主半侧。
 *
 * 只做两件事：
 *   1. GET  /dsh-fatfish/face/<id>     把表情图交给浏览器（本地图库 → 已装 dsh-meme → CDN 302）
 *   2. POST /dsh-fatfish/classify      用一次小模型调用，把「这一轮的结果」映射成 12 个表情之一
 *
 * 判定规则只有两条：运行中固定 think；轮次结束后由这里调用模型选一个。
 * 浏览器半侧（lib/client.js）负责头像/气泡和两态切换。
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-im-style-fatfish'
// 只硬依赖 webServer；llm / agentDefaultModel 在调用时懒取，缺了也不影响插件加载
export const inject = ['webServer']

const here = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(here, '..', 'assets', 'faces')
const ROUTE = '/dsh-fatfish'

/** 表情 id（顺序即轮盘顺序） */
export const FACES = [
  'hello', 'think', 'work', 'slack', 'talk', 'rice',
  'proud', 'tsun', 'fuzz', 'boom', 'dead', 'broke',
]

/** id → dsh-meme 内置大肥鱼图库里的相对路径 */
export const FACE_FILES = {
  hello: 'morning/zaoshanghao.jpg',
  think: 'confused/jiazai.jpg',
  work: 'cpu/jiaban.jpg',
  slack: 'work/tangping.jpg',
  talk: 'happy/ok.jpg',
  rice: 'daily/ganfan.jpg',
  proud: 'happy/deyi.jpg',
  tsun: 'shy/haixiu.jpg',
  fuzz: 'angry/shengqi.jpg',
  boom: 'sad/yun.jpg',
  dead: 'sleep/shuijiao.jpg',
  broke: 'givemoney/yaoqian.jpg',
}

const CDN_BASE = 'https://unpkg.com/dsh-meme@0.1.60/memes/dafeiyu-001/memes/'

const DEFAULTS = {
  /** 分类用的模型；留空 = 跟随当前会话模型 */
  classifierModel: '',
  /** 送给分类模型的正文上限（字符） */
  maxChars: 1200,
  /** 宿主侧超时（毫秒）；客户端另有自己的超时 */
  timeoutMs: 2500,
  /** 分类缓存条数 */
  cacheSize: 500,
  /** 'llm' | 'off'：off 时永远返回 rice，不调模型 */
  classifier: 'llm',
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/** 只接受本机回环请求（防 DNS rebinding），与 dsh-meme 的判据一致 */
export function isLoopbackHost (req) {
  const raw = String((req && req.headers && req.headers.host) || '')
  if (!raw) return true
  const name = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
  return LOOPBACK.has(name.toLowerCase())
}

export function buildPrompt (text, status) {
  return [
    '你是「大肥鱼」的表情选择器。根据回复内容和本轮状态，从下面 id 里选最贴的一个，只输出 id，不要解释、不要标点。',
    'hello 打招呼 / think 思考犹豫 / work 加班干活 / slack 摸鱼拖延 / talk 正在说话',
    'rice 干饭满足 / proud 得意交付 / tsun 傲娇嘴硬 / fuzz 生气翻车 / boom 过载爆炸',
    'dead 装死中断 / broke 讨钱额度不足',
    '',
    '判断提示：正常完成选 rice；交付文件或长回答选 proud；很短或敷衍选 tsun；明显报错选 fuzz；',
    '额度不足选 broke；被中断选 dead；超时/重试选 slack；其余选 rice。',
    '',
    '本轮状态：' + status,
    '回复正文：' + text,
  ].join('\n')
}

/** 从模型输出里抠出第一个合法 id；抠不到返回 null */
export function parseFace (value) {
  const s = String(value || '').toLowerCase()
  for (const face of FACES) {
    if (new RegExp('(^|[^a-z])' + face + '([^a-z]|$)').test(s)) return face
  }
  return null
}

export function apply (ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config || {}) }
  const cache = new Map()
  const inflight = new Map()

  const webServer = ctx.webServer ?? (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined)
  if (!webServer || typeof webServer.register !== 'function') {
    console.warn('[fatfish] webServer 不可用，插件不启用')
    return
  }

  const hit = (key) => {
    const value = cache.get(key)
    if (value === undefined) return undefined
    cache.delete(key)
    cache.set(key, value) // LRU：命中后挪到队尾
    return value
  }
  const put = (key, value) => {
    cache.set(key, value)
    while (cache.size > Math.max(16, Number(cfg.cacheSize) || 500)) {
      cache.delete(cache.keys().next().value)
    }
  }

  const handler = async (req, res) => {
    if (!isLoopbackHost(req)) return sendJson(res, { ok: false, error: 'loopback only' }, 403)
    const url = new URL(String(req.url || '/'), 'http://127.0.0.1')
    const path = url.pathname.startsWith(ROUTE) ? url.pathname.slice(ROUTE.length) : ''

    if (path === '/health') {
      return sendJson(res, { ok: true, faces: FACES, classifier: cfg.classifier })
    }

    if (path.startsWith('/face/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, { ok: false }, 405)
      return await serveFace(req, res, path.slice('/face/'.length).replace(/\.(jpg|jpeg|png|webp|gif)$/i, ''))
    }

    if (path === '/classify') {
      if (req.method !== 'POST') return sendJson(res, { ok: false }, 405)
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return sendJson(res, { id: 'rice', fallback: true, error: 'bad body' })
      }
      const text = String(body.text || '').slice(0, Math.max(0, Number(cfg.maxChars) || 1200))
      const status = String(body.status || '成功').slice(0, 200)
      if (!text.trim()) return sendJson(res, { id: 'rice', fallback: true, reason: 'empty' })
      if (cfg.classifier === 'off') return sendJson(res, { id: 'rice', fallback: true, reason: 'off' })

      const key = createHash('sha1').update(text + '\n' + status).digest('hex')
      const cached = hit(key)
      if (cached) return sendJson(res, { id: cached, cached: true })

      try {
        if (!inflight.has(key)) {
          inflight.set(key, classifyWithLlm(ctx, text, status, cfg))
        }
        const id = await withTimeout(inflight.get(key), Math.max(500, Number(cfg.timeoutMs) || 2500))
        put(key, id)
        return sendJson(res, { id, cached: false })
      } catch (error) {
        return sendJson(res, {
          id: 'rice',
          fallback: true,
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        inflight.delete(key)
      }
    }

    return sendJson(res, { ok: false, error: 'not found' }, 404)
  }

  async function serveFace (req, res, rawId) {
    const id = FACES.includes(rawId) ? rawId : 'rice'

    // 1) 插件自带的 assets/faces/<id>.(webp|jpg|png)
    for (const ext of ['.webp', '.jpg', '.jpeg', '.png']) {
      const file = join(assetsDir, id + ext)
      if (existsSync(file)) return sendFile(res, file)
    }

    // 2) 已安装的 dsh-meme 内置图库
    const memeFile = localMemeFace(id)
    if (memeFile) return sendFile(res, memeFile)

    // 3) 都没有：让浏览器去 CDN 取（离线时会退化成占位底色）
    res.writeHead(302, { location: CDN_BASE + FACE_FILES[id], 'cache-control': 'no-store' })
    res.end()
  }

  ctx.effect(
    () => webServer.register({ kind: 'prefix', path: ROUTE, handler }),
    'fatfish: routes',
  )
  console.log('[fatfish] routes ready at ' + ROUTE)
}

/** 在 profile 的 node_modules 里找已安装的 dsh-meme 包 */
function localMemeFace (id) {
  try {
    const req = createRequire(import.meta.url)
    const pkg = req.resolve('dsh-meme/package.json')
    const file = join(dirname(pkg), 'memes', 'dafeiyu-001', 'memes', FACE_FILES[id])
    return existsSync(file) ? file : null
  } catch {
    return null
  }
}

async function classifyWithLlm (ctx, text, status, cfg) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  if (!llm || typeof llm.resolveCallConfig !== 'function') throw new Error('llm service unavailable')

  const selection = typeof ctx.get === 'function'
    ? ctx.get('agentDefaultModel')?.currentSelection?.()
    : undefined
  if (!selection || !selection.provider || !selection.model) throw new Error('no model selected')

  const model = String(cfg.classifierModel || selection.model)
  const base = await llm.resolveCallConfig({ provider: selection.provider, model, maxTokens: 24 })
  const prepared = await llm.prepareCall(base)

  let out = ''
  let reasoning = ''
  for await (const chunk of prepared.stream({
    ...base,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(text, status) }] }],
  })) {
    if (chunk.type === 'text-delta') out += chunk.text
    else if (chunk.type === 'reasoning-delta') reasoning += chunk.text
    else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
      throw new Error('model call failed')
    }
  }

  return parseFace(out) || parseFace(reasoning) || 'rice'
}

function withTimeout (promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('classify timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function readBody (req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 256 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function sendFile (res, file) {
  try {
    const data = await readFile(file)
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': String(data.length),
      'cache-control': 'public, max-age=86400',
    })
    res.end(data)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  }
}

function sendJson (res, value, code = 200) {
  const body = JSON.stringify(value)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
  })
  res.end(body)
}
