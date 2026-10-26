// 无浏览器环境下的前端冒烟测试：用最小 DOM 桩跑完 mount → 取数 → 渲染 → 开抽屉 → 五个标签页
import fs from 'fs'

const src = fs.readFileSync(process.argv[2], 'utf8')

function mkNode(tag) {
  const n = {
    tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], textContent: '',
    className: '', id: '', title: '', parentNode: null,
    classList: {
      add(c) { const s = new Set(n.className.split(/\s+/)); s.add(c); n.className = [...s].join(' ') },
      remove(c) { n.className = n.className.split(/\s+/).filter((x) => x && x !== c).join(' ') },
      contains(c) { return n.className.split(/\s+/).indexOf(c) >= 0 },
    },
    appendChild(c) { c.parentNode = n; n.children.push(c); return c },
    removeChild(c) { n.children = n.children.filter((x) => x !== c); return c },
    remove() { if (n.parentNode) n.parentNode.removeChild(n) },
    addEventListener(t, fn) { (n.__h = n.__h || {})[t] = fn },
    removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
    setAttribute(k, v) { n[k] = v }, getAttribute(k) { return n[k] },
    querySelector(sel) { return n.querySelectorAll(sel)[0] || null },
    querySelectorAll(sel) {
      const out = []
      const attr = /^\[([a-z-]+)\]$/.exec(sel)
      const walk = (x) => { for (const c of x.children) { if (attr && c[attr[1]] != null) out.push(c); walk(c) } }
      walk(n)
      out.forEach((c) => { c.parentNode = n })
      return out
    },
    contains(x) { let p = x; while (p) { if (p === n) return true; p = p.parentNode } return false },
  }
  // 真实浏览器会把 innerHTML 解析成子节点；这里用最小解析：把带 data-tab / data-act 的元素
  // 合成为子节点，否则 wire() 里的 querySelectorAll 什么都拿不到，标签页切换就测不了。
  let html = ''
  Object.defineProperty(n, 'innerHTML', {
    get: () => html,
    set(v) {
      html = String(v == null ? '' : v)
      n.children = n.children.filter((c) => !c.__synthetic)
      for (const m of html.matchAll(/data-(tab|act|acc)="([^"]+)"/g)) {
        const c = mkNode('span')
        c['data-' + m[1]] = m[2]
        c.__synthetic = true
        c.parentNode = n
        n.children.push(c)
      }
      // 设置页的控件是通过 innerHTML 写进去的，而产品代码用 getElementById 取它们。
      // 桩子必须把这些 id 也合成出来（带 value/checked），否则点"保存"会踩 null.value。
      for (const m of html.matchAll(/<(\w+)[^>]*id="([^"]+)"[^>]*>/g)) {
        const c = mkNode(m[1])
        c.id = m[2]
        const vm = /value="([^"]*)"/.exec(html.slice(m.index, m.index + 300))
        c.value = vm ? vm[1] : ''
        c.checked = /checked/.test(html.slice(m.index, m.index + 300))
        byId[m[2]] = c
      }
    },
  })
  return n
}
const byId = {}
const docListeners = {}
const document = {
  head: mkNode('head'), body: mkNode('body'), documentElement: mkNode('html'),
  createElement: mkNode,
  addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn) },
  removeEventListener() {}, activeElement: null,
  getElementById(id) { return byId[id] || null },
}
// 像浏览器那样向 document 派发事件（点外部关闭必须真派发才测得出来）
function fireDoc(type, target) {
  for (const fn of docListeners[type] || []) fn({ type, target })
}
const origAppend = document.body.appendChild
document.body.appendChild = function (c) { if (c.id) byId[c.id] = c; return origAppend.call(document.body, c) }

