// dsh-bailian-balance —— 宿主侧
// 四个数据源，各自独立、按凭据可用性优雅降级：
//   1. tpm     ：DashScope API Key 直连 GET /api/v1/quotas      —— 零额外配置，本机已实测可用
//   2. freeTier：百炼控制台网关 queryFreeTierQuota              —— 需要一次 `bl auth login --console`
//   3. bss     ：阿里云 BSS OpenAPI 账户余额 / 代金券            —— 需要 AK/SK（可选）；
//                已用只读 RAM 子账号在真账号实测，字段名与直觉不同，见本文件下方注释
//   4. metering ：DSH 会话事件流的真实 usage                     —— 零配置，实时
//
// 前端通道：桌面端（Electron）的 index.html 从安装包静态 dist 直出，webServer.tapIndex
// 过不去；唯一生效通道是 `webserver/index-inject` 推的结构化行，且这张表是宿主启动时
// 一次性收集的 —— 所以注入行的注册必须放在 apply() 的第一件事，不能被任何服务就绪推迟。
// 注入用**内联 script 行**而非 script-src 行：后者加载失败会 reject 掉 __DSH_BOOT_READY__
// 导致应用起不来；内联行由我们自己建 <script> 并吞掉 onerror，路由不在就静默失败。

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_VERSION = '0.3.1'
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA_DIR = path.join(DSH_HOME, 'bailian-balance')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const LEDGER_PATH = path.join(DATA_DIR, 'ledger.json')
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

// 与 dsh-whale-widget 的 issue #154 同源教训：注入行指向自己的路由，加载失败静默。
const WIDGET_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'if(d.querySelector&&d.querySelector(\'script[data-dsh-bailian]\'))return;' +
  'var s=document.createElement("script");s.src="/dsh-bailian/widget.js";s.setAttribute("data-dsh-bailian","1");' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

const CS_GATEWAYS = {
  'cn-beijing': {
    domestic: { host: 'bailian-cs.console.aliyun.com', action: 'BroadScopeAspnGateway' },
    international: { host: 'bailian-cs.console.alibabacloud.com', action: 'BroadScopeAspnGateway' },
  },
  'ap-southeast-1': {
    domestic: { host: 'modelstudio-cs.console.aliyun.com', action: 'IntlBroadScopeAspnGateway' },
    international: { host: 'bailian-singapore-cs.alibabacloud.com', action: 'IntlBroadScopeAspnGateway' },
  },
}

// 粘贴的 console token 走 DSH 凭据库，绝不进 config.json
const CONSOLE_TOKEN_REF = 'BAILIAN_CONSOLE_TOKEN'

// —— 端点固定为阿里云官方主机 ——
// 端点**不能**出现在可写配置里：否则改一下 config 就能让本插件把
// `Authorization: Bearer <sk>`（以及 AK 签名）主动送到任意主机去。
// 只有指向回环地址的环境变量能覆盖，那是给离线测试用的。
const OFFICIAL_DASHSCOPE = 'https://dashscope.aliyuncs.com'
const OFFICIAL_BSS = 'business.aliyuncs.com'
const LOOPBACK_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i
function dashscopeBase() {
  const raw = String(process.env.DASHSCOPE_BASE || '').trim()
  if (raw && !LOOPBACK_RE.test(raw)) log('DASHSCOPE_BASE 被忽略：只允许指向 127.0.0.1 / localhost')
  return LOOPBACK_RE.test(raw) ? raw.replace(/\/+$/, '') : OFFICIAL_DASHSCOPE
}
// 只接受这些配置键；端点与凭据类键一律丢弃
const CONFIG_KEYS = ['models', 'apiKeyRef', 'prices', 'refreshMs', 'widget', 'console', 'bss']
function sanitizeConfigPatch(p) {
  const out = {}
  for (const k of Object.keys(p || {})) {
    if (k === 'dashscopeBase' || k === 'endpoint') { log('忽略配置键 ' + k + '：端点固定为官方主机'); continue }
    if (CONFIG_KEYS.indexOf(k) < 0) { log('忽略未知配置键：' + k); continue }
    if (k === 'bss') {
      const b = p.bss || {}
      out.bss = {}
      for (const bk of ['enabled', 'idRef', 'secretRef']) if (bk in b) out.bss[bk] = b[bk]
      if ('endpoint' in b) log('忽略 bss.endpoint：端点固定为 ' + OFFICIAL_BSS)
    } else if (k === 'console') {
      const c = p.console || {}
      out.console = {}
      if ('enabled' in c) out.console.enabled = !!c.enabled
    } else {
      out[k] = p[k]
    }
  }
  return out
}
let creds = null, lastCredSource = null, loginChild = null

const DEFAULTS = {
  models: ['qwen3.8-flash', 'qwen3.8-max'],
  apiKeyRef: 'ALIYUN_DASHSCOPE_API_KEY',
  console: { enabled: true },
  bss: {
    enabled: false,
    idRef: 'BSS_ACCESS_KEY_ID',
    secretRef: 'BSS_ACCESS_KEY_SECRET',
  },
  prices: {}, // model -> { input, output, cache }，单位：元 / 百万 token；空 = 只报 token 不折钱
  refreshMs: 30000,
  widget: {},
}

