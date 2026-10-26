// 券类型过滤（离线单元测试）
// 实测依据：QueryCashCoupons 的响应里**没有类型字段**，11 个键中唯一能区分
// 代金券与满减券的只有 Description 文本（"满199减35元" vs "…账户代金券"）。
// 满减券不是现金等价物，混进余额里会把数字算高，所以默认要滤掉并如实告知数量。
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = pathToFileURL(path.resolve(here, '..', 'lib', 'index.js')).href

let pass = 0
let fail = 0
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + label) }
  else { fail++; console.log('  FAIL ' + label + (extra ? ' → ' + extra : '')) }
}

const mod = await import(SRC)
const map = (mod.__test || {}).mapCoupons
ok('lib 暴露了可测的 mapCoupons', typeof map === 'function', typeof map)
if (typeof map !== 'function') {
  console.log('\n' + pass + ' passed, ' + fail + ' failed')
  process.exit(1)
}

const REAL = [
  { CashCouponNo: '000000000001', Description: '满199减35元', Balance: '35.00', NominalValue: '35.00', Status: 'Available', ExpiryTime: '2099-11-08T16:00:00Z' },
  { CashCouponNo: '000000000002', Description: '满99减15元', Balance: '15.00', NominalValue: '15.00', Status: 'Available', ExpiryTime: '2099-11-08T16:00:00Z' },
  { CashCouponNo: '000000000003', Description: '满20减10元', Balance: '10.00', NominalValue: '10.00', Status: 'Available', ExpiryTime: '2099-11-08T16:00:00Z' },
  { CashCouponNo: '000000000004', Description: '示例账户代金券（合成数据）', Balance: '123.45', NominalValue: '300.00', Status: 'Available', ExpiryTime: '2099-12-31T03:00:00Z' },
]

// ① 默认：只留代金券，满减券被滤掉但数量要报出来
{
  const r = map(REAL, true)
  ok('默认滤掉满减券', r.list.length === 1 && /代金券/.test(r.list[0].name), JSON.stringify(r.list.map((x) => x.name)))
  ok('报出被隐藏的满减券数量', r.hidden === 3, 'hidden=' + r.hidden)
  ok('不静默丢数据（hidden>0 时有说明）', typeof r.hiddenNote === 'string' && r.hiddenNote.length > 0, r.hiddenNote)
}

// ② 关掉过滤：四张全在
{
  const r = map(REAL, false)
  ok('关闭过滤后全部保留', r.list.length === 4 && r.hidden === 0, 'len=' + r.list.length)
}

// ③ 各种满减写法都要认得，别把代金券误杀
{
  const cases = [
    ['满1000减100元', true], ['满 199 减 35 元', true], ['满3000减300', true],
    ['立减50元券', true], ['8折优惠券', true],
    ['示例账户代金券（合成数据）', false], ['通用账户代金券', false], ['测试代金券', false],
  ]
  let bad = []
  for (const [desc, wantVoucher] of cases) {
    const isV = (mod.__test || {}).isDiscountVoucher
    const got = typeof isV === 'function' ? isV(desc) : null
    if (got !== wantVoucher) bad.push(desc + ' 期望 ' + wantVoucher + ' 实得 ' + got)
  }
  ok('满减识别覆盖多种写法且不误杀代金券', bad.length === 0 && typeof (mod.__test || {}).isDiscountVoucher === 'function',
    bad.join('；'))
}

// ④ 空列表 / 缺字段不炸
{
  ok('空列表安全', map([], true).list.length === 0)
  ok('缺 Description 不当成满减', map([{ CashCouponNo: 'x', Balance: '1' }], true).list.length === 1)
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
