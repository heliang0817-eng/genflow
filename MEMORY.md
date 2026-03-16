# GenFlow · MEMORY（热记忆）

> ⚠️ 严控 ≤ 80 行。过时内容移入 CHANGELOG.md，结构化数据迁入 SQLite。
> 上次蒸馏：2026-03-15

---

## 当前状态
运行中 🟢 · 公网 https://genflow2.netlify.app · v4 设计（Impeccable 改造，暖橙 OKLCH）

## 架构速览
| 组件 | 说明 |
|------|------|
| `index.html` | 单页纯前端（4500+ 行，含所有 JS 逻辑）|
| `netlify/functions/proxy.mjs` | Serverless 代理（v5-secure，无硬编码 Key）|
| `data/shared-history.json` | GitHub 共享历史存储 |

**代理路由：** `dashscope/*` → 阿里云 · `ark/*` → 火山引擎 · `oss-dynamic/<host>/*` → 动态OSS · `storage/history` → GitHub

## 关键配置
- **本地启动**：`python3 -m http.server 8766`（端口 8766），本地代理 `node proxy.mjs`（端口 8767）
- **Netlify 必须配置的 3 个环境变量**：`DASHSCOPE_KEY` / `ARK_KEY` / `GH_TOKEN`（⚠️ 重新建站必须重配）
- **Seedance 模型**：`seedance-1-5-pro-251215`，Ark 端点 `ark.ap-southeast.bytepluses.com`
- **历史存储**：`getStorageUrl()` 硬编码指向 Netlify，`displayUrl` 存原始 OSS URL（2026-03-15 修复）

## 设计系统（v4）
- 字体：`Fraunces`（Logo/标题，斜体）+ `DM Sans`（UI）
- Accent：`oklch(72% 0.18 55)`（暖橙），背景冷调 tinted neutral
- 间距：4pt 系统（`--sp-1` ~ `--sp-12`）

## 本周待办
- [ ] 负向 prompt（negative prompt）支持
- [ ] 批量 prompt 模板变量替换
- [ ] 历史记录导出/导入 JSON
- [ ] 视频生成历史单独管理

## 指针
- 变更历史、Bug根因、功能列表 → `CHANGELOG.md`
- 记忆管理方案 → `memory/project-memory-strategy.md`
