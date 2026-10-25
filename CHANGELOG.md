# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## v0.3.1

### 新增
- **百炼 API Key 凭据名自动发现**：从 profile 的 cordis 补丁里配对 `baseURL` 含 dashscope 的
  provider 的 `apiKeyEnv`，逐个尝试解析。之前只认写死的 `ALIYUN_DASHSCOPE_API_KEY`，
  而 DSH 设置界面新建路由时是按路由名派生 `<ROUTE>_API_KEY`，导致"刚配好 key 却显示不识别"。
  发现失败时错误信息会列出尝试过的所有凭据名，设置里也可手填。
- **点面板外即关闭**（`widget.closeOnOutside`，默认开）。用 `pointerdown` 且要求按下目标在面板与
  把手之外，所以在面板内选文字拖到外面不会被误关。
- 关闭按钮移到面板自己的右上角（✕）。抽屉从 `top:48px` 起，已低于 Electron 窗口控件带，
  几何实测确认不再重合；原先"头部留 96px 空带"的避让方式随之取消。

### 改变
- 向导第 2 步的 RAM 授权说明改为可操作四步（建用户 → 勾选 OpenAPI 调用访问 →
  立刻复制密钥并提示 Secret 只显示一次 → 新增授权搜 `AliyunBSSReadOnlyAccess` → 回面板粘贴启用）。
- 测试替身修正：假 dashscope 网关的响应形状对齐真实接口（`{output:{quotas,total}}`），
  之前返回裸数组会让解析抛异常并被归类成 `TPM_FAIL`。

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
