// dsh-bailian-balance —— 注入到 DSH 界面的前端面板（纯 vanilla，不依赖宿主模块）
(function () {
  'use strict'
  if (window.__DSH_BAILIAN_BALANCE__) return
  window.__DSH_BAILIAN_BALANCE__ = true

  var P = 'dshbl'
  // —— 配色：终末地（dsh-endfield-theme）HUD 语言 ——
  // 一律「宿主变量优先 + 硬编码兜底」：装了 endfield 主题就完全跟随它，没装也不难看。
  // 关键令牌（从主题 theme.css 实测抽出）：--ef-y #f2f013 酸黄 / --ef-ink-900 #0a0c0c 墨黑
  // / --ef-power-nominal|low|empty 电量三色 / --dsw-alias-state-* 状态色 / 字体 Endfield Tech。
  var baseCss = [
    // —— 令牌 ——
    // 强调色仍取主题的酸黄（跟 dsh-endfield-theme 一致），但表面一律用实色，
    // 不再用半透明白叠加 —— 那是在深色底上产生「灰蒙蒙奶雾」的根源。
    '.' + P + '-drawer,.' + P + '-panel,.' + P + '-pill,.' + P + '-handle{',
    '--base:#08090C;--surf:#0E1116;--raise:#151A21;--raise2:#1B222B;',
    '--line:#1E2530;--line2:#2A3341;',
    '--txt:#EEF2F8;--txt2:#AEB9C8;--dim:#7C8899;--dim3:#5D687A;',
    '--ok:#7ED9A0;--warn:#F5B94B;--bad:#FF6B6B;',
    '--tech:"Endfield Tech",Saira,ui-monospace,SFMono-Regular,Menlo,monospace;',
    '--sans:"Endfield Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
    '--r:10px;--r2:14px;--ease:cubic-bezier(.22,.61,.36,1);--dur:.16s}',
    // —— 把手：实色小竖卡 + 靠屏一侧酸黄实边 + 顶部状态点 + 底部余额胶囊 ——
    '.' + P + '-handle{position:fixed;z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:9px;',
    'padding:11px 7px 10px;background:var(--surf);color:var(--txt2);border:1px solid var(--line);',
    'font:9.5px/1.5 var(--tech);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;user-select:none;',
    'writing-mode:vertical-rl;touch-action:none;opacity:.92;',
    'box-shadow:0 10px 34px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);',
    'transition:opacity var(--dur),border-color var(--dur),color var(--dur),transform var(--dur)}',
    '.' + P + '-handle.right{right:0;border-right:none;border-radius:13px 0 0 13px;box-shadow:inset 3px 0 0 var(--acc),0 10px 34px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05)}',
    '.' + P + '-handle.left{left:0;border-left:none;border-radius:0 13px 13px 0;box-shadow:inset -3px 0 0 var(--acc),0 10px 34px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05)}',
    '.' + P + '-handle:hover{opacity:1;color:var(--txt);border-color:var(--line2)}',
    '.' + P + '-handle.right:hover{transform:translateX(-2px)}',
    '.' + P + '-handle.left:hover{transform:translateX(2px)}',
    '.' + P + '-handle.open{opacity:.35}',
    '.' + P + '-handle.open:hover{opacity:1}',
    // 把手内部：状态点 / 竖排标签 / 余额胶囊
    '.' + P + '-hdot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:0 0 auto;',
    'box-shadow:0 0 10px var(--ok);writing-mode:horizontal-tb}',
    '.' + P + '-hdot.warn{background:var(--warn);box-shadow:0 0 10px var(--warn)}',
    '.' + P + '-hdot.err{background:var(--bad);box-shadow:0 0 10px var(--bad)}',
    '.' + P + '-hlabel{color:var(--dim);letter-spacing:.22em}',
    '.' + P + '-hamt{writing-mode:horizontal-tb;display:flex;align-items:baseline;gap:3px;padding:3px 5px;',
    'border-radius:6px;background:var(--acc-12);border:1px solid var(--acc-28)}',
    '.' + P + '-hamt b{font-weight:600;color:var(--acc);font-size:12px;letter-spacing:0;font-variant-numeric:tabular-nums}',
    '.' + P + '-hamt i{font-style:normal;color:var(--acc-lo);font-size:8.5px;letter-spacing:.08em}',
    '.' + P + '-hsub{writing-mode:horizontal-tb;font-size:9px;color:var(--dim3);letter-spacing:.06em}',
    // —— 抽屉：实色底，无 backdrop-filter ——
    '.' + P + '-drawer{position:fixed;top:48px;bottom:12px;right:0;z-index:2147483001;overflow:auto;',
    'padding:0 18px 24px;transform:translateX(103%);transition:transform .22s var(--ease);',
    'border:1px solid var(--line);border-right:none;border-radius:16px 0 0 16px;background:var(--base);color:var(--txt);',
    'font:12.5px/1.7 var(--sans);max-width:92vw;',
    'box-shadow:-24px 16px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.04)}',
    '.' + P + '-drawer.left{left:0;right:auto;border-radius:0 16px 16px 0;border-right:1px solid var(--line);border-left:none;',
    'transform:translateX(-103%)}',
    '.' + P + '-drawer.open{transform:none}',
    '.' + P + '-hz{height:1px;margin:0 -18px 16px;background:linear-gradient(90deg,transparent,var(--acc-40) 25%,var(--acc-40) 75%,transparent)}',
    '.' + P + '-drawer::-webkit-scrollbar{width:10px}',
    '.' + P + '-drawer::-webkit-scrollbar-thumb{background:var(--line2);border-radius:8px;border:3px solid transparent;background-clip:padding-box}',
    '.' + P + '-drawer::-webkit-scrollbar-thumb:hover{background:#3A4553;background-clip:padding-box;border:3px solid transparent}',
    '.' + P + '-drawer::-webkit-scrollbar-track{background:transparent}',
    // —— 头部 ——
    '.' + P + '-hd{padding-right:96px;padding-top:16px}',
    '.' + P + '-hd h4{margin:0;font:500 13.5px/1.4 var(--sans);letter-spacing:.01em;display:flex;align-items:center;gap:10px;color:var(--txt)}',
    '.' + P + '-mark{width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:var(--acc);box-shadow:0 0 0 3px var(--acc-12),0 0 14px var(--acc-28)}',
    '.' + P + '-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font:10px/1.6 var(--tech);letter-spacing:.1em;text-transform:uppercase;color:var(--dim3)}',
    '.' + P + '-meta span:not(:first-child):before{content:"";display:inline-block;width:1px;height:9px;background:var(--line2);margin-right:10px;vertical-align:-1px}',
    '.' + P + '-chip.v{color:var(--acc-lo)}',
    '.' + P + '-acts{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}',
    // —— 摘要三行：不用卡片容器，靠留白与基线对齐建立层级 ——
    '.' + P + '-sum{display:flex;flex-direction:column;gap:10px;margin:18px 0 2px}',
    '.' + P + '-sumrow{display:flex;align-items:baseline;gap:8px;min-width:0}',
    '.' + P + '-k{font:500 9px/1.6 var(--tech);letter-spacing:.16em;text-transform:uppercase;',
    'color:var(--dim3);width:34px;flex:0 0 auto}',
    '.' + P + '-sumrow b{font:400 21px/1.15 var(--tech);letter-spacing:-.01em;',
    'font-variant-numeric:tabular-nums;color:var(--txt)}',
    '.' + P + '-sumrow b.acc{color:var(--acc)}',
    '.' + P + '-u{font-size:10.5px;color:var(--dim3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.' + P + '-sumrow em{font-style:normal;font:400 12.5px/1 var(--tech);color:var(--dim);',
    'font-variant-numeric:tabular-nums}',
    '.' + P + '-gauge{display:flex;align-items:center;gap:8px}',
    '.' + P + '-track{flex:1 1 auto;height:2px;background:var(--raise2);border-radius:2px;overflow:hidden}',
    '.' + P + '-track u{display:block;height:100%;border-radius:2px;transition:width .35s var(--ease)}',
    '.' + P + '-pct{font:400 11px/1 var(--tech);color:var(--dim);font-variant-numeric:tabular-nums;',
    'width:38px;text-align:right}',
    // —— 标签条 ——
    '.' + P + '-tabs{display:flex;gap:22px;margin:20px 0 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}',
    '.' + P + '-tab{padding:0 0 11px;font:500 10.5px/1.4 var(--tech);letter-spacing:.14em;text-transform:uppercase;',
    'color:var(--dim);cursor:pointer;white-space:nowrap;position:relative;transition:color var(--dur)}',
    '.' + P + '-tab:hover{color:var(--txt2)}',
    '.' + P + '-tab.on{color:var(--txt)}',
    '.' + P + '-tab.on:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--acc);border-radius:2px;box-shadow:0 0 12px var(--acc-28)}',
    '.' + P + '-body{animation:' + P + '-in .2s var(--ease)}',
    '@keyframes ' + P + '-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    // —— 旧胶囊模式 ——
    '.' + P + '-pill{position:fixed;left:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:9px;',
    'padding:8px 14px;border-radius:999px;font:11.5px/1.5 var(--tech);letter-spacing:.04em;cursor:pointer;',
    'background:var(--surf);color:var(--txt);border:1px solid var(--line);user-select:none;max-width:min(52vw,560px);',
    'box-shadow:0 10px 30px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04)}',
    '.' + P + '-pill:hover{border-color:var(--line2)}',
    '.' + P + '-pill b{font-weight:600;color:var(--acc);font-variant-numeric:tabular-nums}',
    '.' + P + '-panel{position:fixed;left:16px;bottom:56px;z-index:2147483001;width:640px;max-width:calc(100vw - 32px);',
    'max-height:min(78vh,760px);overflow:auto;border-radius:var(--r2);border:1px solid var(--line);background:var(--base);',
    'color:var(--txt);font:12.5px/1.7 var(--sans);box-shadow:0 24px 60px rgba(0,0,0,.6);padding:16px 18px}',
    // —— 内容原子 ——
    '.' + P + '-dot{width:6px;height:6px;border-radius:50%;background:var(--ok);flex:0 0 auto;display:inline-block;box-shadow:0 0 8px var(--ok)}',
    '.' + P + '-dot.warn{background:var(--warn);box-shadow:0 0 8px var(--warn)}',
    '.' + P + '-dot.err{background:var(--bad);box-shadow:0 0 8px var(--bad)}',
    '.' + P + '-sec{margin:22px 0 10px;font:500 9px/1.5 var(--tech);letter-spacing:.18em;text-transform:uppercase;',
    'color:var(--dim);display:flex;align-items:center;gap:12px}',
    // 列间距做进 padding：用 grid gap 会让每格 border-bottom 在列间断成两截
    '.' + P + '-kv{display:grid;grid-template-columns:auto 1fr;gap:0;font-size:12.5px}',
    '.' + P + '-kv>span{padding:9px 0;border-bottom:1px solid var(--line)}',
    '.' + P + '-kv>span:nth-child(odd){color:var(--dim);white-space:nowrap;padding-right:18px}',
    '.' + P + '-kv>span:nth-child(even){text-align:right;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere;color:var(--txt)}',
    '.' + P + '-kv>span:nth-last-child(-n+2){border-bottom:none}',
    '.' + P + '-grid{display:grid;grid-template-columns:1fr auto auto auto;gap:0;font:12px/1 var(--tech);',
    'font-variant-numeric:tabular-nums;padding-bottom:6px}',
    '.' + P + '-grid b{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:500;padding:0 0 9px}',
    '.' + P + '-grid b:not(:first-child),.' + P + '-grid>span:not(:first-child){padding-left:14px}',
    '.' + P + '-grid>span{padding-top:9px;padding-bottom:9px;align-self:center;color:var(--txt2)}',
    '.' + P + '-rule{grid-column:1/-1;height:1px;background:var(--line2)}',
    '.' + P + '-num{text-align:right}',
    '.' + P + '-g5{grid-template-columns:1fr auto auto auto auto}',
    '.' + P + '-bar{height:3px;border-radius:999px;background:var(--raise2);overflow:hidden;margin-top:8px;grid-column:1/-1}',
    '.' + P + '-bar i{display:block;height:100%;border-radius:999px;transition:width .35s var(--ease)}',
    '.' + P + '-badge{display:inline-block;padding:2px 8px;border-radius:999px;font:500 9px/1.7 var(--tech);',
    'letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--line2);background:var(--raise);color:var(--dim)}',
    '.' + P + '-badge.on{border-color:rgba(126,217,160,.35);color:var(--ok);background:rgba(126,217,160,.10)}',
    '.' + P + '-badge.warn{border-color:rgba(245,185,75,.35);color:var(--warn);background:rgba(245,185,75,.10)}',
    '.' + P + '-badge.na{opacity:.5}',
    '.' + P + '-badge.bad{border-color:rgba(255,107,107,.35);color:var(--bad);background:rgba(255,107,107,.10)}',
    // 代金券：实色卡 + 顶部渐隐酸黄线 + 大额酸黄读数
    '.' + P + '-ticket{position:relative;background:var(--surf);border:1px solid var(--line);border-radius:var(--r2);',
    'padding:15px 16px;margin:12px 0;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}',
    '.' + P + '-ticket:before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--acc-40),transparent)}',
    '.' + P + '-tkt-hd{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12.5px;font-weight:500;color:var(--txt)}',
    '.' + P + '-tkt-big{font:400 32px/1.1 var(--tech);letter-spacing:-.02em;margin-top:12px;color:var(--acc);font-variant-numeric:tabular-nums}',
    '.' + P + '-tkt-big s{font:400 11px/1 var(--sans);color:var(--dim3);text-decoration:none;margin-left:10px;letter-spacing:.02em}',
    '.' + P + '-tkt-ft{margin-top:12px;padding-top:11px;border-top:1px solid var(--line);font-size:11px;color:var(--dim);line-height:1.8}',
    // 按钮：实色幽灵态；主按钮酸黄底 + 近黑字
    '.' + P + '-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;',
    'border:1px solid var(--line2);background:var(--raise);color:var(--txt2);font:500 10.5px/1.6 var(--tech);',
    'letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all var(--dur)}',
    '.' + P + '-btn:hover{background:var(--raise2);border-color:#3A4553;color:var(--txt)}',
    '.' + P + '-btn:active{transform:translateY(1px)}',
    '.' + P + '-btn.pri{background:var(--acc);border-color:var(--acc);color:var(--acc-on);font-weight:600}',
    '.' + P + '-btn.pri:hover{background:var(--acc-hi);border-color:var(--acc-hi);color:var(--acc-on)}',
    '.' + P + '-accrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.' + P + '-sw{width:26px;height:26px;border-radius:8px;border:1px solid var(--line2);cursor:pointer;padding:0;transition:transform var(--dur),border-color var(--dur)}',
    '.' + P + '-sw:hover{transform:translateY(-1px)}',
    '.' + P + '-sw.on{border-color:var(--txt);box-shadow:0 0 0 2px var(--base),0 0 0 3px var(--acc)}',
    'input[type=color].' + P + '-swc{width:34px;height:26px;padding:0;border:1px solid var(--line2);border-radius:8px;background:var(--surf);cursor:pointer}',
    '.' + P + '-ob{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 0;padding:8px 11px;border:1px solid var(--line);border-radius:9px;background:var(--surf);font-size:11.5px;color:var(--dim2)}',
    '.' + P + '-wiz{margin:14px 0 0;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:var(--surf);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}',
    '.' + P + '-step{display:flex;gap:9px;align-items:flex-start;padding:7px 0;font-size:12px;line-height:1.6}',
    '.' + P + '-step b{font-weight:500;color:var(--txt)}',
    '.' + P + '-step span{color:var(--dim3);font-size:11px;display:block}',
    '.' + P + '-tick{width:14px;height:14px;border-radius:50%;flex:0 0 auto;margin-top:3px;border:1px solid var(--line2);background:transparent}',
    '.' + P + '-tick.done{background:var(--ok);border-color:var(--ok);box-shadow:0 0 8px rgba(126,217,160,.4)}',
    '.' + P + '-wizhd{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px}',
    '.' + P + '-muted{color:var(--dim);font-size:11.5px}',
    '.' + P + '-note{border:1px solid var(--line);border-left:2px solid var(--warn);padding:10px 12px;background:var(--surf);',
    'border-radius:0 var(--r) var(--r) 0;font-size:11.5px;margin:10px 0;line-height:1.75;color:var(--txt2)}',
    '.' + P + '-note.err{border-left-color:var(--bad);background:rgba(255,107,107,.06)}',
    '.' + P + '-note.ok{border-left-color:var(--ok);background:rgba(126,217,160,.06)}',
    'code.' + P + '-code{background:var(--raise);padding:1px 6px;border-radius:5px;font-family:var(--tech);font-size:11px;',
    'user-select:all;color:var(--acc-hi);border:1px solid var(--line2)}',
    '.' + P + '-in{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;border:1px solid var(--line2);',
    'background:#06080C;color:var(--txt);font:12px var(--tech);transition:border-color var(--dur),box-shadow var(--dur)}',
    '.' + P + '-in:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-12)}',
    '@media (prefers-reduced-motion:reduce){.' + P + '-drawer,.' + P + '-bar i,.' + P + '-btn,.' + P + '-tab,.' + P + '-handle{transition:none}',
    '.' + P + '-body{animation:none}}'
  ].join('\n')

  // —— 强调色：单一变量驱动 + 可读性钳制 ——
  // 只暴露一个可调项（用户面对 12 个变量只会关掉面板）。派生量全部由这一个 hex 算出来。
  var ACCENT_DEFAULT = '#4FA8FF'
  var PRESETS = [['天蓝', '#4FA8FF'], ['青碧', '#2FD4C4'], ['紫电', '#8A7BFF'], ['酸黄', '#F2F013']]
  var styleEl = null, accentNow = ACCENT_DEFAULT, accFromConfig = null

  function hexToRgb(h) {
    h = String(h || '').trim().replace('#', '')
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  function toHex(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16) }
  function rgbToHex(r, g, b) { return '#' + toHex(r) + toHex(g) + toHex(b) }
  function rgbToHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0
    if (mx !== mn) {
      var d = mx - mn
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      else if (mx === g) h = ((b - r) / d + 2) / 6
      else h = ((r - g) / d + 4) / 6
    }
    return [h, s, l]
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  function hslToRgb(h, s, l) {
    if (s === 0) { var v = l * 255; return [v, v, v] }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
    return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255]
  }
  // 用户可能挑一个近黑或近白的颜色：宁可偏离他选的那一点，也不能让余额数字看不见。
  function clampAccent(hex) {
    var c = hexToRgb(hex)
    if (!c) return ACCENT_DEFAULT
    var hsl = rgbToHsl(c), h = hsl[0], s = hsl[1], l = hsl[2]
    if (l < 0.35) l = 0.55
    else if (l > 0.92) l = 0.86
    if (s < 0.15) s = 0.30
    var r = hslToRgb(h, s, l)
    return rgbToHex(r[0], r[1], r[2])
  }
  function shade(hex, dl) {
    var c = hexToRgb(hex)
    if (!c) return hex
    var hsl = rgbToHsl(c)
    var r = hslToRgb(hsl[0], hsl[1], Math.max(0.04, Math.min(0.96, hsl[2] + dl)))
    return rgbToHex(r[0], r[1], r[2])
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex)
    return c ? 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')' : 'transparent'
  }
  function accentBlock(hex) {
    var a = clampAccent(hex)
    var hsl = rgbToHsl(hexToRgb(a) || [0, 0, 0])
    // 深底字用近白、亮底字用近黑，主按钮才不会糊成一片
    var on = hsl[2] > 0.6 ? '#06070A' : '#FFFFFF'
    // 注意：这里必须是 + 拼接。写成 `return A, B, C` 会被当成逗号运算符，
    // 只返回最后一项 —— 就是这个 bug 让 --acc 整段消失（冒烟测试抓到的）。
    return '\n.' + P + '-drawer,.' + P + '-panel,.' + P + '-pill,.' + P + '-handle{' +
      '--acc:' + a + ';--acc-hi:' + shade(a, 0.18) + ';--acc-lo:' + shade(a, -0.40) + ';' +
      '--acc-12:' + rgba(a, 0.12) + ';--acc-28:' + rgba(a, 0.28) + ';--acc-40:' + rgba(a, 0.40) + ';' +
      '--acc-on:' + on + '}'
  }
  function applyAccent(hex) {
    accentNow = clampAccent(hex)
    if (styleEl) styleEl.textContent = baseCss + accentBlock(accentNow)
  }
  function accentOfState() {
    var w = (state && state.config && state.config.widget) || {}
    return clampAccent(w.accent || ACCENT_DEFAULT)
  }

  var state = null, timer = null, tab = 'live', open = false, busy = false, toast = null, loginUrl = null, offsetOverride = null

  function el(tag, cls, html) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (html != null) e.innerHTML = html
    return e
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function kfmt(n) {
    n = Number(n) || 0
    if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'
    if (n >= 1e4) return (n / 1e4).toFixed(2) + ' 万'
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
    return String(n)
  }
  function ago(ts) {
    if (!ts) return '—'
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000))
    return s < 60 ? s + ' 秒前' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : Math.round(s / 3600) + ' 小时前'
  }
  var DEFAULTS_MODELS = ['qwen3.8-flash', 'qwen3.8-max']
  // 金额：BSS 返回的是字符串（"295.99"），非数值一律显示 —，不臆造 0
  function money(v) {
    if (v == null || v === '') return '—'
    var n = Number(v)
    return isFinite(n) ? '¥' + n.toFixed(2) : '—'
  }

  function pull(refresh) {
    var url = '/dsh-bailian/state.json' + (refresh ? '?refresh=1' : '')
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }).then(function (j) { state = j; render(); return j })
      .catch(function (e) { if (!state) state = { at: Date.now(), fatal: String(e && e.message || e), version: '?' }; render() })
  }

  function post(path, body) {
    return fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json() })
  }

  // ── 外壳：默认「屏幕边缘把手 + 侧边抽屉」；旧的左下胶囊保留为可选模式 ──
  var LS_OPEN = 'dshbl:open'
  var handle = el('div', P + '-handle')
  var drawer = el('div', P + '-drawer')
  var pill = el('div', P + '-pill')
  handle.title = '阿里云百炼额度（dsh-bailian-balance）· 点开抽屉；上下拖动可调位置'
  pill.title = '阿里云百炼额度面板（dsh-bailian-balance）'

  // 汇总口径：券优先（先烧券再出现金，所以报券的剩余）；免费额度取最紧张的一档
  function couponSum(s) {
    var b = (s || {}).bss || {}
    if (!b.ok) return null
    var cp = (b.coupons || []).filter(function (c) { return c.status === 'Available' })
    if (!cp.length) { var v = Number((b.balance || {}).available); return isFinite(v) ? v : null }
    return cp.reduce(function (a, c) { var n = Number(c.balance); return a + (isFinite(n) ? n : 0) }, 0)
  }
  function freeWorst(s) {
    var ft = (s || {}).freeTier || {}
    if (!ft.ok || !(ft.items || []).length) return null
    var w = ft.items.filter(function (x) { return x.remainPct != null })
      .sort(function (a, b) { return a.remainPct - b.remainPct })[0]
    return w ? w.remainPct : null
  }
  function ui() {
    var w = ((state && state.config) || {}).widget || {}
    var off = offsetOverride != null ? offsetOverride : Number(w.offset)
    return {
      mode: w.mode === 'pill' ? 'pill' : 'sidebar',
      edge: w.edge === 'left' ? 'left' : 'right',
      offset: isFinite(off) ? Math.min(92, Math.max(4, off)) : 45,
      width: Math.min(760, Math.max(300, Number(w.width) || 424)),
    }
  }

  document.addEventListener('DOMContentLoaded', mount)
  if (document.body) mount()
  function mount() {
    // 注入脚本可能早于 DOMContentLoaded 跑，事件再触发时必须幂等，否则轮询会叠成两份
    if (handle.parentNode) return
    if (!document.getElementById(P + '-style')) {
      var st = el('style'); st.id = P + '-style'; styleEl = st; st.textContent = baseCss + accentBlock(accentNow)
      document.head.appendChild(st)
    }
    document.body.appendChild(handle)
    document.body.appendChild(drawer)
    document.body.appendChild(pill)
    bindDrag(handle)
    pill.onclick = function () { toggle() }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false) })
    try { open = localStorage.getItem(LS_OPEN) === '1' } catch (e) { open = false }
    pull(false)
    timer = setInterval(function () { pull(true) }, 30000)
  }
  function setOpen(v) {
    open = !!v
    try { localStorage.setItem(LS_OPEN, open ? '1' : '0') } catch (e) {}
    render()
    if (open) pull(true)
  }
  function toggle() { setOpen(!open) }
  // 把手既要能点（展开）又要能拖（改上下位置）：位移超 4px 才算拖动，并吞掉随之而来的 click。
  // 拖完先本地生效（offsetOverride），再异步写回配置，避免等一次网络往返才跟手。
  function bindDrag(node) {
    var startY = 0, startPct = 0, moved = false, dragging = false, pct = 0
    node.addEventListener('pointerdown', function (ev) {
      dragging = true; moved = false; startY = ev.clientY; pct = startPct = ui().offset
      try { node.setPointerCapture(ev.pointerId) } catch (e) {}
    })
    node.addEventListener('pointermove', function (ev) {
      if (!dragging) return
      var dy = ev.clientY - startY
      if (!moved && Math.abs(dy) < 4) return
      moved = true
      pct = Math.min(92, Math.max(4, startPct + (dy / Math.max(400, window.innerHeight)) * 100))
      node.style.top = pct + '%'
    })
    function end(ev) {
      if (!dragging) return
      dragging = false
      try { node.releasePointerCapture(ev.pointerId) } catch (e) {}
      if (!moved) return
      offsetOverride = pct
      var w = Object.assign({}, ((state && state.config) || {}).widget || {}, { offset: Math.round(pct) })
      postConfig({ widget: w }, true)
    }
    node.addEventListener('pointerup', end)
    node.addEventListener('pointercancel', end)
    node.addEventListener('click', function () { if (moved) { moved = false; return } toggle() })
  }
  function postConfig(patch, silent) {
    return fetch('/dsh-bailian/config.json', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).then(function (r) { return r.json() }).then(function (j) {
      if (j && j.ok && j.config) { state = state || {}; state.config = j.config; if (j.config.widget) offsetOverride = null }
      if (!silent && (!j || !j.ok)) say('保存失败：' + ((j && j.error) || ''), 'err')
      return j
    }).catch(function (e) { if (!silent) say('保存出错：' + e.message, 'err') })
  }

  function dotHtml(s) {
    var cls = '', cp = couponSum(s), fw = freeWorst(s)
    if (!s.at && !s.today) cls = 'warn'
    else if (s.fatal) cls = 'err'
    else if ((cp != null && cp < 10) || (fw != null && fw < 10)) cls = 'warn'
    return '<span class="' + P + '-hdot ' + cls + '"></span>'
  }
  function renderHandle() {
    var s = state || {}, u = ui()
    // 展开时把手退到低透明（抽屉已经盖住它），悬停再回到全亮
    handle.className = P + '-handle ' + u.edge + (open ? ' open' : '')
    handle.style.top = u.offset + '%'
    var cp = couponSum(s), fw = freeWorst(s)
    var h = dotHtml(s) + '<span class="' + P + '-hlabel">百炼额度</span>'
    if (cp != null) {
      h += '<span class="' + P + '-hamt"><b>' + (cp >= 100 ? cp.toFixed(0) : cp.toFixed(1)) + '</b><i>券</i></span>'
    }
    if (fw != null) h += '<span class="' + P + '-hsub">免' + fw + '%</span>'
    else if (s.freeTier && s.freeTier.code === 'NO_CONSOLE_LOGIN') h += '<span class="' + P + '-hsub">未登录</span>'
    handle.innerHTML = h
  }
  function renderPill() {
    var s = state || {}, bits = []
    var t = (s.today || {}), ft = s.freeTier || {}
    bits.push('今日 <b>' + kfmt(t.tokens) + '</b> tok')
    if (t.money) bits.push('<b>' + esc(t.money) + '</b>')
    if (ft.ok && (ft.items || []).length) {
      var fw = freeWorst(s)
      if (fw != null) bits.push('免费额度剩 <b>' + fw + '%</b>')
    } else if (ft.code === 'NO_CONSOLE_LOGIN') bits.push('免费额度<b>未登录</b>')
    var cp = couponSum(s)
    if (cp != null) bits.push('余额 <b>' + money(cp) + '</b>')
    pill.innerHTML = dotHtml(s) + bits.join(' · ') + (open ? ' <span class="' + P + '-muted">收起</span>' : '')
  }

  // ── 视觉助手 ──
  // pct 一律是「剩余百分比」。配色沿用新令牌语义：充足=酸黄、偏低=琥珀、告急=红。
  // （旧版这里引用过 --pw-lo/--pw-empty，重做配色时令牌表已删掉这两个，
  //   留着会让渐变端点解析失败、进度条变透明 —— 改配色务必回头核对 JS 里的引用。）
  function barColor(pct, acc) {
    var a = acc || ACCENT_DEFAULT
    return pct >= 60 ? 'linear-gradient(90deg,' + shade(a, -0.22) + ',' + a + ')'
      : pct >= 25 ? 'linear-gradient(90deg,rgba(245,185,75,.5),#F5B94B)'
      : 'linear-gradient(90deg,rgba(255,107,107,.5),#FF6B6B)'
  }
  function stopBadge(x) {
    if (x.autoStop === true) return '<span class="' + P + '-badge on">ON</span>'
    if (x.autoStop === false) return '<span class="' + P + '-badge">OFF</span>'
    if (x.autoStop === 'unsupported') return '<span class="' + P + '-badge na">不支持</span>'
    return '<span class="' + P + '-muted">—</span>'
  }

  // ── 头部 / 概览 / 标签条 ──
  function sectionTitle() {
    var s = state || {}
    // 动作按钮一律靠左排，配合 .hd 的 padding-right:96px，
    // 保证没有任何可点元素进入 Electron 窗口控件（右上角）的命中区。
    return '<div class="' + P + '-hd">'
      + '<h4><span class="' + P + '-mark"></span>阿里云百炼 · 额度与用量</h4>'
      + '<div class="' + P + '-meta">'
      + '<span class="' + P + '-chip v">v' + esc(s.version || '?') + '</span>'
      + '<span class="' + P + '-chip">数据 ' + esc(ago(s.at)) + '</span>'
      + '<span class="' + P + '-chip">每 30 秒自动取数</span></div>'
      + '<div class="' + P + '-acts">'
      + '<span class="' + P + '-btn" data-act="refresh" title="立即重新取数">↻ 刷新</span>'
      + '<span class="' + P + '-btn" data-act="tabcfg" title="打开设置">⚙ 设置</span>'
      + '<span class="' + P + '-btn" data-act="close" title="收起面板（也可按 Esc，或再点一次边缘把手）">›› 收起</span>'
      + '</div></div>'
  }
  function summary() {
    var st = state || {}, t = st.today || {}, b = st.bss || {}
    var cp = couponSum(st), fw = freeWorst(st)
    var note = '—'
    if (cp != null) {
      var cs = (b.coupons || []).filter(function (c) { return c.status === 'Available' })
      note = cs.length ? ('券 · ' + (cs[0].daysLeft == null ? '—' : cs[0].daysLeft + ' 天')) : '可用额度'
    } else if (!b.ok) note = '未启用'
    var h = '<div class="' + P + '-sum">'
    h += '<div class="' + P + '-sumrow"><span class="' + P + '-k">今日</span><b>' + kfmt(t.tokens || 0) + '</b>'
      + '<span class="' + P + '-u">tok</span><em>' + (t.money ? esc(t.money) : '—') + '</em>'
      + '<span class="' + P + '-u">' + (t.calls || 0) + ' 次调用</span></div>'
    h += '<div class="' + P + '-sumrow"><span class="' + P + '-k">余额</span><b class="acc">'
      + (cp == null ? '—' : money(cp)) + '</b><span class="' + P + '-u">' + note + '</span></div>'
    if (fw != null) {
      var w = Math.max(0, Math.min(100, fw))
      h += '<div class="' + P + '-gauge"><span class="' + P + '-k">免费</span>'
        + '<i class="' + P + '-track"><u style="width:' + w + '%;background:' + barColor(fw, accentNow) + '"></u></i>'
        + '<span class="' + P + '-pct">' + fw + '%</span></div>'
    }
    return h + '</div>'
  }
  // 上手段：A(auto) 只给一行轻提示；B(wizard) 给三步卡片。两种都**不挡数据**——
  // 它渲染在摘要之前，下面照常出数（规范的反目标：向导不能变成门槛）。
  function obSteps(st) {
    var b = st.bss || {}, ft = st.freeTier || {}
    var src = ft.source === 'pasted' ? '当前用粘贴的 access_token'
      : ft.source === 'file' ? '当前读本地 bailian 配置' : ''
    var ftBody = ft.code === 'CONSOLE_TOKEN_EXPIRED'
      ? '控制台 token 已失效，请在设置里重新粘贴 access_token。'
      : '可选：粘贴 access_token（免装 CLI），或跑 bl auth login --console。'
    if (ft.ok && src) ftBody = src + '。' + ftBody
    return [
      { ok: !!(st.tpm && st.tpm.ok), title: '百炼 API Key',
        body: (st.tpm && st.tpm.ok) ? '已检测到 profile 里的 ALIYUN_DASHSCOPE_API_KEY，实时用量与限流配额已就绪。'
          : '百炼控制台 → API-KEY 管理 创建，再到 DSH 设置 → 模型 填给这条路由。' },
      { ok: !!b.ok, opt: true, title: '账户余额 / 代金券（可选）',
        body: '在下方「设置」填一对 AK/SK 并勾选启用；建议单建 RAM 子账号，只授 AliyunBSSReadOnlyAccess。' },
      { ok: !!ft.ok, opt: true, title: '免费额度（可选）', body: ftBody },
    ]
  }
  function onboard() {
    var st = state || {}, w = ((st.config || {}).widget) || {}
    var steps = obSteps(st)
    var pend = steps.filter(function (x) { return !x.ok })
    if (!pend.length) return ''
    if (w.firstRun !== 'wizard') {
      return '<div class="' + P + '-ob"><span class="' + P + '-dot warn"></span>'
        + pend.length + ' 项未配置：' + esc(pend.map(function (x) { return x.title.replace(/（可选）/, '') }).join('、'))
        + '<span class="' + P + '-btn" data-act="obwizard">看引导</span></div>'
    }
    return '<div class="' + P + '-wiz"><div class="' + P + '-wizhd"><b>快速上手</b>'
      + '<span class="' + P + '-btn" data-act="obskip">跳过，直接看面板</span></div>'
      + steps.map(function (x) {
        return '<div class="' + P + '-step"><i class="' + P + '-tick' + (x.ok ? ' done' : '') + '"></i>'
          + '<div><b>' + esc(x.title) + '</b><span>' + esc(x.body) + '</span></div></div>'
      }).join('') + '</div>'
  }
  function tabs() {
    var items = [['live', '实时用量'], ['free', '免费额度'], ['tpm', '限流配额'], ['bss', '账户余额'], ['cfg', '设置']]
    return '<div class="' + P + '-tabs">' + items.map(function (x) {
      return '<span class="' + P + '-tab' + (tab === x[0] ? ' on' : '') + '" data-tab="' + x[0] + '">' + x[1] + '</span>'
    }).join('') + '</div>'
  }
  function liveBody() {
    var s = state || {}, t = s.today || {}, lt = s.lastTurn || {}
    var by = t.byModel || {}, models = Object.keys(by)
    var h = '<div class="' + P + '-sec">本机 DSH 会话实测（事件流 usage）</div><div class="' + P + '-kv">'
      + row('今日 token 合计', kfmt(t.tokens) + '（' + (t.calls || 0) + ' 次调用）')
      + row('输入 / 缓存读 / 输出', kfmt(t.input) + ' / ' + kfmt(t.cache) + ' / ' + kfmt(t.output))
      + row('今日折算', t.money ? t.money + '（按你在「设置」里填的单价）' : '<span class="' + P + '-muted">未配置单价，仅报 token</span>')
      + row('上一轮', lt.tokens ? kfmt(lt.input + lt.cache + lt.output) + ' tok · ' + esc(lt.model || '') + ' · ' + esc((lt.at || '').slice(11, 19)) : '—')
      + '</div>'
    if (models.length) {
      // 用表格而不是 kv 行：kv 的第二列塞不下「in/cache/out」三段，右对齐后会折成两行很难看
      h += '<div class="' + P + '-sec">今日按模型拆分</div><div class="' + P + '-grid ' + P + '-g5">'
        + '<b>模型</b><b class="' + P + '-num">合计</b><b class="' + P + '-num">输入</b>'
        + '<b class="' + P + '-num">缓存读</b><b class="' + P + '-num">输出</b>'
        + '<div class="' + P + '-rule"></div>'
      models.forEach(function (m) {
        h += '<span>' + esc(m) + '</span>'
          + '<span class="' + P + '-num">' + kfmt(by[m].tokens) + '</span>'
          + '<span class="' + P + '-num">' + kfmt(by[m].input) + '</span>'
          + '<span class="' + P + '-num">' + kfmt(by[m].cache) + '</span>'
          + '<span class="' + P + '-num">' + kfmt(by[m].output) + '</span>'
      })
      h += '</div>'
    }
    h += '<div class="' + P + '-note">口径说明：DSH 的 <code class="' + P + '-code">outputTokens</code> 已包含 reasoning tokens，面板不再重复累加；子代理（subagent / wide_research worker）的 usage 走同一条模型路由，同样计入本账号。</div>'
    return h
  }
  function freeBody() {
    var s = state || {}, ft = s.freeTier || {}
    if (!ft.ok) {
      var h = '<div class="' + P + '-sec">新人免费额度</div>'
      if (ft.code === 'NO_CONSOLE_LOGIN') {
        h += '<div class="' + P + '-note">查免费额度必须走<b>百炼控制台登录态</b>——DashScope 的 <code class="' + P + '-code">sk-</code> key 打这个网关会被拒（实测返回 <code class="' + P + '-code">BailianGateway.Login.NotLogined</code>）。一次登录即可长期生效：'
          + '<div style="margin-top:8px">① 终端里装一次官方 CLI：<code class="' + P + '-code">npm i -g bailian-cli</code></div>'
          + '<div>② 登录：<code class="' + P + '-code">bl auth login --console</code>（浏览器完成）</div>'
          + (ft.bl ? '<div style="margin-top:8px">已找到 CLI：<code class="' + P + '-code">' + esc(ft.bl) + '</code> <span class="' + P + '-btn pri" data-act="login">拉起登录并取链接</span></div>'
            : '<div class="' + P + '-muted" style="margin-top:6px">没找到 bl / bailian 可执行文件（本机 PATH 无 npm，可用 DSH 自带 pnpm 装到 ~/.dsh/tools/bailian-cli，面板会自动识别）。</div>')
          + (loginUrl ? '<div style="margin-top:8px"><a class="' + P + '-btn pri" href="' + esc(loginUrl) + '" target="_blank" rel="noopener">点这里在浏览器里完成登录</a><div class="' + P + '-muted" style="margin-top:4px;word-break:break-all">' + esc(loginUrl) + '</div></div>' : '')
          + '</div>'
      } else {
        h += '<div class="' + P + '-note err">' + esc(ft.code || 'FAIL') + '：' + esc(ft.error || '未知错误') + '</div>'
      }
      if (ft.items && ft.items.length) h += table(ft.items)
      return h
    }
    return '<div class="' + P + '-sec">新人免费额度（' + ft.items.length + ' 个模型 · 账号 ' + esc((ft.account || {}).region) + '/' + esc((ft.account || {}).site) + '）</div>'
      + table(ft.items)
      + (ft.items.length ? '' : '<div class="' + P + '-note">这里没有记录，通常是因为<b>监控的模型名不是你账号里实际在用的模型</b>。到「设置」把模型列表改成你自己的（逗号分隔），保存后立刻刷新。</div>')
      + '<div class="' + P + '-note ok">抵扣顺序（官方）：<b>免费额度 &gt; 资源包 &gt; 节省计划 &gt; 按量付费</b>；实时调用自动优先用免费额度，无需手动设置。</div>'
  }
  function table(items) {
    var h = '<div class="' + P + '-grid"><b>模型</b><b class="' + P + '-num">剩余</b><b class="' + P + '-num">总额</b><b class="' + P + '-num">用完即停</b>'
      + '<div class="' + P + '-rule"></div>'
    items.forEach(function (x) {
      var pct = x.remainPct == null ? null : x.remainPct
      h += '<span>' + esc(x.model) + (x.expired ? ' <span class="' + P + '-badge bad">已过期</span>' : '') + '</span>'
        + '<span class="' + P + '-num">' + (x.remain == null ? '—' : kfmt(x.remain)) + '</span>'
        + '<span class="' + P + '-num">' + (x.total == null ? '—' : kfmt(x.total)) + '</span>'
        + '<span class="' + P + '-num">' + stopBadge(x) + '</span>'
        + (pct == null ? '' : '<div class="' + P + '-bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:' + barColor(pct, accentNow) + '"></i></div>')
    })
    return h + '</div>'
  }
  function tpmBody() {
    var s = state || {}, t = s.tpm || {}
    if (!t.ok) return '<div class="' + P + '-sec">模型限流配额</div><div class="' + P + '-note err">' + esc(t.code) + '：' + esc(t.error || '') + '</div>'
    return '<div class="' + P + '-sec">模型限流配额（API Key 直连 <code class="' + P + '-code">/api/v1/quotas</code>，全账号 ' + t.total + ' 条）</div>'
      + '<div class="' + P + '-grid"><b>模型</b><b>用量上限</b><b>计量字段</b><b>窗口</b>'
      + '<div class="' + P + '-rule"></div>'
      + t.items.map(function (x) {
        return '<span>' + esc(x.model) + '</span><span>' + (x.usageLimit == null ? '—' : kfmt(x.usageLimit)) + '</span>'
          + '<span>' + esc(x.usageField || '—') + '</span><span>' + (x.usagePeriodSec == null ? '—' : x.usagePeriodSec + ' 秒') + (x.requestLimit ? ' · ' + x.requestLimit + ' req' : '') + '</span>'
      }).join('') + '</div>'
      + '<div class="' + P + '-muted" style="margin-top:6px">这是<b>速率</b>限制（TPM/RPM），不是余额；额度类信息看「免费额度」「账户余额」两个标签。</div>'
  }
  function bssBody() {
    var s = state || {}, b = s.bss || {}
    if (b.code === 'DISABLED') return '<div class="' + P + '-sec">账户余额 / 代金券</div><div class="' + P + '-note">未启用。这一路走<b>阿里云 BSS OpenAPI</b>，需要一对 AK/SK（建议单建一个只读 RAM 子账号，只授 <code class="' + P + '-code">AliyunBSSReadOnlyAccess</code>）。到「设置」标签填一次即可，密钥存进 DSH 官方凭据库、不落在插件配置里。</div>'
    if (b.code === 'NO_AK') return '<div class="' + P + '-sec">账户余额 / 代金券</div><div class="' + P + '-note">' + esc(b.error) + '</div>'
    if (!b.ok) return '<div class="' + P + '-sec">账户余额 / 代金券</div><div class="' + P + '-note err">' + esc((b.errors || []).join(' / ') || '取数失败') + '</div>'
    var bl = b.balance || {}
    var h = '<div class="' + P + '-sec">账户资金（BSS QueryAccountBalance）</div><div class="' + P + '-kv">'
      + row('可用额度', money(bl.available) + ' ' + esc(bl.currency || ''))
      + row('可用现金', money(bl.availableCash))
      + row('信控额度', money(bl.credit))
      + row('网商银行额度', money(bl.mybankCredit))
      + row('配额上限', money(bl.quotaLimit))
      + '</div>'
    if (b.coupons && b.coupons.length) {
      h += '<div class="' + P + '-sec">代金券 / 学生券（QueryCashCoupons，' + b.coupons.length + ' 张）</div>'
      b.coupons.forEach(function (c) {
        var bal = Number(c.balance), nom = Number(c.nominal)
        var pct = isFinite(bal) && isFinite(nom) && nom > 0 ? Math.max(0, Math.min(100, Math.round(bal / nom * 1000) / 10)) : null
        h += '<div class="' + P + '-ticket">'
          + '<div class="' + P + '-tkt-hd"><span style="min-width:0;overflow-wrap:anywhere">' + esc(c.name || c.no) + '</span>'
          + (c.daysLeft == null ? '' : '<span class="' + P + '-badge' + (c.daysLeft < 30 ? ' warn' : '') + '">剩 ' + c.daysLeft + ' 天</span>')
          + '</div>'
          + '<div class="' + P + '-tkt-big">' + money(c.balance)
          + '<s>面值 ' + money(c.nominal) + ' ' + esc(c.currency || '') + '</s></div>'
          + (pct == null ? '' : '<div class="' + P + '-bar"><i style="width:' + pct + '%;background:' + barColor(pct, accentNow) + '"></i></div>')
          + '<div class="' + P + '-tkt-ft">#' + esc(c.no) + ' · ' + esc(c.status)
          + (pct == null ? '' : ' · 已消耗 ' + (100 - pct).toFixed(1) + '%')
          + (c.end ? ' · ' + esc(String(c.end).slice(0, 10)) + ' 到期' : '')
          + (c.scope ? '<br>适用范围：' + esc(c.scope) : '') + '</div></div>'
      })
    } else {
      h += '<div class="' + P + '-muted" style="margin:10px 0">没有可用代金券。</div>'
    }
    h += '<div class="' + P + '-note ok">字段已按真账号实测报文校准（2026-10-20）：余额取 <code class="' + P + '-code">AvailableAmount / AvailableCashAmount</code>，券列表取 <code class="' + P + '-code">Data.CashCoupon[]</code>。</div>'
    return h
  }
  function cfgBody() {
    var s = state || {}, c = s.config || {}
    var prices = c.prices || {}
    var pm = Object.keys(prices).map(function (m) { return m + '|' + (prices[m].input || 0) + '|' + (prices[m].output || 0) + '|' + (prices[m].cache == null ? '' : prices[m].cache) }).join('\n')
    var w = c.widget || {}
    function opt(v, cur, label) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + label + '</option>' }
    var mode = w.mode === 'pill' ? 'pill' : 'sidebar'
    var edge = w.edge === 'left' ? 'left' : 'right'
    var show = '<div class="' + P + '-sec">显示方式</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<select class="' + P + '-in" id="' + P + '-mode" style="width:auto">' + opt('sidebar', mode, '侧边栏抽屉（推荐）') + opt('pill', mode, '左下胶囊（旧）') + '</select>'
      + '<select class="' + P + '-in" id="' + P + '-edge" style="width:auto">' + opt('right', edge, '停靠右边缘') + opt('left', edge, '停靠左边缘') + '</select>'
      + '<select class="' + P + '-in" id="' + P + '-firstrun" style="width:auto">'
        + opt('auto', (w.firstRun === 'wizard' ? 'wizard' : 'auto'), '上手：自动（检测到即用）')
        + opt('wizard', (w.firstRun === 'wizard' ? 'wizard' : 'auto'), '上手：分步引导') + '</select>'
      + '<label class="' + P + '-muted">抽屉宽度 <input class="' + P + '-in" id="' + P + '-width" type="number" min="300" max="760" step="8" value="' + (Number(w.width) || 424) + '" style="width:78px;display:inline-block"></label>'
      + '</div>'
      + '<div class="' + P + '-muted" style="margin-top:5px">侧边栏模式：点边缘把手展开 / 收起，<b>上下拖动把手可调位置</b>，Esc 关闭。默认停右边缘，不再压住左下角的设置入口。</div>'
    var accNow2 = accentNow
    var acc = '<div class="' + P + '-sec">强调色</div><div class="' + P + '-accrow">'
      + PRESETS.map(function (x) {
        return '<span class="' + P + '-sw' + (x[1].toLowerCase() === accNow2.toLowerCase() ? ' on' : '') +
          '" data-acc="' + x[1] + '" title="' + x[0] + ' ' + x[1] + '" style="background:' + x[1] + '"></span>'
      }).join('')
      + '<input type="color" class="' + P + '-swc" id="' + P + '-acc" value="' + accNow2 + '" title="自定义取色">'
      + '<span class="' + P + '-btn" data-act="accreset" title="恢复默认天蓝">默认</span>'
      + '</div><div class="' + P + '-muted" style="margin-top:5px">选一个颜色即刻生效；太暗或太亮会自动调到可读范围。'
      + '刷新页面即生效，不用重启。</div>'
    return show + acc
      + '<div class="' + P + '-sec">监控的模型（逗号分隔 · 请改成你账号里实际在用的模型名）</div>'
      + '<input class="' + P + '-in" id="' + P + '-models" value="' + esc((c.models || []).join(', ')) + '">'
      + '<div class="' + P + '-sec" style="margin-top:12px">单价（每行一个：模型|输入|输出|缓存 —— 元/百万 token，留空则只报 token）</div>'
      + '<textarea class="' + P + '-in" id="' + P + '-prices" rows="4" placeholder="qwen3.8-flash|1.2|12|0.24">' + esc(pm) + '</textarea>'
      + '<div class="' + P + '-sec" style="margin-top:12px">BSS 账户凭据（可选，用于账户余额/代金券；只读权限即可）</div>'
      + '<div style="display:flex;gap:8px"><input class="' + P + '-in" id="' + P + '-akid" placeholder="AccessKeyId">'
      + '<input class="' + P + '-in" id="' + P + '-aksec" type="password" placeholder="AccessKeySecret"></div>'
      + '<label style="display:inline-block;margin-top:8px"><input type="checkbox" id="' + P + '-bsson" ' + (c.bss && c.bss.enabled ? 'checked' : '') + '> 启用账户余额取数</label>'
      + '<div style="margin-top:12px"><span class="' + P + '-btn pri" data-act="save">保存设置</span> '
      + '<span class="' + P + '-btn" data-act="recheck">重新取数</span></div>'
      + '<div class="' + P + '-muted" style="margin-top:8px">配置文件 <code class="' + P + '-code">~/.dsh/bailian-balance/config.json</code>；AK/SK 写进 DSH 凭据库的 '
      + '<code class="' + P + '-code">' + esc((c.bss || {}).idRef || 'BSS_ACCESS_KEY_ID') + '</code>。</div>'
  }
  function row(k, v) { return '<span class="' + P + '-muted">' + esc(k) + '</span><span>' + v + '</span>' }
  // 面板内提示（不用 alert/confirm/prompt，避免与宿主界面抢焦点）
  function say(msg, kind) {
    toast = { msg: msg, kind: kind || '', at: Date.now() }
    render()
    setTimeout(function () { toast = null; render() }, 12000)
  }

  function bodyFor() {
    return tab === 'free' ? freeBody() : tab === 'tpm' ? tpmBody() : tab === 'bss' ? bssBody() : tab === 'cfg' ? cfgBody() : liveBody()
  }
  function headHtml() {
    var s = state || {}
    return (s.fatal ? '<div class="' + P + '-note err">取数失败：' + esc(s.fatal) + '（宿主路由 /dsh-bailian/state.json 不可达？插件刚装上需要刷新页面）</div>' : '')
      + (toast ? '<div class="' + P + '-note ' + esc(toast.kind) + '">' + esc(toast.msg) + '</div>' : '')
  }
  function wire(node) {
    node.querySelectorAll('[data-tab]').forEach(function (n) { n.onclick = function () { tab = n.getAttribute('data-tab'); render() } })
    node.querySelectorAll('[data-act]').forEach(function (n) { n.onclick = function () { act(n.getAttribute('data-act')) } })
    node.querySelectorAll('[data-acc]').forEach(function (n) {
      n.onclick = function () {
        applyAccent(n.getAttribute('data-acc'))
        // 立刻落盘：只改本页样式的话，刷新就回去了，和文档承诺的"点一下生效"不符
        var cw = Object.assign({}, ((state && state.config) || {}).widget || {}, { accent: accentNow })
        postConfig({ widget: cw }).then(function () { return pull(true) })
      }
    })
    var accIn = document.getElementById(P + '-acc')
    if (accIn) { accIn.value = accentNow; accIn.oninput = function () { applyAccent(accIn.value) } }
  }

  function render() {
    var u = ui(), sidebar = u.mode !== 'pill'
    // 只在「配置里的值真的变了」时才同步：否则点预设后紧接着的 render()
    // 会拿旧配置把新颜色冲回去（实测：预设闪一下就变回默认色）。
    var cfgAcc = accentOfState()
    if (cfgAcc !== accFromConfig) { accFromConfig = cfgAcc; applyAccent(cfgAcc) }
    handle.style.display = sidebar ? '' : 'none'
    pill.style.display = sidebar ? 'none' : ''
    if (sidebar) renderHandle(); else renderPill()
    if (!open) {
      drawer.classList.remove('open')
      drawer.innerHTML = ''
      var old = document.getElementById(P + '-panel')
      if (old) old.remove()
      return
    }
    if (sidebar) {
      // 轮询每 30 秒会重写内容区；若用户正在「设置」里打字，重写会清空输入，这一轮跳过渲染
      var ae = document.activeElement
      if (drawer.contains(ae) && tab === 'cfg') return
      // 只有换边时才重建 className；其余情况同步增删 open。
      // 不用 requestAnimationFrame 加类：headless/dump-dom 不产帧、后台标签页会被节流，
      // 那时 open 永远加不上 = 抽屉打不开（实测踩过）。类在两次渲染之间翻转，transition 照样生效。
      drawer.style.width = u.width + 'px'
      if (drawer.getAttribute('data-edge') !== u.edge) {
        drawer.setAttribute('data-edge', u.edge)
        drawer.className = P + '-drawer ' + u.edge
      }
      drawer.innerHTML = '<div class="' + P + '-hz"></div>'
        + sectionTitle() + onboard() + summary() + tabs() + headHtml()
        + '<div class="' + P + '-body">' + bodyFor() + '</div>'
      wire(drawer)
      if (open) drawer.classList.add('open'); else drawer.classList.remove('open')
      return
    }
    var panel = document.getElementById(P + '-panel')
    if (!panel) { panel = el('div', P + '-panel'); panel.id = P + '-panel'; document.body.appendChild(panel) }
    panel.innerHTML = sectionTitle() + onboard() + summary() + tabs() + headHtml()
      + '<div class="' + P + '-body">' + bodyFor() + '</div>'
    wire(panel)
  }

  function act(a) {
    if (busy && a !== 'close') return
    if (a === 'close') { return setOpen(false) }
    if (a === 'tabcfg') { tab = 'cfg'; return render() }
    if (a === 'refresh') return pull(true)
    if (a === 'recheck') { cache0(); return pull(true) }
    if (a === 'login') {
      busy = true
      return post('/dsh-bailian/login.json', {}).then(function (j) {
        busy = false
        if (j && j.url) { loginUrl = j.url; tab = 'free' }
        say(j && j.ok ? (j.note || '已拉起 bl auth login --console') : ('拉起失败：' + ((j && j.error) || '')), j && j.ok ? 'ok' : 'err')
        if (j && j.ok) setTimeout(function () { pull(true) }, 30000)
      }).catch(function (e) { busy = false; say('请求失败：' + e.message, 'err') })
    }
    if (a === 'accreset') { applyAccent(ACCENT_DEFAULT); render(); return }
    if (a === 'obskip' || a === 'obwizard') {
      var cw = Object.assign({}, ((state && state.config) || {}).widget || {},
        { firstRun: a === 'obskip' ? 'auto' : 'wizard' })
      return postConfig({ widget: cw }).then(function () { return pull(true) })
    }
    if (a === 'save') {
      var models = (document.getElementById(P + '-models').value || '').split(/[,\s]+/).filter(Boolean)
      var prices = {}
      ;(document.getElementById(P + '-prices').value || '').split('\n').forEach(function (ln) {
        var p = ln.split('|').map(function (x) { return x.trim() })
        if (p.length >= 3 && p[0]) prices[p[0]] = { input: Number(p[1]) || 0, output: Number(p[2]) || 0, cache: p[3] === '' ? undefined : Number(p[3]) }
      })
      var wid = document.getElementById(P + '-width')
      var patch = {
        models: models.length ? models : DEFAULTS_MODELS, prices: prices,
        bss: { enabled: !!document.getElementById(P + '-bsson').checked },
        widget: Object.assign({}, ((state && state.config) || {}).widget || {}, {
          mode: (document.getElementById(P + '-mode') || {}).value || 'sidebar',
          edge: (document.getElementById(P + '-edge') || {}).value || 'right',
          width: wid ? Math.min(760, Math.max(300, Number(wid.value) || 424)) : 424,
          accent: accentNow,
          firstRun: (document.getElementById(P + '-firstrun') || {}).value === 'wizard' ? 'wizard' : 'auto',
        }),
      }
      var akid = (document.getElementById(P + '-akid').value || '').trim()
      var aksec = (document.getElementById(P + '-aksec').value || '').trim()
      if (akid) patch.__akId = akid
      if (aksec) patch.__akSecret = aksec
      busy = true
      return postConfig(patch).then(function (j) {
        busy = false
        if (!j || !j.ok) return
        var f1 = document.getElementById(P + '-akid'), f2 = document.getElementById(P + '-aksec')
        if (f1) f1.value = ''; if (f2) f2.value = ''
        offsetOverride = null
        say('已保存。AK/SK 若填了则写进了 DSH 凭据库。', 'ok')
        return pull(true)
      })
    }
  }
  function cache0() { state = null }
})()
