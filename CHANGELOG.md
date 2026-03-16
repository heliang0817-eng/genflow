# GenFlow · CHANGELOG（温记忆）

> 只追加，永不删除。AI 追溯历史时按需读取。

---

## 2026-03-15（下午）

### 设计改造（Impeccable Skill 驱动）
- 完整替换设计系统，告别"AI 紫色暗色模板"
- 字体：Outfit + Space Mono → **Fraunces**（标题/Logo）+ **DM Sans**（UI 文字）
- 色彩：HEX → **OKLCH**，背景改为冷调 tinted neutral，主色改为**单一暖橙** `oklch(72% 0.18 55)`
- 卡片：移除渐变边框 glow + glassmorphism，改为干净单色边框
- 按钮：移除多层 glow shadow，Primary 改为纯色填充
- Logo：移除渐变文字，改为 Fraunces 斜体纯色
- Tab 激活态：移除渐变文字，改为 accent 色下划线

### Bug 修复（根因彻查）

#### 历史记录跨环境丢失（根本修复）
- **根因**：`displayUrl` 存储了带 `PROXY_BASE` 前缀的代理 URL（如 `localhost:8767/proxy/...`），公网打开后地址完全失效
- **修复**：`displayUrl` 统一存原始 OSS URL，显示时通过 `proxyImgUrl()` 实时转换，跨环境永远有效
- **影响位置**：`addHistoryRecord`、`persistItemChange`、生成完成回调（3处）、`genHistory` 单张历史

#### 历史存储地址不稳定
- **根因**：`getStorageUrl()` 依赖 `PROXY_BASE`，若 localStorage 存了 localhost 地址，历史会写到本地而非远端
- **修复**：`getStorageUrl()` 硬编码始终指向 `https://genflow2.netlify.app`，与代理设置完全解耦

#### 生视频 ARK_KEY 丢失
- **根因**：Netlify 环境变量不随代码部署，需手动在 Dashboard 配置
- **修复**：手动在 Netlify Dashboard 补充 `ARK_KEY`

---

## 2026-03-15（上午）

### 功能上线（截至本版本）
- JSON 批量任务输入（格式A/B/C/D 自动识别）
- 生图：阿里云 DashScope Wan2.6 T2I + Wan2.1 系列
- 生视频：Seedance 1.5 Pro（火山方舟国际版）
- 并发控制（1-3）、骨架屏 shimmer、429 自动重试
- Prompt 编辑 + 重新生成 + 单张生成历史
- 图片勾选 → 一键进入视频生成流程
- 右侧抽屉面板（560px，图片/视频双模式）
- 历史记录（GitHub 存储 + localStorage 双备份，TTL 7天）
- 视频历史面板（hover 预览缩略图）
- 全局尺寸覆盖（`--ar W:H` 参数自动解析）
- 每张图知识点展示 + 修改意见（带时间戳）
- 动态 OSS 代理（支持任意 `*.aliyuncs.com` 子域）
- 全部下载（图片 PNG + 视频 Blob 串行下载）

---

## 2026-03-14（安全加固）

### 安全审查通过
- git 历史无明文 Key（已用 `git filter-repo` 重写历史并强制推送）
- Netlify Function 无硬编码 Key（全部 `process.env`）
- 前端 index.html 无任何 Key
- `.env` 在 `.gitignore` 中
- CORS 白名单（仅允许 genflow2.netlify.app + localhost）

### Bug 修复
- 历史图片不显示：统一 proxyImgUrl，支持动态 OSS 子域
- 全部下载只下第一张：改用 Blob 串行下载，解决跨域问题
- 视频历史不可见：修复视频历史面板渲染逻辑

---

## 2026-03-11（项目初始化）

- 项目创建，基础生图/生视频功能
- Netlify 部署上线：https://genflow2.netlify.app
- GitHub 仓库：https://github.com/heliang0817-eng/genflow