const STATE = {
  at: Date.now(), version: '0.1.5',
  monitor: {
    autoDetect: true,
    models: ['qwen3.8-flash', 'qwen3.8-max', 'qwen3.6-plus'],
    prices: { 'qwen3.8-flash': { input: 0.8, output: 2.7, cache: 0.1 },
              'qwen3.8-max': { input: 12, output: 36, cache: 1.5 } },
    source: { 'qwen3.8-flash': 'manual', 'qwen3.8-max': 'auto' },
    found: { profile: ['qwen3.8-max'], ledger: ['qwen3.6-plus'], quota: [] },
    catalog: { ok: true, count: 180, from: 'net', skipped: false, at: 0, error: '' },
  },
  today: { tokens: 1234567, input: 100, cache: 200, output: 300, calls: 5, money: '¥0.99', byModel: { 'qwen3.8-flash': { tokens: 1234567, input: 100, cache: 200, output: 300 } } },
  lastTurn: { seq: 3, at: '2026-10-20T10:00:00Z', input: 1, cache: 2, output: 3, model: 'qwen3.8-flash' },
  freeTier: {
    ok: true, account: { region: 'cn-beijing', site: 'domestic' },
    items: [
      { model: 'qwen3.8-max', total: 1000000, remain: 888888, used: 111112, remainPct: 88.9, expiresAt: '2099-12-31', autoStop: null, status: 'VALID' },
      { model: 'qwen3.8-flash', total: null, remain: null, remainPct: null, autoStop: 'unsupported', status: 'UNKNOWN' },
    ],
  },
  bss: {
    ok: true, errors: [],
    balance: { available: '0.00', availableCash: '0.00', credit: '0.00', quotaLimit: '0.00', mybankCredit: '0.00', currency: 'CNY' },
      hiddenVouchers: 3, hiddenNote: '另有 3 张满减券未计入（合成数据）',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             coupons: [{ no: '000000000000', name: '示例代金券（合成数据）', balance: '123.45', nominal: '300.00', currency: 'CNY', status: 'Available', daysLeft: 365, end: '2027-10-20T03:00:00Z', scope: '通用（不适用商品名单除外）' }],
  },
  tpm: { ok: true, total: 356, items: [{ model: 'qwen3.8-flash', usageLimit: 123456, usageField: 'total_tokens', usagePeriodSec: 6, requestLimit: null }] },
  config: { models: ['qwen3.8-flash'], prices: {}, bss: { enabled: true, idRef: 'BSS_ACCESS_KEY_ID' }, widget: {} },
  consoleLoggedIn: true, blPath: 'C:/x/bailian.mjs', priceConfigured: 0,
}
let posted = []
const fetch = (url, o) => {
  if (o && o.method === 'POST' && url.indexOf('config.json') >= 0) {
    try { posted.push(JSON.parse(o.body)) } catch (e) { posted.push({ __bad: o.body }) }
  }
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(url.indexOf('config.json') >= 0 ? { ok: true, config: STATE.config } : STATE),
  })
}
const win = { __DSH: false, addEventListener() {} }
const store = {}
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } }
const raf = (fn) => setTimeout(fn, 0)

const fn = new Function('window', 'document', 'fetch', 'localStorage', 'requestAnimationFrame', 'setInterval', src)
fn(win, document, fetch, localStorage, raf, () => 0)

