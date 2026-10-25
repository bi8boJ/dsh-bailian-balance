// 可选实机检查：用假的 root/ctx 驱动真实插件模块，验证注入行、栅栏、四个数据源、配置读写。
//
// 注意：这个脚本会**向阿里云发真实请求**，并需要本机 ~/.dsh/.credentials.yaml 里有
// ALIYUN_DASHSCOPE_API_KEY。它不是单元测试，因此**不在 test/run-all.mjs 与 CI 里跑**。
// 用法：node test/live-check.mjs   （没凭据时会整体跳过并返回 0）
import fs from 'fs'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import { pathToFileURL, fileURLToPath } from 'url'

// 从本文件位置推导，别写死绝对路径 —— 写死的话别人 clone 下来第一步就跑不了
const SRC = fileURLToPath(new URL('../lib/index.js', import.meta.url))
// 凭据文件不存在是常态（新机器 / 没配过百炼），必须先判断再读：
// 原来这里直接 readFileSync，会在下面那句「没凭据就跳过」生效之前抛 ENOENT 崩掉，
// 和文档承诺的"没凭据整体跳过返回 0"正好相反。
// 默认隔离 DSH_HOME：否则它会读调用者真实的 ~/.dsh/bailian-balance/config.json，
// 断言就跟着作者账号的状态漂移（实测：作者开了 BSS 之后「未启用应为 DISABLED」必红）。
// 要看真实状态请自己设 DSH_HOME 再跑。
// 不能靠「DSH_HOME 没设」来判断要不要隔离：宿主会给子进程注入 DSH_HOME 指向真实 ~/.dsh
// （实测：宿主会给工具进程注入 DSH_HOME 指向真实 ~/.dsh），那样隔离永远不生效，
// 断言就会读到你真实的 bailian-balance/config.json 而随账号状态漂移。
// 所以默认强制隔离，只有显式 DSHBL_USE_REAL_HOME=1 才用真实配置。
if (!process.env.DSHBL_USE_REAL_HOME) {
  process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbl-livecheck-'))
}
const CRED = path.join(os.homedir(), '.dsh', '.credentials.yaml')
const key = fs.existsSync(CRED)
  ? ((fs.readFileSync(CRED, 'utf8').match(/^ {2}ALIYUN_DASHSCOPE_API_KEY: (.+)$/m) || [])[1])
  : null

// 隔离真实的 ~/.bailian：否则用户一旦登录过 bl，第 4 步「未登录」断言就会被真凭据打破。
// 第 7 步会把该变量改指向一个伪造凭据目录。
// 输出打码：真实响应里带账号标识（workspace id 等），贴日志时容易顺手带出去
const _log = console.log
console.log = function () {
  var a = Array.prototype.slice.call(arguments).map(function (x) {
    return typeof x === 'string' ? x.replace(/ws-[a-z0-9]{8,}/gi, 'ws-<redacted>') : x
  })
  return _log.apply(console, a)
}
if (!key) {
  console.log('跳过 live-check：本机没有 ALIYUN_DASHSCOPE_API_KEY。\n'
    + '  这个脚本会向阿里云发真实请求，所以没凭据时不跑；离线测试请用 node test/run-all.mjs')
  process.exit(0)
}
const EMPTY_BAILIAN = path.join(process.env.DSH_HOME || os.tmpdir(), 'no-bailian')
fs.mkdirSync(EMPTY_BAILIAN, { recursive: true })
process.env.BAILIAN_CONFIG_DIR = EMPTY_BAILIAN