function log(...a) { try { console.log('[bailian-balance]', ...a) } catch (e) {} }
function clone(o) { return JSON.parse(JSON.stringify(o)) }
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0 }
function dayKey(d) {
  const x = d || new Date()
  return [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-')
}
function merge(base, over) {
  const out = clone(base)
  for (const k of Object.keys(over || {})) {
    const v = over[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? merge(base[k], v) : v
  }
  return out
}

// ── 本地状态 ────────────────────────────────────────────────────────────────
let cfg = null
function readConfig() {
  if (cfg) return cfg
  let parsed = {}
  try { parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch (e) {}
  cfg = merge(DEFAULTS, parsed)
  return cfg
}
function writeConfig(next) {
  cfg = merge(DEFAULTS, next)
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8')
  } catch (e) { log('配置写入失败：' + String(e && e.message || e)) }
  return cfg
}

let ledger = null
function readLedger() {
  if (ledger) return ledger
  try { ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) } catch (e) { ledger = {} }
  ledger = { days: ledger.days || {}, seq: num(ledger.seq), lastTurn: ledger.lastTurn || null, byModel: ledger.byModel || {}, updatedAt: ledger.updatedAt || null }
  // 只留最近 60 天
  const keys = Object.keys(ledger.days).sort()
  while (keys.length > 60) delete ledger.days[keys.shift()]
  return ledger
}
let ledgerDirty = false
function markLedger() { ledgerDirty = true }
function flushLedger() {
  if (!ledgerDirty) return
  ledgerDirty = false
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger), 'utf8')
  } catch (e) {}
}

// ── HTTP ───────────────────────────────────────────────────────────────────
async function req(url, opts) {
  const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(num((opts && opts.timeoutMs) || 12000)) }, opts))
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (e) {}
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status + ' ' + (json && (json.message || json.Code) || text.slice(0, 160)))
    err.status = res.status; err.body = json || text.slice(0, 300); throw err
  }
  return json == null ? { raw: text } : json
}

// 百炼控制台网关：形状取自 bailian-cli 2.4.0 的 console 客户端（zelda / BroadScopeAspnGateway）
async function consoleCall(cred, api, data) {
  const site = CS_GATEWAYS[cred.region] && CS_GATEWAYS[cred.region][cred.site] ? cred.site : 'domestic'
  const gw = (CS_GATEWAYS[cred.region] || CS_GATEWAYS['cn-beijing'])[site]
  const payload = JSON.stringify({
    Api: api, V: '1.0',
    Data: Object.assign({}, data, {
      cornerstoneParam: Object.assign(
        { protocol: 'V2', console: 'ONE_CONSOLE', productCode: 'p_efm', switchUserType: 3, consoleSite: 'BAILIAN_ALIYUN' },
        cred.switchAgent == null ? {} : { switchAgent: cred.switchAgent },
      ),
    }),
  })
  // BAILIAN_CONSOLE_HOST 只给测试用（指向本地假网关）。必须锁死回环：
  // 否则任何能设环境变量的东西都能把 Authorization: Bearer <控制台 token> 引到外部主机去。
  const ovRaw = String(process.env.BAILIAN_CONSOLE_HOST || '').trim()
  const ov = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(ovRaw) ? ovRaw : ''
  if (ovRaw && !ov) log('BAILIAN_CONSOLE_HOST 被忽略：只允许指向 127.0.0.1 / localhost')
  const base = ov ? ov.replace(/\/+$/, '') : 'https://' + gw.host
  const url = base + '/cli/api.json?action=' + gw.action + '&product=sfm_bailian&api=' + encodeURIComponent(api)
  const res = await req(url, {
    method: 'POST', timeoutMs: 15000,
    headers: { Accept: '*/*', 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer ' + cred.token },
    body: new URLSearchParams({ params: payload, region: cred.region }).toString(),
  })
  const d = res && res.data
  if (d && d.success === false && d.errorCode) {
    const err = new Error(String(d.errorMsg || d.errorCode))
    err.code = String(d.errorCode); err.notLogin = /NotLogined/.test(String(d.errorCode)); throw err
  }
  return res
}
// 控制台返回体在 DataV2.data.data.<key> 或 data.<key>（与 CLI 的解包函数一致）
function unwrap(res, key) {
  const n = res && res.data
  if (!n) return []
  const r = n.DataV2
  const got = r ? (r.data && r.data.data ? r.data.data[key] : null) : (n.data ? n.data[key] : null)
  return Array.isArray(got) ? got : []
}

// 阿里云 RPC 签名（HMAC-SHA1 / SignatureVersion 1.0）——BssOpenApi 用这套
function rpcPercent(s) {
  return encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+')
}
async function bssCall(akId, akSecret, action, extra) {
  const c = readConfig()
  const params = Object.assign({
    Action: action, Version: '2017-12-14', Format: 'JSON', AccessKeyId: akId,
    SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  }, extra || {})
  const canonical = Object.keys(params).sort().map((k) => rpcPercent(k) + '=' + rpcPercent(params[k])).join('&')
  const strToSign = 'GET&' + rpcPercent('/') + '&' + rpcPercent(canonical)
  const sig = crypto.createHmac('sha1', akSecret + '&').update(strToSign).digest('base64')
  return req('https://' + OFFICIAL_BSS + '/?' + canonical + '&Signature=' + rpcPercent(sig), { timeoutMs: 15000 })
}

// 读取 bl（bailian-cli）的 console 登录态。实测 bl 2.3.2 把 access_token 写在 **config.json**
// （更早的形态与其它工具写 credentials.json），所以两份都要试；console_switch_agent 必须一起取，
// 网关的 cornerstoneParam.switchAgent 靠它定位业务空间，缺了可能拿不到数据。
function consoleCred() {
  const dir = process.env.BAILIAN_CONFIG_DIR || path.join(os.homedir(), '.bailian')
  for (const p of [path.join(dir, 'config.json'), path.join(dir, 'credentials.json')]) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      const token = typeof j.access_token === 'string' ? j.access_token.trim() : ''
      if (token) return {
        token,
        region: j.console_region || 'cn-beijing',
        site: j.console_site || 'domestic',
        switchAgent: j.console_switch_agent == null ? null : j.console_switch_agent,
        workspaceId: j.workspace_id || '',
        file: p, source: 'file',
      }
    } catch (e) {}
  }
  return null
}
// 文件优先（官方 CLI 自己维护，会随登录刷新），其次才是用户粘贴进凭据库的 token。
async function consoleCredAsync() {
  const f = consoleCred()
  if (f) { lastCredSource = 'file'; return f }
  if (creds) {
    try {
      const r = await creds.resolve(CONSOLE_TOKEN_REF)
      const token = r && typeof r.value === 'string' ? r.value.trim() : ''
      if (token) {
        lastCredSource = 'pasted'
        return { token, region: 'cn-beijing', site: 'domestic', switchAgent: null, workspaceId: '', file: null, source: 'pasted' }
      }
    } catch (e) { /* 没配过就是没配过，不算错 */ }
  }
  lastCredSource = null
  return null
}