let pass = 0, fail = 0
const ok = (label, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  PASS ' : '  FAIL ') + label + (extra ? ' → ' + extra : '')) }

const handle = document.body.children.find((c) => c.className.indexOf('dshbl-handle') >= 0)
const drawer = document.body.children.find((c) => c.className.indexOf('dshbl-drawer') >= 0)
const pill = document.body.children.find((c) => c.className.indexOf('dshbl-pill') >= 0)

setTimeout(() => {
  ok('三个外壳节点都挂上了', !!handle && !!drawer && !!pill)
  ok('默认是侧边栏模式（胶囊被隐藏）', pill.style.display === 'none' && handle.style.display !== 'none')
  ok('把手停在右边缘', /(^|\s)right(\s|$)/.test(handle.className), handle.className)
  ok('把手含状态点与竖排标签', /dshbl-hdot/.test(handle.innerHTML) && /百炼额度/.test(handle.innerHTML), handle.innerHTML.replace(/</g, '‹').slice(0, 140))
  ok('把手余额做成胶囊', /dshbl-hamt"><b>123<\/b><i>券/.test(handle.innerHTML), handle.innerHTML.replace(/</g, '‹').slice(0, 140))
  ok('把手显示免费额度百分比', /免88\.9%/.test(handle.innerHTML), handle.innerHTML)
  ok('未展开时把手不带 open 类', !/(\s|^)open(\s|$)/.test(handle.className), handle.className)
  ok('未展开时抽屉不带 open 类', !drawer.classList.contains('open'))

  handle.__h.click()
  setTimeout(() => {
    ok('点把手后抽屉进入 open', drawer.classList.contains('open'), drawer.className)
    ok('展开时把手退到低透明', /(\s|^)open(\s|$)/.test(handle.className), handle.className)
    ok('抽屉宽度已应用（默认 424）', drawer.style.width === '424px', String(drawer.style.width))
    // —— 回归：面板右上角绝不能与 Electron 窗口关闭键贴脸 ——
    ok('抽屉从 top:48px 起（避开窗口控件带）', src.includes('-drawer{position:fixed;top:48px'))
    // 原来靠「头部留 96px 空带」避让 Electron 窗口控件；现在抽屉整体从 top:48px 起、
    // 关闭按钮在抽屉内部，该不变量改由几何量实测把关（见 geom2.py 的 xBtn 检查）。
    ok('头部为关闭按钮预留了空间', /-hd\{[^}]*padding-right:/.test(src))
    // 数组里出现 `',,` 会造出空槽（join 后塞进 undefined 空行）；只查这一种真实笔误，
    // 不要用 \[\s*, 之类的宽泛式——它会误伤 /[,\s]+/ 这种正则字面量。
    ok('CSS 数组无空槽', !/',,/.test(src))
    // —— 用户反馈#3：关闭按钮挪到面板自己的右上角（抽屉 top:48px 已低于窗口控件带）——
    const actsBlock = (/dshbl-acts[\s\S]*?<\/div>/.exec(drawer.innerHTML) || [''])[0]
    ok('关闭按钮不在左侧动作组里', !/data-act="close"/.test(actsBlock), actsBlock.slice(0, 60))
    ok('关闭按钮在头部内', /dshbl-hd[\s\S]{0,900}data-act="close"/.test(drawer.innerHTML))
    // —— 用户反馈：菜单要有进场与出场动画 ——
    ok('抽屉关闭态不可命中指针（避免出场期间吞点击）',
      /-drawer\{[^}]*pointer-events:none/.test(src) && /-drawer\.open\{[^}]*pointer-events:auto/.test(src))
    ok('抽屉带透明度过渡（不只是位移）', /-drawer\{[^}]*opacity:0[^}]*transition:[^}]*opacity/.test(src))
    ok('内容区有延迟入场（错峰）',
      /-body\{[^}]*transition:[^}]*\.06s/.test(src) && /:not\(\.open\)[^]*?-body\{[^}]*opacity:0/.test(src))
    ok('面板用 keyframes（新建节点 transition 不触发）',
      /@keyframes dshbl-panel-in/.test(src) && /@keyframes dshbl-panel-out/.test(src) && /-panel\.closing/.test(src))
    // 同名 keyframes 会互相覆盖（实测：新加的面板动画曾把内容区换页的 dshbl-in 顶掉）
    const kf = (src.match(/@keyframes ([\w-]+)/g) || []).map((x) => x.replace('@keyframes ', ''))
    // 名字是从拼接来的（'@keyframes ' + P + '-in'），所以只能对渲染后的 CSS 断言，
    // 不能对源码 grep 完整类名（这条教训已经踩过五次）
    // 类名/关键帧名都是拼接出来的，grep 源码必然假阴性 —— 对**实际注入的 CSS** 断言
    const styleElA = document.head.children.find((c) => c.tagName === 'STYLE')
    const cssA = styleElA ? styleElA.textContent : ''
    const kf2 = (cssA.match(/@keyframes [\w-]+/g) || []).map((x) => x.replace('@keyframes ', ''))
    ok('实际 CSS 里没有重复 keyframes 名', new Set(kf2).size === kf2.length && kf2.length >= 3,
      'kf=' + kf2.join(','))
    ok('实际 CSS 含面板进出场关键帧',
      kf2.indexOf('dshbl-panel-in') >= 0 && kf2.indexOf('dshbl-panel-out') >= 0, 'kf=' + kf2.join(','))
    ok('内容区换页动画轨迹未被改动',
      /@keyframes dshbl-in\{from\{opacity:0;transform:translateY\(6px\)/.test(cssA), 'kf=' + kf2.join(','))
    ok('实际 CSS 里抽屉关闭态不可命中指针',
      /\.dshbl-drawer\{[^}]*pointer-events:none/.test(cssA) && /\.dshbl-drawer\.open\{[^}]*pointer-events:auto/.test(cssA),
      cssA.slice(0, 60))
    ok('降级动效偏好覆盖新动画', /prefers-reduced-motion[^]*animation:none/.test(src))
    ok('关闭按钮用 ✕ 图标', /data-act="close"[^>]*>[^<]*✕/.test(drawer.innerHTML) ||
      /✕[^<]*<\/span>/.test((/data-act="close"[\s\S]{0,80}/.exec(drawer.innerHTML) || [''])[0]))
    // —— Task 2：三行摘要替换四宫格 ——
    const dh = drawer.innerHTML
    ok('摘要三行都在', /dshbl-sum/.test(dh) && /今日/.test(dh) && /余额/.test(dh) && /免费/.test(dh), dh.slice(0, 60))
    ok('四宫格已移除', !/dshbl-hero/.test(dh) && !src.includes('-stat{'))
    // 旧断言查的是 '今日 token'，版式简化后文案变成 '今日'，必须同步改而不是删掉——
    // 否则这条回归就悄悄失效了（顺序仍是摘要在标签条之前）。
    ok('摘要排在标签条之前', dh.indexOf('今日') < dh.indexOf('实时用量'))
    ok('小节标题不再拖长横线', !src.includes('-sec:after'))
    ok('余额数字用强调色', /-sumrow b\.acc|class="acc"/.test(dh) || src.includes('-sum b.acc'))
    ok('抽屉有标题与标签栏', /额度与用量/.test(drawer.innerHTML) && /data-tab/.test(drawer.innerHTML))
    const tabs = drawer.querySelectorAll('[data-tab]')
    ok('五个标签页都在', ['live', 'free', 'tpm', 'bss', 'cfg'].every((t) => tabs.some((n) => n['data-tab'] === t)), tabs.length + ' 个')
    const seen = {}
    // 代码里是 `n.onclick = fn`，所以触发要点 onclick 属性（不是 addEventListener）
    for (const [want, kw] of [['free', 'qwen3.8-max'], ['tpm', '12.35 万'], ['bss', '示例代金券'], ['cfg', '显示方式'], ['live', '今日 token 合计']]) {
      drawer.innerHTML = ''
      const node = tabs.filter((n) => n['data-tab'] === want)[0]
      if (node && node.onclick) node.onclick()
      seen[want] = drawer.innerHTML
      ok('标签 ' + want + ' 渲染出内容且含「' + kw + '」', drawer.innerHTML.length > 200 && drawer.innerHTML.indexOf(kw) >= 0, drawer.innerHTML.length + ' 字符')
    }
    ok('券卡片含剩余与到期天数', /123\.45/.test(seen.bss) && /剩 365 天/.test(seen.bss))
    ok('满减券被隐藏时有如实说明', /满减券/.test(seen.bss) && /3 张/.test(seen.bss))
    ok('免费额度表含 UNKNOWN 档', /qwen3\.8-flash/.test(seen.free))
    // 回归：模型拆分必须走 5 列表格，用 kv 行会把 in/cache/out 挤成折行
    ok('模型拆分用 5 列表格（含「缓存读」表头）', /dshbl-g5/.test(seen.live) && /缓存读/.test(seen.live))
    ok('设置页含模式/停靠边/宽度控件', /dshbl-mode/.test(seen.cfg) && /dshbl-edge/.test(seen.cfg) && /dshbl-width/.test(seen.cfg))

    // —— Task 3：强调色预设与原生调色板 ——
    ok('设置页有 4 个预设色块', (seen.cfg.match(/data-acc=/g) || []).length === 4,
      '找到 ' + (seen.cfg.match(/data-acc=/g) || []).length + ' 个')
    ok('设置页有原生调色板', /type="color"/.test(seen.cfg) && /id="dshbl-acc"/.test(seen.cfg))
    drawer.innerHTML = ''
    tabs.filter((n) => n['data-tab'] === 'cfg')[0].onclick()
    const sw = drawer.querySelectorAll('[data-acc]')
    ok('预设节点可点击', sw.length === 4, String(sw.length))
    const styleEl0 = document.head.children.find((c) => c.tagName === 'STYLE')
    if (sw[1] && sw[1].onclick) sw[1].onclick()
    ok('点预设立刻换色', /--acc:#2fd4c4/i.test(styleEl0.textContent),
      (/--acc:[^;]*/i.exec(styleEl0.textContent) || ['(无)'])[0])
    const save = drawer.querySelectorAll('[data-act]').filter((n) => n['data-act'] === 'save')[0]
    // 顺手把 firstRun 也设成 wizard：同一次 save 就能同时证明 accent 与 firstRun 都写回配置
    const fr0 = byId['dshbl-firstrun']
    if (fr0) fr0.value = 'wizard'
    if (save && save.onclick) save.onclick()
    setTimeout(() => {
      const last = posted[posted.length - 1] || {}
      ok('保存把 accent 写进配置', last.widget && String(last.widget.accent).toLowerCase() === '#2fd4c4',
        JSON.stringify(last.widget || {}))
      ok('保存把 firstRun 写进配置', last.widget && last.widget.firstRun === 'wizard',
        JSON.stringify(last.widget || {}))
      ok('设置页有 firstRun 下拉', /id="dshbl-firstrun"/.test(seen.cfg))
      ok('保存不会丢掉已有的 mode/edge', last.widget && 'mode' in last.widget && 'edge' in last.widget,
        JSON.stringify(last.widget || {}))
    }, 40)

    // Esc 关闭
    handle.__h.click()
    setTimeout(async () => {
      ok('再点一次把手可收起', !drawer.classList.contains('open') && store['dshbl:open'] === '0', 'ls=' + store['dshbl:open'])

      // —— Task 1：单一强调色与可读性钳制 ——
      // widget 是 IIFE 不导出函数，所以只能重新挂载一次、读渲染出来的 <style> 文本。
      // 必须 await 一拍：accent 来自 config，要等 poll 的 promise 落地才会应用。
      const tick = (ms) => new Promise((r) => setTimeout(r, ms))
      async function accentText(accent) {
        // mount() 有幂等守卫 `if (handle.parentNode) return`，所以必须连 body 一起清空，
        // 否则重挂载被挡掉，head 里拿不到新的 <style>（踩过：只清 head，断言永远拿到空串）。
        document.head.children = []
        document.body.children = []
        const st = JSON.parse(JSON.stringify(STATE))
        if (accent) st.config.widget.accent = accent
        const f = new Function('window', 'document', 'fetch', 'localStorage', 'requestAnimationFrame', 'setInterval', src)
        // widget 顶部有单例守卫 `if (window.__DSH_BAILIAN_BALANCE__) return`（防重复注入，
        // 是正确行为），所以重挂载必须换一个全新的 window 对象，否则第二次 eval 直接 return。
        const freshWin = { __DSH: false, addEventListener() {} }
        f(freshWin, document, () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(st) }), localStorage, raf, () => 0)
        await tick(20)
        const el = document.head.children.find((c) => c.tagName === 'STYLE')
        return el ? el.textContent : ''
      }
      const accOf = (t) => { const m = /--acc:(#[0-9a-f]{6})/i.exec(t); return m ? m[1].toLowerCase() : '' }

      const t0 = await accentText(null)
      ok('默认强调色是天蓝', accOf(t0) === '#4fa8ff', 'acc=' + accOf(t0))
      const t1 = await accentText('#0a0a0a')
      ok('近黑自选色被提亮', accOf(t1) !== '#0a0a0a' && accOf(t1).length === 7, 'acc=' + accOf(t1))
      const t2 = await accentText('#ffffff')
      ok('近白自选色被压暗', accOf(t2) !== '#ffffff' && accOf(t2).length === 7, 'acc=' + accOf(t2))

      // —— Task 4：A/B 两种上手模式（需要按配置重挂载并展开抽屉）——
      async function openWith(cfgWidget, mutate) {
        document.head.children = []
        document.body.children = []
        const st = JSON.parse(JSON.stringify(STATE))
        Object.assign(st.config.widget, cfgWidget || {})
        if (mutate) mutate(st)
        const f = new Function('window', 'document', 'fetch', 'localStorage', 'requestAnimationFrame', 'setInterval', src)
        const w = { __DSH: false, addEventListener() {} }
        f(w, document, () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(st) }), localStorage, raf, () => 0)
        await tick(20)
        // 上一次挂载会把 dshbl:open 写进桩子的 localStorage，于是这次挂载可能"本来就是开的"，
        // 再点把手反而把它关掉（实测踩到）。所以只在未展开时才点。
        const d0 = document.body.children.find((c) => /dshbl-drawer/.test(c.className))
        if (d0 && !d0.classList.contains('open')) {
          const h = document.body.children.find((c) => /dshbl-handle/.test(c.className))
          if (h && h.__h && h.__h.click) h.__h.click()
          await tick(20)
        }
        const d = document.body.children.find((c) => /dshbl-drawer/.test(c.className))
        return d ? d.innerHTML : ''
      }
      // 默认 STATE 四路全通，引导本就不该出现（那条断言已单独验证）。
      // A/B 用例必须造一个"有未配置项"的状态，否则测的是"没有引导"这个正确行为。
      const unready = (st) => {
        st.bss = { ok: false, errors: [], coupons: [], balance: {} }
        st.freeTier = { ok: false, code: 'NO_CONSOLE_LOGIN', items: [] }
      }
      const aMode = await openWith({}, unready)
      ok('A 模式只有一行轻提示', /dshbl-ob/.test(aMode) && !/dshbl-wiz/.test(aMode), aMode.slice(0, 40))
      const bMode = await openWith({ firstRun: 'wizard' }, unready)
      ok('B 模式渲染三步向导', /dshbl-wiz/.test(bMode) && (bMode.match(/dshbl-step/g) || []).length === 3,
        'steps=' + (bMode.match(/dshbl-step/g) || []).length)
      ok('向导有跳过按钮', /data-act="obskip"/.test(bMode))
      // —— 用户反馈#2：RAM 权限要给明确的操作路径与提醒 ——
      ok('向导第2步含具体 RAM 操作路径', /访问控制|RAM/.test(bMode) && /添加权限|新增授权/.test(bMode) &&
        /AliyunBSSReadOnlyAccess/.test(bMode))
      ok('向导第2步说明密钥只显示一次', /只显示一次|仅显示一次|立即保存/.test(bMode))
      // —— 用户反馈#1 收尾：自动发现失败时能在设置里手填凭据名 ——
      ok('设置页有 API Key 凭据名字段', /id="dshbl-keyref"/.test(seen.cfg))
    // —— 用户反馈：模型与单价自动识别，且可由使用者决定是否检测 ——
    ok('设置页有自动识别开关', /id="dshbl-auto"/.test(seen.cfg) && /自动识别/.test(seen.cfg))
    ok('设置页标出模型来源（自动/手动）', /手动|自动/.test(seen.cfg) && /qwen3\.8-max/.test(seen.cfg))
    ok('实时用量显示监控范围', /监控 \d+ 个模型/.test(seen.live), seen.live.slice(0, 60))
      ok('数据仍在向导之下', bMode.indexOf('dshbl-wiz') < bMode.indexOf('dshbl-sum'))
      const src0 = await openWith({}, (st) => { st.consoleLoggedIn = true })
      ok('全部就绪时不再显示引导', !/dshbl-ob|dshbl-wiz/.test(src0), src0.slice(0, 40))
      const exp = await openWith({ firstRun: 'wizard' }, (st) => { st.freeTier = { ok: false, code: 'CONSOLE_TOKEN_EXPIRED', items: [] } })
      ok('token 失效提示重新粘贴', /重新粘贴/.test(exp) && !/undefined|NaN/.test(exp))
      const srcf = await openWith({ firstRun: 'wizard' }, (st) => {
        st.bss = { ok: false, errors: [], coupons: [], balance: {} }
        st.freeTier = { ok: true, source: 'pasted', items: [] }
      })
      ok('向导显示凭据来源', /粘贴/.test(srcf))
      ok('config 缺 firstRun 时不崩', /dshbl-ob/.test(aMode) && /今日/.test(aMode))
      ok('强调色派生出 hi/lo/透明档', /--acc-hi:/.test(t0) && /--acc-lo:/.test(t0) && /--acc-12:/.test(t0) && /--acc-40:/.test(t0))
      // 用正则而不是 includes('--y:')，否则漏掉 --y-lo: / --y28: 这类变体会把"没删干净"误判成通过
      ok('CSS 里不再引用 --y 系列', !/--y[a-z0-9-]*\s*[:(]/.test(src))

      // firstRun 的写回已由上面 Task 3 的 save 断言覆盖（同一次点击同时验 accent 与 firstRun）。

      // —— 用户反馈#4：点面板外区域快速关闭 ——
      await openWith({})
      const d3 = document.body.children.find((c) => /dshbl-drawer/.test(c.className))
      const h3 = document.body.children.find((c) => /dshbl-handle/.test(c.className))
      ok('抽屉处于展开态', d3 && d3.classList.contains('open'), d3 ? d3.className : '(无)')
      const inside = mkNode('span'); inside.parentNode = d3
      fireDoc('pointerdown', inside)
      ok('点面板内不误关', d3.classList.contains('open'), d3.className)
      fireDoc('pointerdown', h3)
      ok('点把手不误关', d3.classList.contains('open'), d3.className)
      fireDoc('pointerdown', mkNode('div'))
      ok('点面板外关闭抽屉', !d3.classList.contains('open'), d3.className)

      // —— 出场动画：先播动画，放完再清空内容 ——
      await openWith({})
      const d4 = document.body.children.find((c) => /dshbl-drawer/.test(c.className))
      const act = (name) => {
        const n = (d4.querySelectorAll('[data-act]') || []).filter((x) => x['data-act'] === name)[0]
        if (n && n.onclick) n.onclick()
        return !!n
      }
      ok('展开态有内容', /dshbl-hd/.test(d4.innerHTML), 'len=' + (d4.innerHTML || '').length)
      ok('找到关闭按钮', act('close'))
      ok('关闭后 open 类已摘掉', !d4.classList.contains('open'), d4.className)
      ok('出场期间内容还在（不是滑出空盒子）', /dshbl-hd/.test(d4.innerHTML),
        'innerHTML 长度=' + (d4.innerHTML || '').length)
      await new Promise((r) => setTimeout(r, 600))
      ok('动画放完后内容被清空', !/dshbl-hd/.test(d4.innerHTML), '残留=' + (d4.innerHTML || '').slice(0, 40))

      // 出场中途重新展开：应取消出场，不能被定时器清掉
      await openWith({})
      const d5 = document.body.children.find((c) => /dshbl-drawer/.test(c.className))
      const act5 = (name) => {
        const n = (d5.querySelectorAll('[data-act]') || []).filter((x) => x['data-act'] === name)[0]
        if (n && n.onclick) n.onclick()
      }
      act5('close')
      ok('再次进入出场态', !d5.classList.contains('open') && /dshbl-hd/.test(d5.innerHTML), d5.className)
      // 把手的 click 是 addEventListener 挂的（bindDrag 里），桩子里点不到；
      // 胶囊是 pill.onclick = toggle，走它来触发同一个 setOpen 路径
      const p5 = document.body.children.find((c) => /dshbl-pill/.test(c.className))
      ok('找到可触发的开关（胶囊 onclick）', !!(p5 && p5.onclick))
      p5.onclick()
      ok('出场中途重开：open 回来且有内容', d5.classList.contains('open') && /dshbl-hd/.test(d5.innerHTML),
        'innerHTML=' + (d5.innerHTML || '').slice(0, 40))
      await new Promise((r) => setTimeout(r, 600))
      ok('重开后旧定时器不会清空内容', /dshbl-hd/.test(d5.innerHTML), '被误清空')

      console.log('\n' + pass + ' passed, ' + fail + ' failed')
      process.exit(fail ? 1 : 0)
    }, 30)
  }, 30)
}, 60)
