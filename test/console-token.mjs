// Task 5：免 CLI 的 console token 通道（凭据库回退 + 文件优先 + 只写不落盘 + 失效码）
// 用本地假网关，保证离线、确定性；不碰真实账号也不发真实请求。
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import { pathToFileURL, fileURLToPath } from 'url'

// 注意：必须用 fileURLToPath。`new URL(...).pathname.replace(/^\//,'')` 是 Windows-only
// 写法，Linux 下会拼成相对路径直接 ERR_MODULE_NOT_FOUND（评审实测：CI 的 ubuntu job 首推即红）
const SRC = fileURLToPath(new URL('../lib/index.js', import.meta.url))
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-console-'))
const DSH = path.join(TMP, 'dsh')
const BLDIR = path.join(TMP, 'bailian')
fs.mkdirSync(DSH, { recursive: true })
fs.mkdirSync(BLDIR, { recursive: true })
process.env.DSH_HOME = DSH
process.env.BAILIAN_CONFIG_DIR = BLDIR

let mode = 'ok'
let quotaHits = 0
let evilHits = 0
// 同一个本地服务兼当假 dashscope —— 不设它的话 snapshotTpm 会真打
// https://dashscope.aliyuncs.com（评审实测），"离线套件"就是假话。
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    if (String(req.url).indexOf('/api/v1/quotas') >= 0) {
      quotaHits++
      res.writeHead(200, { 'content-type': 'application/json' })
      // 形状要对齐真实接口：{ output: { quotas: [...], total } }
      // （之前返回裸数组，num(j.output.total) 会抛异常，被归类成 TPM_FAIL）
      res.end(JSON.stringify({
        output: {
          total: 1,
          quotas: [{ model: 'qwen3.8-flash', workspace_id: 'ws-fake-workspace',
                     model_limit: { usage_limit: 123456, usage_limit_field: 'total_tokens', usage_limit_period: 6, request_limit: null } }],
        },
      }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    if (mode === 'notlogin') {
      res.end(JSON.stringify({ data: { success: false, errorCode: 'BailianGateway.Login.NotLogined', errorMsg: 'not logined' } }))
    } else {
      res.end(JSON.stringify({ data: { success: true, DataV2: { data: { data: {} } } } }))
    }
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const LOCAL = 'http://127.0.0.1:' + server.address().port
process.env.BAILIAN_CONSOLE_HOST = LOCAL
process.env.DASHSCOPE_BASE = LOCAL

// "外部主机"替身：用来证明往配置里写端点**不可能**把请求引到别处去
const evil = http.createServer((req, res) => { evilHits++; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}') })
await new Promise((r) => evil.listen(0, '127.0.0.1', r))
const EVIL = 'http://127.0.0.1:' + evil.address().port

let pass = 0, fail = 0
const ok = (l, c, x) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + l + (x ? ' → ' + x : '')) }

function mkCtx(store) {
  const routes = new Map()
  const ctx = {
    get: (n) => (n === 'connection' ? { requestRejection: () => {} } : null),
    connection: { requestRejection: () => {} },
    credentials: {
      async resolve(ref) { if (store[ref]) return { value: store[ref] }; throw new Error('missing ' + ref) },
      async set(ref, val) { store[ref] = val },
    },
    webServer: { register: (r) => { routes.set(r.path, r.handler); return () => {} } },
    on: () => () => {},
  }
  return { ctx, routes }
}

async function boot(n) {
  const store = {}
  const { ctx, routes } = mkCtx(store)
  const root = { effect() {}, on: () => () => {}, inject: (_d, cb) => cb(ctx) }
  const mod = (await import(pathToFileURL(SRC).href + '?v=' + n)).default
  mod.apply(root)
  // apply() 里注册路由要等一个异步阶段，同帧取会拿到空 Map
  await new Promise((r) => setTimeout(r, 60))
  if (routes.size !== 4) throw new Error('路由没注册全：' + [...routes.keys()].join(','))
  return { store, routes }
}

// 路由表的键是不含 query 的路径，别把 ?refresh=1 一起当键去取
const key = (p) => p.split('?')[0]

async function get(routes, p) {
  const rq = new EventEmitter()
  Object.assign(rq, { method: 'GET', headers: { host: '127.0.0.1:1' }, url: p })
  const rs = { statusCode: 0, body: '', writeHead(c) { this.statusCode = c }, end(s) { this.body = s || '' } }
  setImmediate(() => rq.emit('end'))
  await routes.get(key(p))(rq, rs)
  return JSON.parse(rs.body || '{}')
}

async function post(routes, p, obj) {
  const rq = new EventEmitter()
  Object.assign(rq, { method: 'POST', headers: { host: '127.0.0.1:1', 'content-type': 'application/json' }, url: p })
  const rs = { statusCode: 0, body: '', writeHead(c) { this.statusCode = c }, end(s) { this.body = s || '' } }
  setImmediate(() => { rq.emit('data', JSON.stringify(obj)); rq.emit('end') })
  await routes.get(key(p))(rq, rs)
  return rs.body
}

// ① 没有 ~/.bailian 文件，但凭据库里有粘贴的 token → 走通并标 source=pasted
{
  const n = 1
  const { store, routes } = await boot(n)
  store.BAILIAN_CONSOLE_TOKEN = 'pasted-token-abc'
  store.ALIYUN_DASHSCOPE_API_KEY = 'sk-test'
  mode = 'ok'
  const st = await get(routes, '/dsh-bailian/state.json?refresh=1')
  ok('无文件时用凭据库里的 token', st.freeTier && st.freeTier.source === 'pasted',
    JSON.stringify({ code: st.freeTier && st.freeTier.code, src: st.freeTier && st.freeTier.source }))
  ok('粘贴 token 时 consoleLoggedIn 为真', st.consoleLoggedIn === true, String(st.consoleLoggedIn))

  // ② 文件优先：写一份 bailian config.json，应改判为 file
  fs.writeFileSync(path.join(BLDIR, 'config.json'), JSON.stringify({ access_token: 'file-token', console_region: 'cn-beijing' }))
  const st2 = await get(routes, '/dsh-bailian/state.json?refresh=1')
  ok('文件优先于粘贴值', st2.freeTier && st2.freeTier.source === 'file', String(st2.freeTier && st2.freeTier.source))

  // ③ __consoleToken 只进凭据库，不落配置文件
  fs.unlinkSync(path.join(BLDIR, 'config.json'))
  await post(routes, '/dsh-bailian/config.json', { widget: { accent: '#4FA8FF' }, __consoleToken: 'secret-pasted-xyz' })
  const onDisk = fs.readFileSync(path.join(DSH, 'bailian-balance', 'config.json'), 'utf8')
  ok('粘贴的 token 不落配置文件', onDisk.indexOf('secret-pasted-xyz') < 0 && store.BAILIAN_CONSOLE_TOKEN === 'secret-pasted-xyz',
    'store=' + String(store.BAILIAN_CONSOLE_TOKEN).slice(0, 6))
}

// ④ 网关说未登录且用的是粘贴值 → 明确报 CONSOLE_TOKEN_EXPIRED
{
  mode = 'notlogin'
  const { store, routes } = await boot(9)
  store.BAILIAN_CONSOLE_TOKEN = 'expired-token'
  const st = await get(routes, '/dsh-bailian/state.json?refresh=1')
  ok('token 失效回 CONSOLE_TOKEN_EXPIRED', st.freeTier && st.freeTier.code === 'CONSOLE_TOKEN_EXPIRED',
    String(st.freeTier && st.freeTier.code))
}

// ⑤ 评审 C1：往配置里写端点，不能把凭据引到别的主机去
{
  const { store, routes } = await boot(20)
  store.ALIYUN_DASHSCOPE_API_KEY = 'sk-test-local'
  const before = quotaHits
  await post(routes, '/dsh-bailian/config.json', {
    dashscopeBase: EVIL, models: ['qwen3.8-flash'],
    bss: { enabled: false, endpoint: '127.0.0.1:9' }, unknownKey: 'leak-me',
  })
  await get(routes, '/dsh-bailian/state.json?refresh=1')
  const onDisk = fs.readFileSync(path.join(DSH2(), 'bailian-balance', 'config.json'), 'utf8')
  ok('配置改不动 dashscope 端点（请求仍去本地假官方）', quotaHits > before && evilHits === 0,
    'quota=' + quotaHits + ' evil=' + evilHits)
  ok('落盘配置里没有外部端点', onDisk.indexOf(EVIL) < 0 && onDisk.indexOf('leak-me') < 0, onDisk.slice(0, 60))
}

// ⑥ 评审 I：login.json 必须只认 POST（GET 就 spawn 登录进程太危险）
{
  const { routes } = await boot(21)
  const rq = new EventEmitter()
  Object.assign(rq, { method: 'GET', headers: { host: '127.0.0.1:1' }, url: '/dsh-bailian/login.json', socket: { remoteAddress: '127.0.0.1' } })
  const rs = { statusCode: 0, body: '', writeHead(c) { this.statusCode = c }, end(s) { this.body = s || '' } }
  setImmediate(() => rq.emit('end'))
  await routes.get('/dsh-bailian/login.json')(rq, rs)
  ok('GET login.json 被拒（405）', rs.statusCode === 405, 'status=' + rs.statusCode)
}

// ⑦ 写请求兜底不能只信 Host 头（伪造一行 Host 就绕过的话，凭据就能被外部改）
// 注：这条是修复之后补的回归守卫，不是 RED→GREEN 证据。
{
  const { routes } = await boot(22)
  const rq = new EventEmitter()
  Object.assign(rq, {
    method: 'POST',
    headers: { host: '127.0.0.1:1', 'content-type': 'application/json' },
    url: '/dsh-bailian/config.json',
    socket: { remoteAddress: '10.72.98.134' }, // 局域网对端 + 伪造的本机 Host
  })
  const rs = { statusCode: 0, body: '', writeHead(c) { this.statusCode = c }, end(s) { this.body = s || '' } }
  setImmediate(() => { rq.emit('data', JSON.stringify({ models: ['evil'] })); rq.emit('end') })
  await routes.get('/dsh-bailian/config.json')(rq, rs)
  ok('伪造 Host 头 + 非本机对端的写请求被拒', rs.statusCode === 403, 'status=' + rs.statusCode)
}

// ⑧ 用户反馈#1：key 凭据名自动发现。
// DSH 设置界面新建 provider 时按路由名派生 `<ROUTE>_API_KEY`，写死一个名字会让
// 「刚在设置里配好 key」的人看到"不识别"。造一个非标准名字的 profile 来验。
{
  const prof = path.join(TMP, 'profile-fake')
  fs.mkdirSync(prof, { recursive: true })
  fs.writeFileSync(path.join(prof, 'cordis.patch.yml'), [
    '- id: llm-pi-ai',
    '  name: "@deepseek-ai/dsh-llm-pi-ai"',
    '  config:',
    '    providers:',
    '      my-bailian:',
    '        displayName: 我的百炼路由',
    '        apiKeyEnv: MY_BAILIAN_API_KEY',
    '        api: openai-completions',
    '        baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1',
    '',
  ].join('\n'))
  const saved = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = prof
  const { store, routes } = await boot(30)
  store.MY_BAILIAN_API_KEY = 'sk-fake-discovered'
  const st = await get(routes, '/dsh-bailian/state.json?refresh=1')
  ok('非标准凭据名也能发现 key', st.tpm.ok === true && st.tpm.keyRef === 'MY_BAILIAN_API_KEY',
    JSON.stringify({ ok: st.tpm.ok, ref: st.tpm.keyRef, code: st.tpm.code }))
  process.env.DSH_PROFILE_DIR = saved
}

// ⑨ 发现失败时要说清试过哪些名字，而不是只报一个写死的 ref
{
  const saved = process.env.DSH_PROFILE_DIR
  const empty = path.join(TMP, 'profile-empty')
  fs.mkdirSync(empty, { recursive: true })
  process.env.DSH_PROFILE_DIR = empty
  const { routes } = await boot(31)
  const st = await get(routes, '/dsh-bailian/state.json?refresh=1')
  ok('找不到 key 时列出尝试过的凭据名',
    st.tpm.ok === false && st.tpm.code === 'NO_KEY' && /尝试/.test(st.tpm.error || '') && (st.tpm.keyRefs || []).length >= 1,
    (st.tpm.error || '').slice(0, 60))
  process.env.DSH_PROFILE_DIR = saved
}

function DSH2() { return DSH }

server.close()
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