// 找 bl 可执行入口。本机 PATH 上没有 node/npm，所以官方 README 的 `npm i -g bailian-cli`
// 在这台机器上不一定走得通；这里额外认两种落地形态：PATH 上的 bl/bailian，以及用 DSH 自带
// pnpm 装进 ~/.dsh/tools/bailian-cli 的那份（返回 .mjs，用宿主自己的 node 起）。
function findBl() {
  // 先认 .mjs 入口：用宿主自己的 node 起，跨平台且不受 Node 对 .cmd 的限制。
  for (const p of [
    path.join(DSH_HOME, 'tools', 'bailian-cli', 'node_modules', 'bailian-cli', 'dist', 'bailian.mjs'),
    path.join(os.homedir(), '.bailian', 'cli', 'node_modules', 'bailian-cli', 'dist', 'bailian.mjs'),
  ]) {
    try { if (fs.existsSync(p)) return { kind: 'mjs', cmd: process.execPath, args: [p], label: p } } catch (err) {}
  }
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const d of dirs) for (const n of ['bl', 'bailian']) for (const e of (process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''])) {
    const p = path.join(d, n + e)
    try {
      if (!(fs.existsSync(p) && fs.statSync(p).isFile())) continue
      // Node >= 18.19/20.11/22/24 直接 spawn .cmd/.bat 会抛 EINVAL，必须经 ComSpec 包一层。
      if (/\.(cmd|bat)$/i.test(p)) {
        return { kind: 'bin', cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/c', p], label: p }
      }
      return { kind: 'bin', cmd: p, args: [], label: p }
    } catch (err) {}
  }
  return null
}

// —— 百炼 API Key 的凭据名自动发现 ——
// DSH 设置里新建模型提供商时，凭据引用名是按**路由名**派生的（<ROUTE>_API_KEY），
// 所以不能写死一个名字：否则用户刚配好 key，面板还说"不识别"。
function profilePatchTexts() {
  const dirs = []
  if (process.env.DSH_PROFILE_DIR) dirs.push(process.env.DSH_PROFILE_DIR)
  if (process.env.DSH_PROFILE) dirs.push(path.join(DSH_HOME, 'profiles', process.env.DSH_PROFILE))
  const texts = []
  for (const d of dirs) {
    for (const f of ['cordis.patch.yml', 'cordis.patch.yaml']) {
      try {
        const t = fs.readFileSync(path.join(d, f), 'utf8')
        if (t && texts.indexOf(t) < 0) texts.push(t)
      } catch (e) { /* 该 profile 没有补丁文件 */ }
    }
  }
  return texts
}