const rows = [], routes = new Map(), listeners = new Map()
const root = {
  effect() {},
  on(evt, cb) { if (evt === 'webserver/index-inject') rows.push(cb); listeners.set(evt, cb); return () => {} },
  inject(_deps, cb) { cb(ctx) },
}
let fenceSays
const ctx = {
  get(n) { return n === 'connection' ? conn : n === 'sessionTitle' ? null : null },
  connection: null,
  credentials: {
    async resolve(ref) {
      if (ref === 'ALIYUN_DASHSCOPE_API_KEY' && key) return { value: key }
      const err = new Error('no credential ' + ref); throw err
    },
    async set(ref, val) { ctx.__set = ctx.__set || []; ctx.__set.push([ref, val.length + ' chars']) },
  },
  webServer: {
    register(r) { routes.set(r.path, r.handler); return () => routes.delete(r.path) },
  },
  on(evt, cb) { listeners.set(evt, cb); return () => {} },
}
const conn = { requestRejection: (req) => fenceSays }; ctx.connection = conn

const mod = (await import(pathToFileURL(SRC).href)).default
mod.apply(root)

function mkReq(o) {
  const e = new EventEmitter()
  return Object.assign(e, { method: 'GET', headers: { host: '127.0.0.1:50609' }, url: '/' }, o)
}
function mkRes() {
  // 真 http.ServerResponse：deny() 直接赋 statusCode，writeHead 也写 statusCode
  const r = { statusCode: 200, body: '', writeHead(c, h) { this.statusCode = c; this.headers = h }, end(s) { this.body = s || '' } }
  return r
}
async function call(p, o, bodyObj) {
  const req = mkReq(o || {}), res = mkRes()
  const s = bodyObj ? JSON.stringify(bodyObj) : null
  setImmediate(() => { if (s) req.emit('data', s); req.emit('end') })
  await routes.get(p)(req, res)
  return res
}

