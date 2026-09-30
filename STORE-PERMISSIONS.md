# 商店上架 · 权限用途说明（Permission justification）

适用商店：**Microsoft Edge Add-ons**（Partner Center → Privacy / Permission justification）
与 **Chrome Web Store**（开发者控制台的「权限用途说明」）。两者都要求**逐项**说明每个权限的用途，
漏填或与功能不符会被拒稿。

> 原则：只说「完成本扩展唯一核心功能所必需」的理由，**不要**描述与权限无关的功能；
> `<all_urls>` 保持为 **optional（按需申请）**，绝不要改成强制 `host_permissions`。

---

## 1. activeTab justification

**English（推荐，审核员通用）**

```
Used only when the user clicks the extension icon: it grants temporary, user-initiated
access to the CURRENT tab so the extension can read that page's title, headings, visible
text and JSON-LD, and compute an "AI readability" score locally in the browser. The
extension never accesses tabs the user has not explicitly activated, and no page data is
uploaded.
```

**中文**

```
仅在用户点击扩展图标时使用：临时、由用户主动触发地访问「当前标签页」，以便读取该页面的标题、
各级标题、可见文本与 JSON-LD，并在浏览器本地计算「AI 可读性」评分。扩展不会访问用户未主动
激活的标签页，也不会上传任何页面数据。
```

---

## 2. scripting justification

**English**

```
After the user clicks the icon, a small self-contained function (extract.js) is injected
into the active tab to read that page's HTML/text and to probe same-origin files
(llms.txt, robots.txt, sitemap.xml). This is a one-shot local extraction used as input to
the local scoring engine. No remote or third-party code is ever injected or executed.
```

**中文**

```
用户点击图标后，向当前标签页注入一个自包含的小函数（extract.js），用于读取该页面的 HTML / 文本，
并同源探测 llms.txt / robots.txt / sitemap.xml。这是一次性的本地提取，仅作为本地评分引擎的输入，
不会注入或执行任何远程 / 第三方代码。
```

---

## 3. storage justification

**English**

```
Used to store the user's OWN DeepSeek API key in chrome.storage.local, so the optional
"AI deep diagnosis" feature does not ask for it every time. The key stays on the user's
device, is never synced and is never sent to our servers.
```

**中文**

```
用于把「用户自己的 DeepSeek API Key」保存在 chrome.storage.local 中，避免用户每次都要重新输入
（该 Key 只用于可选的「AI 深度诊断」功能）。Key 仅保存在用户设备本地，不参与云同步，也不会上传
到我们的服务器。
```

---

## 4. Host permission justification

> 这一栏对应 manifest 里的 `host_permissions`（`goofuture.com`、`api.deepseek.com`）；
> 若审核表单另有 `<all_urls>` 单独提问，请一并填入下面的第三段。

**English**

```
https://goofuture.com/* — Used only when the user explicitly clicks "Submit for public
listing". The locally computed result is posted to detect.php?action=save so a public
report can be generated. Nothing is sent unless the user clicks this button.

https://api.deepseek.com/* — Used only when the user clicks "AI deep diagnosis" and has
provided their own API key; the extension calls the DeepSeek chat completions API to
generate a diagnosis. No key is bundled with the extension.

Optional <all_urls> (requested at runtime only, NEVER granted by default) — Used only when
the user types a specific domain to check. The extension fetches that domain's homepage and
its llms.txt / robots.txt / sitemap.xml to compute the score locally. This keeps the default
install minimal: the broad host access is optional and off until the user opts in.
```

**中文**

```
https://goofuture.com/* —— 仅在用户主动点击「提交收录」时使用：把本地计算出的检测结果 POST 到
detect.php?action=save，由官网生成公开报告。用户不点该按钮就不会发送任何数据。

https://api.deepseek.com/* —— 仅在用户点击「AI 深度诊断」且已填写自己的 API Key 时使用：调用
DeepSeek chat completions 接口生成诊断。扩展不内置任何 Key。

可选 <all_urls>（仅在运行时按需申请，默认不授予）—— 仅在用户手动输入某个域名检测时使用：抓取
该域名首页及其 llms.txt / robots.txt / sitemap.xml，在本地完成评分。这样可让默认安装保持最小权限，
宽泛主机权限在用户明确同意前始终关闭。
```

---

## 5. Are you using remote code? —— 必须选 **No**（关键，选错会被拒）

Edge / Chrome 的 MV3 **禁止远程代码**。本扩展**没有**使用任何远程代码，请勾选：

> `○ No, I am not using remote code`  ← 选这个

依据（审核员实测也会得到同样结论）：

- 三个脚本（`engine.js` / `extract.js` / `popup.js`）都以本地 `<script src="...">` 随包分发，
  无任何外链 `<script>`、无 CDN。
- 全仓库无 `eval()`、无 `new Function()`、无动态创建 `<script>`、无 `import()` 远程模块。
- 对 `goofuture.com` / `api.deepseek.com` / 用户输入域名的 `fetch()` **只是读取 JSON / HTML 数据**
  （API 调用与网页抓取），不是加载或执行外部代码。

**Justification（选 No 后通常无需填写；若仍要求，可写）：**

```
All JavaScript (engine.js, extract.js, popup.js) is bundled in the package. The extension
contains no eval, no new Function, no remotely hosted scripts and no remote module imports.
The fetch() calls only read JSON/HTML data (a submit API and a user-provided LLM API), never
to load or execute code.
```

---

## 审核要点提醒

1. **四项都必填**，且要与扩展实际行为一致（审核员会实测）。
2. **`<all_urls>` 必须保持 optional**：Edge 对宽泛主机权限审核比 Chrome 更严，写成强制权限极易被拒。
3. **不要出现「不必要的权限」**：manifest 里当前只有 `activeTab / scripting / storage` + 两个 host，
   与上述说明一一对应，无需新增任何权限。
4. **隐私政策**（Edge 必填字段）需能对应本文：强调「评分 / 报告 / SKILL 均在本地完成，
   仅在用户主动点击『提交收录』或『AI 深度诊断』时才对外请求」。
5. **远程代码提问一律选 No**（见上方第 5 节），本扩展不含任何远程代码。