function candidateKeyRefs(c) {
  const out = []
  const push = (x) => {
    const v = String(x || '').trim().replace(/^["']|["']$/g, '')
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(v) && out.indexOf(v) < 0) out.push(v)
  }
  if (c.apiKeyRef && c.apiKeyRef !== 'auto') push(c.apiKeyRef)   // 用户在「设置」里显式填的最优先
  push(process.env.DSH_BAILIAN_KEY_REF)      // 允许环境变量指定
  // 从 profile 补丁里配对 apiKeyEnv ↔ baseURL(含 dashscope/bailian)
  for (const txt of profilePatchTexts()) {
    let lastEnv = null, lastDashBase = false
    for (const ln of txt.split(/\r?\n/)) {
      const e = /^\s*apiKeyEnv:\s*(\S.*?)\s*$/.exec(ln)
      const u = /^\s*baseURL:\s*(\S.*?)\s*$/.exec(ln)
      if (e) {
        const env = e[1].replace(/^["']|["']$/g, '')
        if (lastDashBase) push(env)          // baseURL 写在 apiKeyEnv 之前的顺序
        lastEnv = env
      } else if (u) {
        lastDashBase = /dashscope|bailian/i.test(u[1])
        if (lastDashBase && lastEnv) push(lastEnv)
      }
    }
  }
  for (const d of ['ALIYUN_DASHSCOPE_API_KEY', 'DASHSCOPE_API_KEY', 'BAILIAN_API_KEY']) push(d)
  return out
}

// ── 数据源快照 ──────────────────────────────────────────────────────────────
async function snapshotTpm(ctx) {
  const c = readConfig()
  const refs = candidateKeyRefs(c)
  let key = '', used = ''
  for (const ref of refs) {
    try {
      const cred = await ctx.credentials.resolve(ref)
      if (cred && cred.value) { key = String(cred.value); used = ref; break }
    } catch (e) { /* 这个引用名没有，试下一个 */ }
  }
  if (!key) return {
    ok: false, code: 'NO_KEY', keyRefs: refs, items: [],
    error: '没找到可用的百炼 API Key。已尝试的凭据名：' + refs.join('、') +
      '。在 DSH「设置 → 模型」里给百炼路由配好 API Key 就会自动识别；' +
      '也可以在下方的「设置」里手填凭据名。',
  }
  try {
    const j = await req(dashscopeBase() + '/api/v1/quotas?page_no=1&page_size=200', { headers: { Authorization: 'Bearer ' + key } })
    const all = (j && j.output && j.output.quotas) || []
    const want = new Set(c.models.map(String))
    const items = all.filter((q) => want.has(q.model)).map((q) => {
      const ml = q.model_limit || {}
      return {
        model: q.model, workspace: q.workspace_id || '',
        usageLimit: ml.usage_limit == null ? null : num(ml.usage_limit),
        usageField: ml.usage_limit_field || '', usagePeriodSec: ml.usage_limit_period == null ? null : num(ml.usage_limit_period),
        requestLimit: ml.request_limit == null ? null : num(ml.request_limit),
      }
    })
    return { ok: true, total: num(j.output.total), items, fetchedAt: Date.now(), keyRef: used }
  } catch (e) {
    return { ok: false, code: 'TPM_FAIL', keyRef: used, error: String(e && e.message || e).slice(0, 200), items: [] }
  }
}

async function snapshotFreeTier() {
  const r = await freeTierRaw()
  if (r && lastCredSource) r.source = lastCredSource
  return r
}
async function freeTierRaw() {
  const c = readConfig()
  const cred = await consoleCredAsync()
  if (!c.console.enabled) return { ok: false, code: 'DISABLED', items: [] }
  if (!cred) return {
    ok: false, code: 'NO_CONSOLE_LOGIN',
    error: '没有百炼控制台登录态。可以在面板「设置」里直接粘贴 access_token（免装 CLI），或跑一次 bl auth login --console。',
    bl: (findBl() || {}).label || null, items: [],
  }
  try {
    const models = c.models.map(String)
    const [q, s] = await Promise.all([
      consoleCall(cred, 'zeldaEasy.bailian-commerce.freeTrial.queryFreeTierQuota', { queryFreeTierQuotaRequest: { models } }),
      consoleCall(cred, 'zeldaEasy.bailian-commerce.freeTrial.queryFreeTierOnlyStatus', { queryFreeTierOnlyStatusRequest: { models } }).catch(() => null),
    ])
    const stopMap = new Map()
    for (const x of (s ? unwrap(s, 'freeTierOnlyStatuses') : [])) if (x && x.model) stopMap.set(x.model, x.enabled !== false && x.status !== false ? true : false)
    const items = unwrap(q, 'freeTierQuotas').map((x) => {
      const total = x.quotaInitTotal == null ? null : num(x.quotaInitTotal)
      const remain = x.quotaTotal == null ? null : num(x.quotaTotal)
      const expired = num(x.quotaValidityPeriod) > 0 && num(x.quotaValidityPeriod) < Date.now()
      const used = total != null && remain != null ? Math.max(0, total - remain) : null
      return {
        model: x.model, total, remain, expired,
        used,
        remainPct: total && total > 0 && remain != null ? Math.round(remain / total * 1000) / 10 : null,
        expiresAt: num(x.quotaValidityPeriod) ? new Date(num(x.quotaValidityPeriod)).toISOString() : null,
        autoStop: stopMap.has(x.model) ? stopMap.get(x.model) : (x.quotaStatus === 'UNKNOWN' ? 'unsupported' : null),
        status: x.quotaStatus || '',
      }
    })
    return { ok: true, items, account: { region: cred.region, site: cred.site }, fetchedAt: Date.now() }
  } catch (e) {
    return {
      ok: false, code: (e && e.notLogin ? (cred && cred.source === 'pasted' ? 'CONSOLE_TOKEN_EXPIRED' : 'NO_CONSOLE_LOGIN') : 'FREE_TIER_FAIL'),
      error: String(e && e.message || e).slice(0, 200),
      bl: (findBl() || {}).label || null, items: [],
    }
  }
}

// 把阿里云 RPC 的错误体摊平成人能看懂的一行（Code + Message + RequestId），
// 否则界面上只剩 "HTTP 400 NotAuthorized"，用户根本不知道该去加哪个权限。
function apiErr(e) {
  const b = (e && e.body) || {}
  const code = String(b.Code || b.code || '')
  const msg = String(b.Message || b.message || '')
  const rid = String(b.RequestId || b.request_id || '')
  let s = (code ? code + ' · ' : '') + (msg || String((e && e.message) || e))
  if (rid) s += '（RequestId ' + rid + '）'
  if (/NotAuthorized|Forbidden|NoPermission|AuthFailed/i.test(code + msg)) {
    s += ' ⇒ 签名已通过，是这个 AK 所属身份没有被授权调用该接口：去 RAM 控制台给该用户挂 AliyunBSSReadOnlyAccess，或检查自定义策略里的权限点（QueryAccountBalance=bssapi:QueryAccountBalance / bss:DescribeAcccount，注意官方文档里 Acccount 是三个 c）。'
  }
  return s.slice(0, 420)
}

async function snapshotBss(ctx) {
  const c = readConfig()
  if (!c.bss.enabled) return { ok: false, code: 'DISABLED', balance: null, coupons: [] }
  let akId = '', akSec = ''
  try {
    const a = await ctx.credentials.resolve(c.bss.idRef)
    const b = await ctx.credentials.resolve(c.bss.secretRef)
    akId = a && a.value ? String(a.value) : ''; akSec = b && b.value ? String(b.value) : ''
  } catch (e) {}
  if (!akId || !akSec) return { ok: false, code: 'NO_AK', error: '未配置 BSS 的 AK/SK（面板「账户余额」区填一次即可）', balance: null, coupons: [] }
  const out = { ok: true, balance: null, coupons: [], errors: [], fetchedAt: Date.now() }
  const str = (v) => (v == null || v === '' ? null : String(v))
  try {
    // 实测返回体（2026-10-20，真账号）：Data = { AvailableCashAmount, AvailableAmount, CreditAmount,
    //   QuotaLimit, MybankCreditAmount, Currency }。注意**没有** AvailableBalance/TotalBalance/DebtBalance
    //   那组字段（那是按文档直觉写的，全错），旧字段名只作兼容回退保留。
    const j = await bssCall(akId, akSec, 'QueryAccountBalance')
    const d = j && j.Data ? j.Data : null
    if (d) out.balance = {
      availableCash: str(d.AvailableCashAmount),
      available: str(d.AvailableAmount != null ? d.AvailableAmount : d.AvailableBalance),
      credit: str(d.CreditAmount),
      quotaLimit: str(d.QuotaLimit),
      mybankCredit: str(d.MybankCreditAmount),
      total: str(d.TotalBalance),
      debt: str(d.DebtBalance),
      currency: d.Currency || 'CNY',
    }
    else out.errors.push(apiErr({ message: '响应里没有 Data 字段', body: j }))
  } catch (e) { out.errors.push('QueryAccountBalance: ' + apiErr(e)) }
  try {
    const j = await bssCall(akId, akSec, 'QueryCashCoupons', { PageNum: '1', PageSize: '20' })
    const data = (j || {}).Data || {}
    // 实测容器是 Data.CashCoupon[]（不是文档直觉的 CashCouponInfos.CashCouponInfo）
    const list = data.CashCoupon || ((data.CashCouponInfos || {}).CashCouponInfo) || []
    out.coupons = (Array.isArray(list) ? list : [list]).filter(Boolean).map((x) => {
      const endRaw = x.ExpiryTime || x.EndTime || ''
      const endTs = Date.parse(endRaw)
      return {
        no: str(x.CashCouponNo) || str(x.CouponNumber) || str(x.CouponId) || '',
        name: x.Description || x.Name || '',
        balance: str(x.Balance), nominal: str(x.NominalValue),
        currency: x.Currency || 'CNY', status: x.Status || '',
        end: endRaw, daysLeft: isFinite(endTs) ? Math.ceil((endTs - Date.now()) / 86400000) : null,
        scope: x.ApplicableProducts || '',
      }
    })
  } catch (e) { out.errors.push('QueryCashCoupons: ' + apiErr(e)) }
  if (!out.balance && !(out.coupons && out.coupons.length) && out.errors.length) {
    out.ok = false; out.code = 'BSS_FAIL'; out.error = out.errors.join(' ／ ')
  }
  return out
}

function moneyFor(model, u) {
  const c = readConfig()
  const p = c.prices && c.prices[model]
  if (!p) return null
  const input = num(p.input), output = num(p.output)
  const cache = num(p.cache == null ? input : p.cache)
  return Math.round(((num(u.input) / 1e6 * input) + (num(u.cache) / 1e6 * cache) + (num(u.output) / 1e6 * output)) * 1e6) / 1e6
}

// ── 插件主体 ────────────────────────────────────────────────────────────────
export default {
  name: 'bailian-balance',
  apply(root) {
    const rowDisposers = []
    root.effect(() => () => { for (const d of rowDisposers) { try { d() } catch (e) {} } })
    // ① 注入行最先注册，不等任何服务（桌面端的注入表是宿主启动时一次性收集的）
    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script-src' && row.src === '/dsh-bailian/widget.js') return
          if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf('/dsh-bailian/widget.js') >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: WIDGET_ROW_TEXT })
      } catch (e) {}
    }))

    // ② 其余逻辑等齐服务
    root.inject(['webServer', 'credentials', 'connection'], (ctx) => {
      creds = ctx.credentials
      const disposers = []
      const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

      // —— 浏览器信任栅栏：委托宿主的 connection.requestRejection；缺失时退回回环自校验 ——
      // 注意：Host 头带端口（`127.0.0.1:50609`），必须先经 URL 解析取 hostname。
      // 直接拿整个 Host 去匹配 IPv4 正则会把本机的正常请求也拒掉（0.1.0 首版就踩了这个坑）。
      function loopback(h) {
        const s = String(h || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
        if (!s) return false
        if (s === 'localhost' || s.endsWith('.localhost') || s === '::1') return true
        const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
        return !!(m && Number(m[1]) === 127 && [m[2], m[3], m[4]].every((x) => Number(x) <= 255))
      }
      function hostUrl(req) {
        try { return new URL('http://' + String(((req || {}).headers || {}).host || '')) } catch (e) { return null }
      }
      function fromLoopback(req) {
        // Host 头是可以伪造的（profile 绑到局域网 IP 时尤其），所以兜底必须再看
        // 真正的对端地址；两者都算不出时才退回 Host 判定。
        const u = hostUrl(req)
        if (!(u && loopback(u.hostname))) return false
        const addr = String((((req || {}).socket) || {}).remoteAddress || '').toLowerCase().replace(/^::ffff:/, '')
        if (!addr) return true
        return loopback(addr)
      }
      function fence() {
        try {
          const conn = (typeof ctx.get === 'function' ? ctx.get('connection') : null) || ctx.connection
          return conn && typeof conn.requestRejection === 'function' ? conn : null
        } catch (e) { return null }
      }
      function deny(req, res, code) {
        try { res.statusCode = code || 403; res.end() } catch (e) {}
        return true
      }
      function register(route) {
        const inner = route.handler
        const wrapped = Object.assign({}, route, {
          handler: async (rq, rs) => {
            const isWrite = WRITE.has(String(rq.method || 'GET').toUpperCase())
            if (!hostUrl(rq)) return deny(rq, rs, 403) // 缺 Host / 畸形 → 拒
            const conn = fence()
            if (conn) {
              // 委托宿主栅栏（它内部还有一层浏览器鉴权，未认证会回 401）；它抛异常按拒绝处理，不 fail-open
              let code
              try { code = conn.requestRejection(rq) } catch (e) { return deny(rq, rs, 403) }
              if (code !== undefined && code !== null && code !== false) return deny(rq, rs, typeof code === 'number' ? code : 403)
            } else if (!fromLoopback(rq)) {
              return deny(rq, rs, 403) // 没有宿主栅栏时，至少只放行本机
            }
            // 写请求（改配置、写凭据）无论部署形态都必须来自本机
            if (isWrite && !fromLoopback(rq)) return deny(rq, rs, 403)
            return inner(rq, rs).catch((err) => {
              try { rs.writeHead(200, JSON_HEADERS); rs.end(JSON.stringify({ ok: false, code: 'THROW', error: String(err && err.message || err).slice(0, 200) })) } catch (e) {}
            })
          },
        })
        disposers.push(ctx.webServer.register(wrapped))
      }

      // —— 实时计量：会话事件流里的真实 usage ——
      let turnAgg = null, lastFlush = 0
      const subagentSessions = new Set()
      function noteSubagent(info) {
        try {
          const id = info && (info.sessionId || (info.session && info.session.id))
          if (id) subagentSessions.add(String(id))
        } catch (e) {}
      }
      function addUsage(model, u) {
        const led = readLedger()
        const k = dayKey()
        const day = led.days[k] || (led.days[k] = { input: 0, cache: 0, output: 0, tokens: 0, cost: 0, calls: 0 })
        day.input += u.input; day.cache += u.cache; day.output += u.output
        day.tokens += u.input + u.cache + u.output; day.calls += 1
        // 注意：DSH 的 outputTokens 已包含 reasoningTokens，不能再单独累加
        if (model) {
          const bm = led.byModel[k] || (led.byModel[k] = {})
          const it = bm[model] || (bm[model] = { input: 0, cache: 0, output: 0, tokens: 0 })
          it.input += u.input; it.cache += u.cache; it.output += u.output; it.tokens += u.input + u.cache + u.output
        }
        const m = moneyFor(model, u)
        if (m != null) day.cost = Math.round((day.cost + m) * 1e6) / 1e6
        markLedger()
      }
      try { disposers.push(ctx.on('subagent/start', noteSubagent)) } catch (e) {}

      disposers.push(ctx.on('session/event', (session, event) => {
        try {
          const type = event && event.type
          const d = event && event.data
          if (!d || typeof d !== 'object') return
          if (type === 'turn/end') {
            if (turnAgg) {
              const led = readLedger()
              led.seq += 1
              led.lastTurn = Object.assign({ seq: led.seq, at: new Date().toISOString() }, turnAgg)
              turnAgg = null
              flushLedger()
            }
            return
          }
          if (type !== 'assistant/message') return
          const usage = d.usage
          if (!usage || typeof usage !== 'object') return
          const sid = session && session.id ? String(session.id) : 'default'
          const u = { input: num(usage.inputTokens), cache: num(usage.cacheReadTokens), output: num(usage.outputTokens) }
          const model = (d.message && d.message.source && d.message.source.model) || ''
          if (turnAgg && turnAgg.turn !== d.turn) {
            addUsage(turnAgg.model, { input: 0, cache: 0, output: 0 })
            turnAgg = null
          }
          if (!turnAgg) turnAgg = { turn: d.turn, model: model || '', sessions: new Set(), input: 0, cache: 0, output: 0 }
          turnAgg.sessions.add(sid)
          if (model) turnAgg.model = model
          turnAgg.input += u.input; turnAgg.cache += u.cache; turnAgg.output += u.output
          addUsage(model, u)
          if (Date.now() - lastFlush > 8000) { lastFlush = Date.now(); flushLedger() }
        } catch (e) {}
      }))
      disposers.push(ctx.on('session/disposed', () => { }))
      root.effect(() => () => { for (const d of disposers) { try { if (typeof d === 'function') d() } catch (e) {} } flushLedger() })

      // —— 聚合状态 ——
      let cache = null, inFlight = null
      async function buildState(refresh) {
        if (!refresh && cache && Date.now() - cache.at < Math.max(5000, num(readConfig().refreshMs) - 3000)) return cache
        const led = readLedger()
        const k = dayKey()
        const day = led.days[k] || { input: 0, cache: 0, output: 0, tokens: 0, cost: 0, calls: 0 }
        const [tpm, freeTier, bss] = await Promise.all([snapshotTpm(ctx), snapshotFreeTier(), snapshotBss(ctx)])
        cache = {
          at: Date.now(), version: BUILD_VERSION,
          config: (() => { const c = clone(readConfig()); c.bss = Object.assign({}, c.bss, { idMasked: '' }); return c })(),
          today: Object.assign({}, day, {
            money: day.cost > 0 ? '¥' + day.cost.toFixed(4) : null,
            byModel: (led.byModel && led.byModel[k]) || {},
          }),
          yesterday: led.days[dayKey(new Date(Date.now() - 86400000))] || null,
          lastTurn: led.lastTurn, seq: led.seq,
          tpm, freeTier, bss,
          consoleLoggedIn: !!consoleCred() || lastCredSource === 'pasted', blPath: findBl(),
          priceConfigured: Object.keys((readConfig().prices) || {}).length,
        }
        return cache
      }

      register({
        kind: 'exact', path: '/dsh-bailian/widget.js',
        handler: async (rq, rs) => {
          let text = ''
          for (const p of [path.join(PACKAGE_ROOT, 'assets', 'widget.js'), path.join(process.env.DSH_HOME || '', 'plugin-src', 'dsh-bailian-balance', 'assets', 'widget.js')]) {
            try { text = fs.readFileSync(p, 'utf8'); break } catch (e) {}
          }
          rs.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
          rs.end(text)
        },
      })

      register({
        kind: 'exact', path: '/dsh-bailian/state.json',
        handler: async (rq, rs) => {
          const refresh = new URL(rq.url || '/', 'http://localhost').searchParams.get('refresh') === '1'
          let payload
          if (inFlight) payload = await inFlight
          else { inFlight = buildState(refresh).finally(() => { inFlight = null }); payload = await inFlight }
          flushLedger()
          rs.writeHead(200, JSON_HEADERS); rs.end(JSON.stringify(payload))
        },
      })

      register({
        kind: 'exact', path: '/dsh-bailian/config.json',
        handler: async (rq, rs) => {
          if (String(rq.method).toUpperCase() === 'GET') {
            rs.writeHead(200, JSON_HEADERS); rs.end(JSON.stringify({ ok: true, config: readConfig() })); return
          }
          const body = await new Promise((resolve) => { let s = ''; rq.on('data', (c) => { s += c }); rq.on('end', () => resolve(s)) })
          let patch = {}
          try { patch = JSON.parse(body || '{}') } catch (e) { rs.writeHead(400, JSON_HEADERS); rs.end('{"ok":false,"error":"bad json"}'); return }
          // AK/SK 不落本地配置文件，走 DSH 官方凭据存储（settings user 层的 refs）
          const secret = typeof patch.__akSecret === 'string' ? patch.__akSecret : ''
          const akId = typeof patch.__akId === 'string' ? patch.__akId : ''
          const pasted = typeof patch.__consoleToken === 'string' ? patch.__consoleToken.trim() : ''
          delete patch.__akSecret; delete patch.__akId; delete patch.__consoleToken
          if (akId || secret) {
            const c = readConfig()
            try {
              if (akId) await ctx.credentials.set(c.bss.idRef, akId)
              if (secret) await ctx.credentials.set(c.bss.secretRef, secret)
              if (!c.bss.enabled) patch.bss = Object.assign({}, c.bss, { enabled: true })
            } catch (e) { log('AK/SK 写入凭据失败：' + String(e && e.message || e)) }
          }
          if (pasted) {
            try { await ctx.credentials.set(CONSOLE_TOKEN_REF, pasted); lastCredSource = 'pasted' }
            catch (e) { log('console token 写入凭据库失败：' + String(e && e.message || e)) }
          }
          const next = writeConfig(merge(readConfig(), sanitizeConfigPatch(patch)))
          cache = null
          rs.writeHead(200, JSON_HEADERS); rs.end(JSON.stringify({ ok: true, config: next }))
        },
      })

      register({
        kind: 'exact', path: '/dsh-bailian/login.json',
        handler: async (rq, rs) => {
          // 这个路由会拉起子进程，必须是显式 POST：否则任何一次 GET（预取、爬虫、
          // 手滑输错 URL）都会真的开一个登录进程。
          if (String(rq.method || 'GET').toUpperCase() !== 'POST') { deny(rq, rs, 405); return }
          const bl = findBl()
          rs.writeHead(200, JSON_HEADERS)
          if (!bl) { rs.end(JSON.stringify({ ok: false, code: 'NO_BL', error: '没找到 bl / bailian CLI。本机 PATH 上没有 npm，官方 README 的 `npm i -g bailian-cli` 走不通；可行做法是用 DSH 自带的 pnpm 装一份到 ~/.dsh/tools/bailian-cli，面板会自动识别。' })); return }
          try {
            const { spawn } = await import('child_process')
            // bl 2.3.2 在 Windows 上用 `cmd /c start <url>` 开浏览器，而回调 URL 含 `&needapikey=true`，
            // 会被 cmd 当命令分隔符拆断 ⇒ 自带开浏览器必然失败（登录本身仍能成，但要靠人手动开）。
            // 所以这里不 unref 丢出去，而是把 stdout/stderr 里的登录 URL 抓回来交给面板点。
            // 已经在跑就复用，别一次点击叠一个进程
            if (loginChild && !loginChild.killed && loginChild.exitCode === null) {
              rs.end(JSON.stringify({ ok: true, code: 'ALREADY_RUNNING', note: '登录进程已在运行，请在浏览器里完成授权。', url: loginUrl || null }))
              return
            }
            const child = spawn(bl.cmd, bl.args.concat(['auth', 'login', '--console']), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
            loginChild = child
            disposers.push(() => { try { if (child.exitCode === null) child.kill() } catch (e) {} })
            let buf = ''
            const url = await new Promise((resolve) => {
              const to = setTimeout(() => resolve(null), 15000)
              const grab = (d) => {
                buf += String(d)
                const m = buf.match(/https:\/\/[a-z.]*console\.aliyun[a-z.]*\.com\/console-login\?\S+/i)
                if (m) { clearTimeout(to); resolve(m[0]) }
              }
              child.stdout.on('data', grab); child.stderr.on('data', grab)
            })
            child.stdout.resume(); child.stderr.resume()
            rs.end(JSON.stringify({
              ok: true, started: true, bin: bl.label, url: url || null,
              note: url ? '已取到登录链接，点开用浏览器完成授权（bl 自己开浏览器在 Windows 上有 bug，会失败）'
                : '已拉起 bl auth login --console；若浏览器没自动弹出，请手动完成登录',
            }))
          } catch (e) { rs.end(JSON.stringify({ ok: false, code: 'SPAWN_FAIL', error: String(e && e.message || e).slice(0, 200) })) }
        },
      })

      log('已装载 v' + BUILD_VERSION + ' · 路由 /dsh-bailian/{widget.js,state.json,config.json,login.json}')
    })
  },
}
