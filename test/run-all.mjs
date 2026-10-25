// 一条命令跑完三套测试：node test/run-all.mjs
// 两套离线套件：纯 Node、零依赖、不发任何外部请求
//（凭据通道那套起的是 127.0.0.1 的本地假网关）。
// 另有 test/live-check.mjs —— 它会向阿里云发真实请求，需要本机凭据，
// 故意**不**包含在这里，免得一跑 npm test 就烧到真实账号。
// 关键：每套都在**独立的临时 DSH_HOME / BAILIAN_CONFIG_DIR** 里跑，
// 否则会写到调用者真实的 ~/.dsh 账本与百炼登录态上（曾经踩过）。
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const SUITES = [
  ['免费额度凭据通道（本地假网关）', [path.join(here, 'console-token.mjs')]],
  ['前端渲染冒烟（DOM 桩）', [path.join(here, 'dom-smoke.mjs'), path.join(root, 'assets', 'widget.js')]],
]

// —— 自测守卫：测试夹具不许被 ci.yml 的 secret 扫描规则命中 ——
// 真实教训：某个夹具的假 key 在 sk- 之后正好凑满 20 个字符（连字符也算进字符类），
// 被自家 CI 的 secret 规则判成疑似真凭据，四个 job 全红。所以夹具要短、且带 fake 字样。
{
  const PAT = /sk-[A-Za-z0-9-]{20,}|LTAI[0-9A-Za-z]{16,}/g
  const bad = []
  for (const f of fs.readdirSync(here)) {
    if (!/\.mjs$/.test(f)) continue
    const txt = fs.readFileSync(path.join(here, f), 'utf8')
    for (const m of txt.matchAll(PAT)) {
      if (!/fake|FAKE|dummy|example|sample/i.test(m[0])) bad.push(f + ' -> ' + m[0].slice(0, 26))
    }
  }
  if (bad.length) {
    console.error('  FAIL 夹具会被 CI secret 扫描命中：' + bad.join(', '))
    process.exit(1)
  }
  console.log('  [OK]   测试夹具不会被 CI 的 secret 扫描规则命中')
}

let failed = 0
for (const [label, args] of SUITES) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbl-test-'))
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: Object.assign({}, process.env, { DSH_HOME: sandbox, BAILIAN_CONFIG_DIR: sandbox }),
  })
  try { fs.rmSync(sandbox, { recursive: true, force: true }) } catch (e) { /* Windows 偶发占用，忽略 */ }
  const okRun = r.status === 0
  console.log((okRun ? '  [OK]  ' : '  [FAIL]') + ' ' + label + (okRun ? '' : ' (exit ' + r.status + ')'))
  console.log('')
  if (!okRun) failed++
}
console.log(failed ? failed + ' 套测试失败' : '全部通过')
process.exit(failed ? 1 : 0)
