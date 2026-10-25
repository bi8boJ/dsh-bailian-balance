# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## v0.3.0

### 新增
- **强调色可调**：4 个预设 + 原生调色板自选，存 `config.widget.accent`，刷新页面即生效。
  自选色会按 HSL 亮度钳制到可读范围（过暗提亮、过亮压暗、过灰补饱和），
  主按钮文字颜色随亮度自动取黑/白 —— 选个近黑色也不会把余额数字变看不见。
- **两种上手模式**（`config.widget.firstRun`，设置里可瞬间切换）：
  `auto` 检测到 key 就直接出数据 + 一行轻提示；`wizard` 在面板顶部给三步卡片，
  **不遮挡数据**且随时可跳过。
- **免费额度免装 CLI**：设置里可直接粘贴百炼控制台的 `access_token`，
  存进 DSH 凭据库 `BAILIAN_CONSOLE_TOKEN`（**不写入插件配置文件**）。
  取凭据顺序为 `~/.bailian/config.json` → `credentials.json` → 凭据库粘贴值。
- 凭据过期时明确返回 `CONSOLE_TOKEN_EXPIRED` 并提示重新粘贴，不再静默空白。

### 改变
- 版式简化：四宫格卡片改为三行摘要（今日 token / 余额 / 免费额度进度条），
  去掉卡片边框与多余分隔线；移除无效的 `backdrop-filter`。
- 面板不再顶到 Electron 窗口控件：抽屉从 `top:48px` 起、头部右侧留 96px 安全区、
  关闭动作移到左侧动作组（此前右上角的关闭键与系统关闭键贴脸，会误点退出）。

### 修复
- `render()` 每次都用旧配置回冲强调色，导致点预设后颜色闪回默认值。
- 表格列间距用 `grid gap` 会让每格的 `border-bottom` 在列间断成两截。

## v0.2.x

- 侧边抽屉形态（右边缘把手、可拖动定位、Esc 关闭）；账户余额与代金券走 BSS OpenAPI
  （字段按真账号实测报文校准）；本地 token 计量账本。

## v0.1.x

- 首版：限流配额（DashScope `/api/v1/quotas`）、实时用量计量（监听 DSH 会话 usage 事件）、
  免费额度（百炼控制台网关）、BSS 签名与代金券展示。
