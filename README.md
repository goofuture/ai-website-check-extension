# AI 网站检测 · Chrome 浏览器插件（GooFuture · B-SiteAgent AI）

一键检测**任意企业官网**的「AI 可读性」——也就是这家网站被 **AI 搜索 / AI 问答 / AI 智能体**
读懂、引用、调用的能力。插件在你本地完成 10 维评分、薄弱项优化建议、报告与 SKILL 生成，
并可选择调用 DeepSeek 做 AI 深度诊断、或把结果提交到 [GooFuture 官网](https://goofuture.com/company-website-ai-agent/ai-check/) 公开收录。

> 本插件的评分逻辑是 GooFuture 线上 PHP 检测（`detect.php`）与开源 Python 版（`ai-website-check-skill`）
> 的**权威移植**，本地分数与官网收录分数口径一致。

## 它能做什么

1. **检测当前页面**：打开任意网站，点一下插件图标 → 「检测当前页面」，瞬间拿到 10 维评分。
2. **检测指定域名**：在输入框填入 `example.com` 即可（首次会请求「访问所有网站」权限，仅用于读取该站首页与 llms/robots/sitemap）。
3. **10 维评分**：企业信息 / 产品信息 / AI 可理解性 / 内容结构化 / FAQ / 联系方式 / 图片信息 / 文档利用 / AI 引用友好度 / Agent 友好度，综合 0–100 分与评级（优秀 / 良好 / 中等 / 偏弱 / 较弱）。
4. **优先优化建议**：自动挑出最弱的 3 项，给出可操作的改站方案。
5. **AI 深度诊断**（可选）：填入你自己的 DeepSeek API Key，本地调用 DeepSeek 生成一份「老板能看懂」的诊断报告。Key 仅保存在本地，不上传。
6. **下载报告 / SKILL**：一键导出自包含 HTML 报告与 `SKILL.md`（可直接导入 WorkBuddy 等 AI 工具执行改站）。
7. **提交收录**（可选）：把检测结果回传到 GooFuture 官网 `detect.php?action=save`，由官网生成公开报告并纳入检测列表。

## 10 个评分维度

| # | 维度 | # | 维度 |
|---|---|---|---|
| 1 | 企业信息完整度 | 6 | 联系方式 |
| 2 | 产品信息完整度 | 7 | 图片信息识别 |
| 3 | AI 可理解性 | 8 | PDF / 文档利用 |
| 4 | 内容结构化 | 9 | AI 引用友好度 |
| 5 | FAQ 完整度 | 10 | Agent 友好度 |

## 安装（开发者模式加载）

1. 打开 Chrome → `chrome://extensions` → 右上角开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本仓库目录（含 `manifest.json` 的目录）。
3. 固定插件到工具栏，打开任意企业官网，点击图标即可检测。

> 发布到 Chrome 应用商店前，请替换 `icons/` 下的图标（当前为程序生成的占位图标）。

## 权限说明

| 权限 | 用途 |
|---|---|
| `activeTab` / `scripting` | 检测「当前打开的页面」（注入提取脚本） |
| `storage` | 本地保存你的 DeepSeek Key |
| `host_permissions: goofuture.com` | 提交收录（扩展对 Host 权限豁免 CORS，无需改服务端） |
| `host_permissions: api.deepseek.com` | 调用 DeepSeek 做 AI 诊断 |
| `optional_host_permissions: <all_urls>` | 仅当你使用「检测指定域名」时按需申请，用于 fetch 该站首页与基建文件 |

> 评分、报告、SKILL **全部在浏览器本地完成**，不上传任何数据；只有你主动点击「提交收录」或「AI 深度诊断」时才会对外请求。

## 目录结构

```
ai-website-check-extension/
├── manifest.json      # MV3 清单
├── popup.html         # 弹窗界面
├── popup.css          # 样式
├── popup.js           # 交互逻辑（检测 / 诊断 / 提交 / 下载）
├── engine.js          # 评分引擎（10 维）+ 报告 / SKILL / Prompt 生成（纯 JS，可单测）
├── extract.js         # 注入到当前页面的提取函数（DOM + 同源探测 llms/robots/sitemap）
├── icons/             # 16 / 48 / 128 PNG
└── README.md
```

## 与官网 / 开源 Python 版的关系

- 三者评分逻辑完全一致，任一处升级都需要同步另外两处（这是已知约束）。
- 线上：`goofuture.com/company-website-ai-agent/ai-check/`
- 开源 Python 版（命令行 / WorkBuddy 技能）：`github.com/goofuture/ai-website-check-skill`
- 本插件：浏览器内一键检测，离线优先。

## 许可证

[MIT](./LICENSE) © 2026 广州果创网站科技有限公司（GooFuture）
