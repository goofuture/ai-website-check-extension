/*
 * popup.js — AI 网站检测扩展的交互逻辑。
 *
 * 两条检测路径，均复用 engine.js 的本地评分引擎：
 *   1) 检测当前页面：通过 chrome.scripting.executeScript 注入 extractPage（见 extract.js），
 *      在目标页同源上下文抽取 DOM 与探测 llms/robots/sitemap，无需宽泛主机权限。
 *   2) 检测指定域名：请求 <all_urls> 可选权限后直接 fetch 首页与基建文件，本地评分。
 *
 * 仅「提交收录」走 GooFuture 官网，仅「AI 深度诊断」走 DeepSeek（用户自带 Key）。
 * 评分 / 报告 / SKILL 全部在本地完成，私密、离线可用。
 */

(function () {
  "use strict";

  var GOOFUTURE_SAVE_URL = "https://goofuture.com/company-website-ai-agent/ai-check/detect.php";
  var DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

  // 当前页面状态
  var pageTabId = null;
  var pageDomain = "";
  var lastResult = null;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stripText(html) {
    if (!html) return "";
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function showStatus(msg, type) {
    var el = $("status");
    el.hidden = false;
    el.className = "status" + (type ? " " + type : "");
    el.textContent = msg;
  }
  function clearStatus() { $("status").hidden = true; }

  // 同源 / 跨域（已授权）探测资源可达性
  function probeUrl(url) {
    return new Promise(function (resolve) {
      var done = function (ok) { resolve(!!ok); };
      try {
        fetch(url, { method: "HEAD", cache: "no-store" })
          .then(function (r) {
            if (r.status >= 200 && r.status < 400) return done(true);
            return fetch(url, { method: "GET", cache: "no-store" })
              .then(function (r2) { done(r2.status >= 200 && r2.status < 400); })
              .catch(function () { done(false); });
          })
          .catch(function () { done(false); });
      } catch (e) { done(false); }
    });
  }

  // ---------------------- 计算与渲染 ----------------------

  function computeResult(ex, domain) {
    var meta = Engine.extract_meta(ex.html, ex.url || "");
    var r = Engine.analyze(ex.html, ex.text, ex.has_jsonld, ex.llms, ex.robots, ex.sitemap);
    var advice = Engine.build_advice(r.dims);
    var time_str = new Date().toLocaleString("zh-CN", { hour12: false });
    lastResult = {
      domain: domain,
      url: ex.url || "",
      score: r.total,
      dims: r.dims,
      advice: advice,
      meta: meta,
      extra: {
        llms: ex.llms, robots: ex.robots, sitemap: ex.sitemap,
        jsonld: ex.has_jsonld, text_len: (ex.text || "").length,
      },
      time_str: time_str,
      ai_answer: "",
    };
    renderResult(lastResult);
    clearStatus();
  }

  function renderResult(res) {
    $("result").hidden = false;
    var pct = Math.max(0, Math.min(100, res.score));
    $("ring").style.background = "conic-gradient(var(--brand) " + pct + "%, #e9ebf2 0)";
    $("scoreNum").textContent = res.score;
    $("rDomain").textContent = res.domain;
    $("rLevel").textContent = Engine.level_word(res.score);
    renderChips(res);
    renderDims(res.dims);
    renderAdvice(res.advice);
    // 重置诊断 / 提交区
    $("aiSec").hidden = true;
    $("aiBox").innerHTML = "";
    $("submitSec").hidden = true;
    $("submitInfo").innerHTML = "";
  }

  function renderChips(res) {
    var ex = res.extra, meta = res.meta;
    var chips = [];
    chips.push({ t: "评级：" + Engine.level_word(res.score), c: "level" });
    chips.push({ t: "llms.txt " + (ex.llms ? "有" : "无"), c: ex.llms ? "ok" : "no" });
    chips.push({ t: "robots.txt " + (ex.robots ? "有" : "无"), c: ex.robots ? "ok" : "no" });
    chips.push({ t: "sitemap.xml " + (ex.sitemap ? "有" : "无"), c: ex.sitemap ? "ok" : "no" });
    chips.push({ t: "JSON-LD " + (ex.jsonld ? "有" : "无"), c: ex.jsonld ? "ok" : "no" });
    if (meta.html_kb) chips.push({ t: "首页约 " + Math.round(meta.html_kb) + " KB", c: "" });
    if (meta.h1_count) chips.push({ t: "H1 × " + Math.round(meta.h1_count), c: "" });
    chips.push({ t: "检测时间 " + res.time_str, c: "" });
    $("rChips").innerHTML = chips.map(function (c) {
      return '<span class="chip ' + c.c + '">' + escapeHtml(c.t) + "</span>";
    }).join("");
  }

  function renderDims(dims) {
    var html = "";
    for (var i = 0; i < Engine.DIM_ORDER.length; i++) {
      var k = Engine.DIM_ORDER[i];
      if (!dims.hasOwnProperty(k)) continue;
      var v = Math.round(dims[k]);
      var c = v >= 70 ? "good" : (v >= 55 ? "mid" : "low");
      html += '<div class="dim">'
        + '<div class="dim-head"><span class="dim-name">' + escapeHtml(Engine.dim_label(k)) + '</span>'
        + '<span class="dim-score ' + c + '">' + v + '</span></div>'
        + '<div class="dim-track"><i class="' + c + '" style="width:' + v + '%"></i></div>'
        + '<div class="dim-tip">' + escapeHtml(Engine.dim_tip(k)) + '</div>'
        + '</div>';
    }
    $("rDims").innerHTML = html;
  }

  function renderAdvice(advice) {
    var wrap = $("rAdvice");
    if (!advice || !advice.length) {
      wrap.innerHTML = '<div class="muted">各维度表现良好，无显著薄弱项，保持更新即可。</div>';
      return;
    }
    wrap.innerHTML = advice.map(function (a) {
      return '<div class="advice-card"><div class="ac-head">' + escapeHtml(a.name)
        + ' <span class="sc">（' + Math.round(a.score) + ' 分）</span></div>'
        + '<div class="ac-tip">' + escapeHtml(a.tip) + '</div></div>';
    }).join("");
  }

  // 极简 Markdown 渲染（用于 AI 诊断结果）
  function renderSimpleMarkdown(src) {
    var lines = String(src || "").split("\n");
    var out = [];
    var list = [];
    function flushList() {
      if (list.length) { out.push("<ol>" + list.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ol>"); list = []; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flushList(); var lvl = h[1].length; out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">"); continue; }
      var ol = line.match(/^\d+\.\s+(.*)$/);
      if (ol) { list.push(ol[1]); continue; }
      flushList();
      out.push("<p>" + inline(line) + "</p>");
    }
    flushList();
    return out.join("");
  }
  function inline(s) {
    return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  // ---------------------- 检测入口 ----------------------

  async function analyzeCurrentPage() {
    if (!pageTabId) { showStatus("请先打开一个网站再检测当前页面。", "err"); return; }
    showStatus("正在分析当前页面…");
    try {
      var inj = await chrome.scripting.executeScript({ target: { tabId: pageTabId }, func: extractPage });
      var ex = inj && inj[0] && inj[0].result;
      if (!ex) throw new Error("页面提取返回为空");
      var domain = pageDomain;
      try { domain = new URL(ex.url).hostname; } catch (e) {}
      computeResult(ex, domain);
    } catch (e) {
      showStatus("分析失败：" + (e.message || e) + "（部分页面禁止注入脚本，可改用指定域名检测）", "err");
    }
  }

  async function ensureAllUrls() {
    try {
      var has = await chrome.permissions.contains({ origins: ["<all_urls>"] });
      if (has) return true;
      return await chrome.permissions.request({ origins: ["<all_urls>"] });
    } catch (e) { return false; }
  }

  async function analyzeDomain(raw) {
    var domain = (raw || "").trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      showStatus("请输入有效域名，例如 example.com", "err");
      return;
    }
    if (!(await ensureAllUrls())) {
      showStatus("未授予权限，无法检测指定域名。可先打开该网站再用「检测当前页面」。", "err");
      return;
    }
    showStatus("正在抓取 " + domain + " …");
    var html = "", finalUrl = "";
    try {
      var resp = await fetch("https://" + domain, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; GooFutureAIChecker/1.0)" } });
      finalUrl = resp.url; html = await resp.text();
    } catch (e1) {
      try {
        var resp2 = await fetch("http://" + domain, { redirect: "follow" });
        finalUrl = resp2.url; html = await resp2.text();
      } catch (e2) {
        showStatus("抓取失败：" + (e2 && e2.message ? e2.message : e2), "err");
        return;
      }
    }
    var origin;
    try { origin = new URL(finalUrl).origin; } catch (e) { origin = "https://" + domain; }
    var probes = await Promise.all([
      probeUrl(origin + "/llms.txt"),
      probeUrl(origin + "/robots.txt"),
      probeUrl(origin + "/sitemap.xml"),
    ]);
    var ex = {
      url: finalUrl, html: html, text: stripText(html),
      has_jsonld: /application\/ld\+json/i.test(html),
      llms: probes[0], robots: probes[1], sitemap: probes[2],
      title: "", lang: "",
    };
    computeResult(ex, domain);
  }

  // ---------------------- AI 诊断 / 提交 / 下载 ----------------------

  async function aiDiagnose() {
    if (!lastResult) return;
    var key = (await chrome.storage.local.get("deepseekKey")).deepseekKey;
    if (!key) { openSettings(); showStatus("请先在设置中填写 DeepSeek API Key。", "err"); return; }
    $("aiSec").hidden = false;
    $("aiBox").innerHTML = '<div class="ai-loading">AI 正在诊断，请稍候…</div>';
    var p = Engine.build_prompt(lastResult.domain, lastResult.url, lastResult.score, lastResult.dims, lastResult.meta, lastResult.extra);
    try {
      var resp = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }],
          temperature: 0.7, stream: false,
        }),
      });
      var j = await resp.json();
      var ans = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!ans) throw new Error((j && j.error && j.error.message) || "DeepSeek 返回为空");
      lastResult.ai_answer = ans;
      $("aiBox").innerHTML = renderSimpleMarkdown(ans);
    } catch (e) {
      $("aiBox").innerHTML = '<div class="ai-loading">诊断失败：' + escapeHtml(e.message || e) + "</div>";
    }
  }

  async function submitResult() {
    if (!lastResult) return;
    if (!confirm("确定要把「" + lastResult.domain + "」的检测结果公开收录到 GooFuture 官网吗？\n（将生成公开报告并返回报告 / SKILL 下载链接）")) return;
    $("submitSec").hidden = false;
    $("submitInfo").textContent = "正在提交…";
    var r = lastResult;
    var body = new URLSearchParams();
    body.set("action", "save");
    body.set("domain", r.domain);
    body.set("url", r.url);
    body.set("score", r.score);
    body.set("dims", JSON.stringify(r.dims));
    body.set("meta", JSON.stringify(r.meta));
    body.set("extra", JSON.stringify(r.extra));
    body.set("ai_answer", r.ai_answer || "");
    try {
      var resp = await fetch(GOOFUTURE_SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: body.toString(),
      });
      var j = await resp.json();
      if (j.ok) {
        var html = "✅ 已收录到 GooFuture 官网。";
        if (j.report_url) html += ' <a href="' + escapeHtml(j.report_url) + '" target="_blank" rel="noopener">查看报告</a>';
        if (j.skill_url) html += ' <a href="' + escapeHtml(j.skill_url) + '" target="_blank" rel="noopener">下载 SKILL</a>';
        $("submitInfo").innerHTML = html;
      } else {
        $("submitInfo").innerHTML = "❌ 收录失败：" + escapeHtml(j.msg || "未知错误");
      }
    } catch (e) {
      $("submitInfo").innerHTML = "❌ 提交异常：" + escapeHtml(e.message || e);
    }
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadReport() {
    if (!lastResult) return;
    download(lastResult.domain + "-report.html", Engine.render_html(lastResult), "text/html;charset=utf-8");
  }
  function downloadSkill() {
    if (!lastResult) return;
    download(lastResult.domain + "-skill.md", Engine.build_skill_md(lastResult.domain, lastResult), "text/markdown;charset=utf-8");
  }

  function copySummary() {
    if (!lastResult) return;
    var r = lastResult;
    var lines = [];
    lines.push("【" + r.domain + " · AI 网站检测】综合 " + r.score + "/100（" + Engine.level_word(r.score) + "）");
    lines.push("AI 引用基建：llms.txt " + (r.extra.llms ? "有" : "无") + " / robots.txt " + (r.extra.robots ? "有" : "无")
      + " / sitemap.xml " + (r.extra.sitemap ? "有" : "无") + " / JSON-LD " + (r.extra.jsonld ? "有" : "无"));
    lines.push("薄弱维度：" + r.advice.map(function (a) { return a.name + "（" + Math.round(a.score) + "）"; }).join("、"));
    lines.push("检测时间：" + r.time_str);
    navigator.clipboard.writeText(lines.join("\n")).then(function () {
      showStatus("已复制检测概要到剪贴板。", "ok");
    }).catch(function () { showStatus("复制失败，请手动选择。", "err"); });
  }

  // ---------------------- 设置 ----------------------

  function openSettings() { $("settings").hidden = false; $("dsKey").focus(); }
  function closeSettings() { $("settings").hidden = true; }
  function saveKey() {
    var v = $("dsKey").value.trim();
    chrome.storage.local.set({ deepseekKey: v });
    closeSettings();
    showStatus(v ? "已保存 DeepSeek Key（仅本地保存）。" : "已清除 DeepSeek Key。", "ok");
  }
  function loadKey() {
    chrome.storage.local.get("deepseekKey", function (o) {
      if (o && o.deepseekKey) $("dsKey").value = o.deepseekKey;
    });
  }

  // ---------------------- 初始化 ----------------------

  function init() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) return;
      var url = tab.url || tab.pendingUrl || "";
      try {
        var u = new URL(url);
        if (/^https?:$/.test(u.protocol)) {
          pageDomain = u.hostname;
          pageTabId = tab.id;
          $("pageTitle").textContent = tab.title || pageDomain;
          $("pageDomain").textContent = pageDomain;
          if (tab.favIconUrl) $("pageFav").src = tab.favIconUrl;
        } else {
          $("pageTitle").textContent = "当前页面不可检测";
          $("pageDomain").textContent = url || "—";
          $("btnDetectPage").disabled = true;
          $("pageHint").textContent = "浏览器内部页面无法检测，请改用上方「指定域名」检测。";
        }
      } catch (e) {
        $("pageDomain").textContent = url;
      }
    });

    $("btnDetectPage").addEventListener("click", analyzeCurrentPage);
    $("btnDetectDomain").addEventListener("click", function () { analyzeDomain($("domainInput").value); });
    $("domainInput").addEventListener("keydown", function (e) { if (e.key === "Enter") analyzeDomain($("domainInput").value); });
    $("btnAI").addEventListener("click", aiDiagnose);
    $("btnSubmit").addEventListener("click", submitResult);
    $("btnReport").addEventListener("click", downloadReport);
    $("btnSkill").addEventListener("click", downloadSkill);
    $("btnCopy").addEventListener("click", copySummary);
    $("btnSettings").addEventListener("click", openSettings);
    $("btnSaveKey").addEventListener("click", saveKey);
    $("btnCloseSettings").addEventListener("click", closeSettings);

    loadKey();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