let pass = 0, fail = 0
const ok = (label, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  PASS ' : '  FAIL ') + label + (extra ? ' → ' + extra : '')) }

console.log('1) 注入行');
const table = []
rows.forEach((f) => f(table))
ok('index-inject 推入了内联 script 行', table.length === 1 && table[0].kind === 'script' && /\/dsh-bailian\/widget\.js/.test(table[0].text), JSON.stringify(table[0] && table[0].kind))
ok('不是 script-src 行（那会让宿主起不来）', table[0] && table[0].kind !== 'script-src')
const t2 = []; rows.forEach((f) => f(t2)); rows.forEach((f) => f(t2))
ok('重复收集不叠加', t2.length === 1)

console.log('2) 路由');
ok('四条路由都已注册', ['/dsh-bailian/widget.js', '/dsh-bailian/state.json', '/dsh-bailian/config.json', '/dsh-bailian/login.json'].every((p) => routes.has(p)), [...routes.keys()].join(' '))

console.log('3) 栅栏');
fenceSays = undefined
let r = await call('/dsh-bailian/state.json')
ok('本机 GET + 宿主栅栏放行 → 进 handler（不再是 403）', r.statusCode === 200, 'HTTP ' + r.statusCode)
r = await call('/dsh-bailian/state.json', { headers: { host: 'evil.example.com:50609' } })
ok('伪造 Host 但宿主栅栏未拦 → 交由宿主语义（不重复拒绝）', r.statusCode === 200, 'HTTP ' + r.statusCode)
fenceSays = 401
r = await call('/dsh-bailian/state.json')
ok('宿主栅栏返回 401 → 透传 401', r.statusCode === 401, 'HTTP ' + r.statusCode)
fenceSays = undefined
r = await call('/dsh-bailian/config.json', { method: 'POST', headers: { host: 'evil.example.com' } }, { models: ['x'] })
ok('非本机写请求 → 拒绝', r.statusCode === 403, 'HTTP ' + r.statusCode)
r = await call('/dsh-bailian/config.json', { method: 'POST' }, { models: ['qwen3.8-flash'] })
ok('本机写请求 → 放行', r.statusCode === 200)

console.log('4) 数据源（真实网络）');
r = await call('/dsh-bailian/state.json', { url: '/dsh-bailian/state.json?refresh=1' })
const st = JSON.parse(r.body)
console.log('   version=' + st.version + ' tpm.ok=' + st.tpm.ok + ' freeTier=' + st.freeTier.code + ' bss=' + st.bss.code)
ok('tpm 用现有 sk key 取到限流配额', st.tpm.ok === true && st.tpm.items.length >= 1, JSON.stringify(st.tpm.items[0]))
ok('tpm 配额字段形状正确（不硬编码作者账号的具体数值）', !!st.tpm.items.find((x) => typeof x.usageLimit === 'number' && x.usageLimit > 0 && typeof x.usagePeriodSec === 'number'))
ok('免费额度在无 console 登录态时给出可操作错误码', st.freeTier.ok === false && st.freeTier.code === 'NO_CONSOLE_LOGIN')
ok('BSS 未启用时不报错、只标 DISABLED', st.bss.code === 'DISABLED')
ok('widget.js 可取到且体积合理', (await call('/dsh-bailian/widget.js')).body.length > 8000)

console.log('5) 计量');
const emit = listeners.get('session/event')
ok('已订阅 session/event', typeof emit === 'function')
const before = JSON.parse((await call('/dsh-bailian/state.json', { url: '/x?refresh=1' })).body).today.tokens
emit({ id: 'sess-test' }, { type: 'assistant/message', data: { turn: 99, usage: { inputTokens: 1200, cacheReadTokens: 300, outputTokens: 450 }, message: { source: { model: 'qwen3.8-flash' } } } })
emit({ id: 'sess-test' }, { type: 'turn/end', data: {} })
const after = JSON.parse((await call('/dsh-bailian/state.json', { url: '/x?refresh=1' })).body)
ok('usage 事件累加进今日账本（+1950）', after.today.tokens - before === 1950, before + ' → ' + after.today.tokens)
ok('上一轮已结算并带模型名', !!after.lastTurn && after.lastTurn.model === 'qwen3.8-flash', JSON.stringify(after.lastTurn && { seq: after.lastTurn.seq, model: after.lastTurn.model }))
ok('按模型拆分已记录', !!after.today.byModel['qwen3.8-flash'])

console.log('6) 密钥走向（必须进凭据库，不落配置文件）');
r = await call('/dsh-bailian/config.json', { method: 'POST' }, { __akId: 'LTAIFAKEFAKEFAKE', __akSecret: 'supersecretvalue123', bss: { enabled: true } })
ok('POST 带 AK/SK → 已转发给 credentials.set', !!(ctx.__set && ctx.__set.length === 2), JSON.stringify(ctx.__set || []))
const onDisk = fs.readFileSync(path.join(process.env.DSH_HOME, 'bailian-balance', 'config.json'), 'utf8')
ok('配置文件里没有明文密钥', onDisk.indexOf('supersecretvalue123') < 0 && onDisk.indexOf('LTAIFAKEFAKEFAKE') < 0)
ok('启用开关已持久化', JSON.parse(onDisk).bss.enabled === true)
r = await call('/dsh-bailian/state.json', { url: '/x?refresh=1' })
const st2 = JSON.parse(r.body)
ok('启用后 BSS 缺凭据 → 明确报 NO_AK 而不是静默', st2.bss.code === 'NO_AK', st2.bss.code)

console.log('7) 有 console 凭据时的网关调用与错误归类（假 token）');
const fakeDir = path.join(process.env.DSH_HOME, 'fake-bailian')
fs.mkdirSync(fakeDir, { recursive: true })
fs.writeFileSync(path.join(fakeDir, 'credentials.json'), JSON.stringify({ access_token: 'fake-token-no-login', console_region: 'cn-beijing', console_site: 'domestic' }), 'utf8')
process.env.BAILIAN_CONFIG_DIR = fakeDir
r = await call('/dsh-bailian/state.json', { url: '/x?refresh=1' })
const st3 = JSON.parse(r.body)
ok('读到凭据后真的去打了网关并归类为未登录', st3.freeTier.ok === false && st3.freeTier.code === 'NO_CONSOLE_LOGIN', st3.freeTier.code + ' / ' + String(st3.freeTier.error).slice(0, 60))
ok('未登录时仍回报 bl 可执行文件位置（给按钮用）', 'bl' in st3.freeTier)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
