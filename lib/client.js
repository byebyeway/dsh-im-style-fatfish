/**
 * dsh-im-style-fatfish — 浏览器半侧。
 *
 * 两条规则：
 *   running  → think（思考）
 *   closed   → 问宿主 /dsh-fatfish/classify，由模型从 12 个 id 里选一个
 *
 * 只剩一件事需要它做：把结果写成行上的 data-dfy-face，样式全在 CSS 里。
 */
window.__ModuleLoader__.load({
  id: 'dsh-im-style-fatfish',
  factory: (require) => {
    const React = require('react')
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const inject = ['slots', 'sessions', 'uiConversation']
    const FACES = [
      'hello', 'think', 'work', 'slack', 'talk', 'rice',
      'proud', 'tsun', 'fuzz', 'boom', 'dead', 'broke',
    ]
    const DEFAULTS = { classifier: 'llm', maxChars: 1200, timeoutMs: 2500 }

    const CSS = [
      ':root{--dfy-size:64px;--dfy-gap:14px;--dfy-ring:var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
      // 窄屏：头像在正文左侧（IM 常见排法），正文让 56px
      '[data-dfy-row="assistant"]{position:relative;padding:22px 10px 8px 56px;--dfy-face:url("/dsh-fatfish/face/rice");',
      'border-radius:12px;transition:background-color .12s linear}',
      '[data-dfy-row="assistant"]:hover{background:var(--dsw-alias-interactive-bg-hover,transparent)}',
      '[data-dfy-row="assistant"]::before{content:"";position:absolute;left:8px;top:8px;',
      'width:44px;height:44px;border-radius:50%;',
      'background-color:#dfe8ff;background-image:var(--dfy-face);background-size:cover;',
      'background-position:center;box-shadow:0 0 0 1px var(--dfy-ring);transition:background-image .12s linear}',
      '[data-dfy-row="assistant"]::after{content:"大肥鱼";position:absolute;left:56px;top:8px;',
      'font-size:12px;line-height:1;color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      // 宽屏：头像挂到对话栏左侧外面（空白区），正文一点不让位
      '@media (min-width:1112px){',
      '[data-dfy-row="assistant"]{padding:26px 12px 10px 6px}',
      '[data-dfy-row="assistant"]::before{left:calc(-1 * (var(--dfy-size) + var(--dfy-gap)));top:0;',
      'width:var(--dfy-size);height:var(--dfy-size)}',
      '[data-dfy-row="assistant"]::after{left:6px;top:4px;font-size:13px}',
      '}',
      '[data-dfy-face="hello"]{--dfy-face:url("/dsh-fatfish/face/hello")}',
      '[data-dfy-face="think"]{--dfy-face:url("/dsh-fatfish/face/think")}',
      '[data-dfy-face="work"]{--dfy-face:url("/dsh-fatfish/face/work")}',
      '[data-dfy-face="slack"]{--dfy-face:url("/dsh-fatfish/face/slack")}',
      '[data-dfy-face="talk"]{--dfy-face:url("/dsh-fatfish/face/talk")}',
      '[data-dfy-face="rice"]{--dfy-face:url("/dsh-fatfish/face/rice")}',
      '[data-dfy-face="proud"]{--dfy-face:url("/dsh-fatfish/face/proud")}',
      '[data-dfy-face="tsun"]{--dfy-face:url("/dsh-fatfish/face/tsun")}',
      '[data-dfy-face="fuzz"]{--dfy-face:url("/dsh-fatfish/face/fuzz")}',
      '[data-dfy-face="boom"]{--dfy-face:url("/dsh-fatfish/face/boom")}',
      '[data-dfy-face="dead"]{--dfy-face:url("/dsh-fatfish/face/dead")}',
      '[data-dfy-face="broke"]{--dfy-face:url("/dsh-fatfish/face/broke")}',
      '@media (prefers-reduced-motion:reduce){[data-dfy-row="assistant"]::before{transition:none}}',
    ].join('')

    let pluginCtx = null
    let config = { ...DEFAULTS }

    function installStyles () {
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-im-style-fatfish'
      style.textContent = CSS
      document.head.appendChild(style)
      return () => style.remove()
    }

    /** 头像宿主：挂在输入框统计条里，渲染一个隐藏节点用来定位会话 DOM */
    function AvatarHost (props) {
      const ref = React.useRef(null)
      const sessionId = props.sessionId

      React.useEffect(() => {
        const el = ref.current
        if (!el || !sessionId) return undefined
        const scope = el.closest('[data-slot="conversation.session"]') || document.body
        let decorator
        try {
          decorator = createDecorator(scope, sessionId)
        } catch (error) {
          console.warn('[fatfish] decorator init failed:', error)
          return undefined
        }
        return () => decorator.dispose()
      }, [sessionId])

      return React.createElement('span', { ref, hidden: true, 'data-dfy-host': '' })
    }

    function apply (ctx, cfg) {
      pluginCtx = ctx
      config = { ...DEFAULTS, ...(cfg || {}) }
      ctx.effect(installStyles, 'fatfish: styles')
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'im-style-fatfish-host',
        inject: (sessionId) => ({ sessionId }),
      }, AvatarHost))
    }

    exports.apply = apply
    exports.inject = inject

    // ------------------------------------------------------------------ //

    function createDecorator (scope, sessionId) {
      const chat = resolveChat(sessionId)
      const faces = new Map()        // nodeKey -> face（本轮已定）
      const attempted = new Set()    // nodeKey -> 已请求过，避免重复
      let raf = 0
      let busy = false
      let dirty = false
      let disposed = false
      let unsubscribe = null

      if (chat && typeof chat.subscribe === 'function') {
        try {
          unsubscribe = chat.subscribe(() => schedule())
        } catch { /* 订阅失败就只靠 DOM 变化 */ }
      }

      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'childList') {
            if (record.addedNodes.length) schedule()
          } else if (record.target && record.target.nodeType === 1) {
            schedule()
          }
        }
      })
      observer.observe(scope, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-streaming', 'data-chat-flow-kind', 'data-turn-process-hidden', 'hidden'],
      })

      schedule()

      return {
        dispose () {
          disposed = true
          observer.disconnect()
          if (unsubscribe) { try { unsubscribe() } catch { /* noop */ } }
          if (raf) cancelAnimationFrame(raf)
          scope.querySelectorAll('[data-dfy-row]').forEach((row) => {
            delete row.dataset.dfyRow
            delete row.dataset.dfyFace
          })
        },
      }

      function schedule () {
        if (disposed) return
        if (busy) { dirty = true; return }
        if (raf) return
        raf = requestAnimationFrame(() => { raf = 0; void flush() })
      }

      async function flush () {
        if (disposed || busy) return
        busy = true
        try {
          const snap = snapshot()
          const latest = latestTurn(snap)
          const rows = scope.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
          for (const row of rows) {
            if (!row.isConnected) continue
            if (row.hasAttribute('data-turn-process-hidden') || row.hidden) continue
            if (row.dataset.chatGroupPart === 'reasoning') continue
            if (!row.textContent || !row.textContent.trim()) continue
            row.dataset.dfyRow = 'assistant'
            const key = row.dataset.chatNodeKey || ''
            if (!key) continue
            const face = await faceOf(row, key, snap, latest)
            if (disposed) return
            if (faces.get(key) === face) continue
            faces.set(key, face)
            row.dataset.dfyFace = face
          }
        } catch (error) {
          console.warn('[fatfish] flush failed:', error)
        } finally {
          busy = false
          if (dirty && !disposed) {
            dirty = false
            schedule()
          }
        }
      }

      function snapshot () {
        if (!chat) return null
        try {
          return chat.getSnapshot() || null
        } catch {
          return null
        }
      }

      async function faceOf (row, key, snap, latest) {
        // chat target 的 snapshot 形如 { order, nodes, locations, navigation, timeline, legacy }
        const node = snap?.nodes?.get?.(key)
        const data = node && node.data
        if (data && data.status === 'running') return 'think'
        if (!node) return row.querySelector('[data-streaming]') ? 'think' : 'rice'

        const text = nodeText(node, row).slice(0, Math.max(0, Number(config.maxChars) || 1200))
        if (!text.trim()) return 'rice'
        const status = statusOf(node, row, snap)
        const cacheKey = hash(text + '\n' + status)
        const cached = cacheGet(cacheKey)
        if (cached) return cached
        if (config.classifier === 'off') return 'rice'
        // 历史消息不补判；拿不到轮次时不拦
        if (latest !== null && Number(row.dataset.chatTurn) !== latest) return 'rice'
        if (attempted.has(key)) return 'think'
        attempted.add(key)
        const id = await requestFace(text, status)
        if (id !== 'rice') cacheSet(cacheKey, id)
        return id
      }

      function statusOf (node, row, snap) {
        const data = node && node.data
        if (data && (data.interrupted === true || data.status === 'interrupted')) return '中断'
        const turn = snap?.timeline?.turns?.get?.(Number(row.dataset.chatTurn))
        const turnData = turn && turn.data
        const get = turnData && typeof turnData.get === 'function' ? (k) => turnData.get(k) : () => undefined
        const error = get('turn-error')
        if (error) return '报错: ' + (error.code || error.message || 'error')
        if (get('turn-max-tokens')) return '超时/超限'
        if (get('model-retry')) return '重试'
        return '成功'
      }
    }

    function resolveChat (sessionId) {
      try {
        const binding = pluginCtx.sessions.binding(sessionId)
        if (!binding) return null
        return pluginCtx.uiConversation.binding(binding).target('chat') || null
      } catch {
        return null
      }
    }

    function nodeText (node, row) {
      const blocks = Array.isArray(node && node.data && node.data.blocks) ? node.data.blocks : []
      const text = blocks
        .filter((block) => block && block.kind === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
      return text || (row && row.textContent) || ''
    }

    function latestTurn (snap) {
      const turns = snap && snap.timeline && snap.timeline.turns
      if (!turns || typeof turns.keys !== 'function') return null
      let max = null
      for (const key of turns.keys()) {
        const n = Number(key)
        if (Number.isFinite(n) && (max === null || n > max)) max = n
      }
      return max
    }

    async function requestFace (text, status) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(500, Number(config.timeoutMs) || 2500))
      try {
        const res = await fetch('/dsh-fatfish/classify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, status }),
          signal: controller.signal,
        })
        const data = await res.json()
        return FACES.includes(data && data.id) ? data.id : 'rice'
      } catch {
        return 'rice'
      } finally {
        clearTimeout(timer)
      }
    }

    // 分类缓存：localStorage + 内存，刷新后不重复买单
    const STORE_KEY = 'dsh-im-style-fatfish:faces:v1'
    let memory = null

    function cache () {
      if (memory) return memory
      memory = {}
      try {
        const raw = window.localStorage.getItem(STORE_KEY)
        if (raw) memory = JSON.parse(raw) || {}
      } catch { /* 隐私模式 */ }
      return memory
    }

    function cacheGet (key) {
      const value = cache()[key]
      return FACES.includes(value) ? value : null
    }

    function cacheSet (key, id) {
      const store = cache()
      store[key] = id
      const keys = Object.keys(store)
      if (keys.length > 200) {
        for (const old of keys.slice(0, keys.length - 200)) delete store[old]
      }
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
      } catch { /* 存不下就算了 */ }
    }

    function hash (value) {
      let h = 5381
      for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) | 0
      return (h >>> 0).toString(36)
    }

    return module.exports
  },
})
