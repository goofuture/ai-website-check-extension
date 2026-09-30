/*
 * engine.js — 企业官网「AI 可读性」评分引擎（纯 JS 移植）。
 *
 * 本文件是 GooFuture 线上 PHP 检测逻辑（detect.php / aicheck_lib.php）以及
 * 开源 Python 版本（ai-website-check-skill/ai_check/engine.py）的权威移植，
 * 保证「浏览器插件本地检测」与「GooFuture 官网收录结果」口径一致。
 *
 * 所有函数均为纯逻辑，不触网，方便单元测试与在扩展 popup / 背景中复用。
 * 同时兼容浏览器全局（window.Engine）与 Node 模块（module.exports）。
 */
(function (root) {
  "use strict";

  // ---------------------- 维度名称 / 默认优化建议 ----------------------

  var DIM_LABEL = {
    company_info: "企业信息完整度",
    product_info: "产品信息完整度",
    ai_understand: "AI 可理解性",
    structure: "内容结构化",
    faq: "FAQ 完整度",
    contact: "联系方式",
    image: "图片信息识别",
    document: "PDF / 文档利用",
    citation: "AI 引用友好度",
    agent: "Agent 友好度",
  };

  var DIM_TIP = {
    company_info: "在首屏或「关于我们」用两三句话说清：你是谁、做什么、服务谁，并补上成立时间、地址与资质荣誉。",
    product_info: "把产品拆成独立页面，写清名称、用途、关键参数与适用场景，并配套真实案例。",
    ai_understand: "正文内容偏少，AI 难以抽取事实。建议每个核心页面至少 300–500 字的清晰描述，少用图片替代文字。",
    structure: "用规范的标题层级（H1/H2/H3）组织内容，把并列信息改成列表或表格，方便机器解析。",
    faq: "增加「常见问题」页面，把客户最常问的 10 个问题写成问答对——这与 AI 问答场景天然匹配。",
    contact: "明确列出电话、邮箱、地址与在线表单，并保持全站信息一致、可被引用。",
    image: "给产品图、企业图补上描述性 alt 文字，让 AI 知道图里是什么，而不是 img_01.jpg。",
    document: "把产品手册、白皮书、规格书以 PDF 等形式公开提供，便于 AI 检索与引用。",
    citation: "补充结构化数据（JSON-LD）、规范的 meta description，并放置 llms.txt 指引 AI 如何引用你。",
    agent: "提供 robots.txt、sitemap.xml 与开放接口 / API 文档，让智能体能稳定获取并调用你的信息。",
  };

  var DIM_ORDER = [
    "company_info", "product_info", "ai_understand", "structure", "faq",
    "contact", "image", "document", "citation", "agent",
  ];

  function dim_label(key) { return DIM_LABEL[key] || key; }
  function dim_tip(key) { return DIM_TIP[key] || "持续完善该维度的公开信息。"; }

  function level_word(v) {
    v = Number(v) || 0;
    if (v >= 85) return "优秀";
    if (v >= 70) return "良好";
    if (v >= 55) return "中等";
    if (v >= 40) return "偏弱";
    return "较弱";
  }

  function _has(html, pattern) {
    return new RegExp(pattern, "i").test(html || "");
  }

  function dim_company(html) {
    var s = 0;
    if (_has(html, "关于我们|公司简介|企业简介|about\\s*us|aboutus")) s += 30;
    if (_has(html, "成立于|创立于|创办于|成立时间|始创于")) s += 20;
    if (_has(html, "地址|总部|位于|广州|北京|上海|深圳|杭州")) s += 20;
    if (_has(html, "团队|员工|我们的故事|our\\s*team|人才招聘|加入我们")) s += 15;
    if (_has(html, "资质|荣誉|认证|iso|高新技术企业|专利")) s += 15;
    return Math.min(100, s);
  }

  function dim_product(html) {
    var s = 0;
    if (_has(html, "产品中心|产品介绍|产品列表|product|all\\s*products")) s += 25;
    if (_has(html, "解决方案|solution")) s += 20;
    if (_has(html, "服务|service")) s += 15;
    if (_has(html, "案例|客户案例|成功案例|customer|client")) s += 20;
    if (_has(html, "参数|规格|价格|报价|型号|配置")) s += 20;
    return Math.min(100, s);
  }

  function dim_understandable(text) {
    var length = text ? text.length : 0;
    if (length <= 0) return 0;
    return Math.min(100, Math.floor(length / 30)); // 约 3000 字满分
  }

  function dim_structure(html) {
    var h = (html.match(/<h[1-3][^>]*>/gi) || []).length;
    var lists = (html.match(/<(ul|ol)[^>]*>/gi) || []).length;
    var tables = (html.match(/<table[^>]*>/gi) || []).length;
    var ps = (html.match(/<p[^>]*>/gi) || []).length;
    return Math.min(100, h * 8 + lists * 5 + tables * 12 + ps * 2);
  }

  function dim_faq(html, text) {
    if (_has(html, "常见问题|faq|帮助中心|问答|客服中心")) return 90;
    var q = (text || "").split("？").length - 1 + (text || "").split("?").length - 1;
    return Math.min(70, q * 3);
  }

  function dim_contact(html) {
    var s = 0;
    if (_has(html, "联系我们|联系方式|contact\\s*us|contactus")) s += 30;
    if (/(\d{3,4}-?\d{7,8}|\b1[3-9]\d{9}\b)/.test(html)) s += 25;
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(html)) s += 25;
    if (_has(html, "地址|location|地图|map")) s += 20;
    return Math.min(100, s);
  }

  function dim_image(html) {
    var imgs = html.match(/<img[^>]*>/gi) || [];
    if (imgs.length === 0) return 40; // 首页无图，无法评判
    var with_alt = 0;
    for (var i = 0; i < imgs.length; i++) {
      var m = imgs[i].match(/alt=["']([^"']+)["']/i);
      if (m && m[1] && m[1].trim()) with_alt++;
    }
    return Math.round((with_alt / imgs.length) * 100);
  }

  function dim_document(html) {
    var c = (html.match(/\.(pdf|docx?|pptx?|xlsx?|txt)(?:[?#"']|$)/gi) || []).length;
    return Math.min(100, c * 25);
  }

  function dim_citation(html, has_jsonld, llms, sitemap) {
    var s = 0;
    if (_has(html, '<meta[^>]+name=["\']description["\']')) s += 20;
    if (/property=["\']og:/i.test(html)) s += 15;
    if (has_jsonld) s += 25;
    if (llms) s += 20;
    if (sitemap) s += 20;
    return Math.min(100, s);
  }

  function dim_agent(html, robots, sitemap, has_jsonld) {
    var s = 0;
    if (robots) s += 15;
    if (sitemap) s += 15;
    if (_has(html, "api|开放接口|开发者|developer|接口文档|开放平台")) s += 25;
    if (_has(html, "rss|feed|订阅|atom")) s += 15;
    if (has_jsonld) s += 15;
    if (_has(html, "mcp|model\\s*context\\s*protocol")) s += 15;
    return Math.min(100, s);
  }

  function analyze(html, text, has_jsonld, llms, robots, sitemap) {
    var dims = {
      company_info: dim_company(html),
      product_info: dim_product(html),
      ai_understand: dim_understandable(text),
      structure: dim_structure(html),
      faq: dim_faq(html, text),
      contact: dim_contact(html),
      image: dim_image(html),
      document: dim_document(html),
      citation: dim_citation(html, has_jsonld, llms, sitemap),
      agent: dim_agent(html, robots, sitemap, has_jsonld),
    };
    var keys = Object.keys(dims);
    var sum = 0;
    for (var i = 0; i < keys.length; i++) sum += dims[keys[i]];
    var total = Math.round(sum / keys.length);
    return { dims: dims, total: total };
  }

  function build_advice(dims) {
    var arr = [];
    for (var k in dims) {
      if (!dims.hasOwnProperty(k)) continue;
      arr.push({
        key: k,
        name: dim_label(k),
        score: Math.min(100, Math.max(0, Math.round(dims[k]))),
        tip: dim_tip(k),
      });
    }
    arr.sort(function (a, b) { return a.score - b.score; });
    var low = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].score < 70) low.push(arr[i]);
      if (low.length >= 3) break;
    }
    return low;
  }

  function unescape_html(s) {
    if (!s) return "";
    return String(s)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
  }

  function extract_meta(html, final_url) {
    html = html || "";
    var title = "";
    var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m) title = unescape_html((m[1] || "").replace(/<[^>]+>/g, "")).trim();

    var desc = "";
    m = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
    if (!m) m = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
    if (m) desc = unescape_html(m[1] || "").trim();

    var h1 = (html.match(/<h1[^>]*>/gi) || []).length;
    var lang = "";
    m = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
    if (m) lang = (m[1] || "").trim();

    return {
      title: title.slice(0, 120),
      description: desc.slice(0, 200),
      h1_count: h1,
      viewport: _has(html, 'name=["\']viewport["\']'),
      html_kb: Math.round(html.length / 1024),
      lang: lang,
      url: final_url || "",
    };
  }

  function build_checklist(weak_keys) {
    var mapping = {
      company_info: "在「关于我们」补充：公司简介、成立时间、地址、资质荣誉（让 AI 一句话说清你是谁）。",
      product_info: "把产品 / 服务拆成独立页面，写清名称、用途、关键参数与适用场景，并补充真实案例。",
      ai_understand: "为核心页面补充 300–500 字清晰正文，避免只用图片传达关键信息。",
      structure: "规范标题层级（H1/H2/H3），把并列信息改为列表或表格，方便机器解析。",
      faq: "新增「常见问题 FAQ」页面，整理 10 个客户高频问题写成问答对。",
      contact: "明确列出电话、邮箱、地址与在线表单，并保持全站信息一致、可被引用。",
      image: "为产品图、企业图、Logo 补充描述性 alt 文字。",
      document: "将产品手册、白皮书、规格书以 PDF 形式公开提供。",
      citation: "补充 JSON-LD 结构化数据、规范的 meta description，并放置 llms.txt。",
      agent: "提交 sitemap.xml、配置 robots.txt，并考虑开放 API / MCP 以便智能体接入。",
    };
    var out = [];
    for (var i = 0; i < weak_keys.length; i++) {
      if (mapping[weak_keys[i]]) out.push(mapping[weak_keys[i]]);
    }
    if (out.length < 3) {
      out.push("补充首页与核心页面的 meta description（≤120 字，含核心关键词）。");
      out.push("部署 llms.txt，明确告诉 AI 哪些页面值得被引用。");
      out.push("保持内容更新频率，定期发布新品、案例与 FAQ，让 AI 始终读到最新信息。");
    }
    return out;
  }

  function build_skill_md(domain, result) {
    domain = String(domain || "");
    var score = parseInt(result.score, 10) || 0;
    var time_str = result.time_str || "";
    var ai = (result.ai_answer || "").trim();
    var dims = result.dims || {};
    var advice = result.advice || [];
    var mt = result.meta || {};
    var ex = result.extra || {};
    var lv = level_word(score);
    var site_title = (mt.title || "").trim();

    var weak = [];
    for (var k in dims) {
      if (!dims.hasOwnProperty(k)) continue;
      var v = parseInt(dims[k], 10);
      if (v < 70) weak.push({ key: k, score: v, name: dim_label(k) });
    }
    weak.sort(function (a, b) { return a.score - b.score; });
    var weak_keys = weak.map(function (w) { return w.key; });

    var desc = domain + " 官网 AI 可读性优化技能（检测得分 " + score + "/100）。针对该站薄弱维度提供个性化修改方案，可导入 WorkBuddy 或支持 SKILL 的 AI 工具执行。";

    var fm = [
      "name: 网站AI优化-" + domain,
      'description: "' + desc.replace(/"/g, "'") + '"',
      'version: "1.0"',
      "type: website-optimization",
      "target_site: " + domain,
    ];
    if (site_title) fm.push('site_title: "' + site_title.replace(/"/g, "'") + '"');
    fm.push("detection_score: " + score);
    fm.push("weak_dims: [" + weak_keys.join(", ") + "]");

    var md = "---\n" + fm.join("\n") + "\n---\n\n";
    md += "# 网站 AI 优化技能 · " + domain + "\n\n";
    md += "> 本技能由 GooFuture 网站 AI 检测（B-SiteAgent AI）依据对 " + domain + " 的真实检测结果生成，"
      + "用于指导该网站提升 AI 可读性（被 AI 搜索、问答与智能体引用的能力）。\n";
    md += "> 检测时间：" + time_str + "　综合 AI 健康度：" + score + "/100（评级：" + lv + "）。\n\n";

    md += "## 1. 检测概要\n";
    md += "- 被测网站：" + domain + "\n";
    if (site_title) md += "- 网站标题：" + site_title + "\n";
    md += "- 综合得分：" + score + "/100（" + lv + "）\n";
    md += "- 检测时间：" + time_str + "\n";
    if (ex && (ex.llms !== undefined || ex.robots !== undefined)) {
      md += "- AI 引用基建：llms.txt " + (ex.llms ? "有" : "无") + "；robots.txt " + (ex.robots ? "有" : "无")
        + "；sitemap.xml " + (ex.sitemap ? "有" : "无") + "；JSON-LD " + (ex.jsonld ? "有" : "无") + "\n";
    }
    if (weak.length) {
      md += "- 主要薄弱维度（得分 < 70）：\n";
      for (var wi = 0; wi < weak.length; wi++) md += "  - " + weak[wi].name + "：" + weak[wi].score + " 分\n";
    } else {
      md += "- 各维度表现良好，无显著薄弱项。\n";
    }
    md += "\n";

    if (ai) {
      md += "## 2. AI 诊断（DeepSeek 生成）\n\n" + ai + "\n\n";
    }

    md += "## 3. 优先优化清单（按优先级）\n";
    if (advice.length) {
      for (var ai_i = 0; ai_i < advice.length; ai_i++) {
        var a = advice[ai_i];
        md += (ai_i + 1) + ". **" + (a.name || "") + "（" + Math.round(a.score) + " 分）**\n";
        md += "   - 问题：该维度得分偏低，影响 AI 对网站「" + (a.name || "") + "」的理解与引用。\n";
        md += "   - 修改方案：" + (a.tip || "") + "\n";
      }
    } else {
      md += "1. 维持各维度内容的持续更新，定期发布新品、案例与 FAQ，确保 AI 始终读取到最新信息。\n";
    }
    md += "\n";

    var checks = build_checklist(weak_keys);
    md += "## 4. 执行检查表\n";
    for (var ci = 0; ci < checks.length; ci++) md += "- [ ] " + checks[ci] + "\n";
    md += "\n";

    md += "## 5. 接入与使用\n";
    md += "- 本文件可作为 WorkBuddy 等 AI 助手的 SKILL 导入，按上述清单逐步改站。\n";
    md += "- 改完后可再次运行 GooFuture 网站 AI 检测，对比得分变化。\n";
    md += "- 配合企业 AI 知识库、AI 客服、AI 导购使用，可进一步把优化结果转化为获客与转化能力。\n";
    return md;
  }

  function build_prompt(domain, url, score, dims, meta, extra) {
    var lines = "";
    for (var i = 0; i < DIM_ORDER.length; i++) {
      var k = DIM_ORDER[i];
      if (dims && dims.hasOwnProperty(k)) {
        lines += "- " + dim_label(k) + "：" + Math.min(100, Math.max(0, Math.round(dims[k]))) + " 分\n";
      }
    }
    var tech = [
      "页面标题：" + (meta && meta.title ? "「" + meta.title + "」" : "（缺失）"),
      "页面描述：" + (meta && meta.description ? "「" + meta.description + "」" : "（缺失）"),
      "llms.txt：" + (extra && extra.llms ? "有" : "无"),
      "robots.txt：" + (extra && extra.robots ? "有" : "无"),
      "sitemap.xml：" + (extra && extra.sitemap ? "有" : "无"),
      "结构化数据 JSON-LD：" + (extra && extra.jsonld ? "有" : "无"),
      "首页正文约 " + Math.round((extra && extra.text_len) || 0) + " 字",
    ];
    var user = "请对下面这个企业官网做一次「AI 可读性」诊断。\n\n"
      + "【被测网站】" + domain + "（" + url + "）\n"
      + "【程序化检测结论】综合 AI 健康度：" + score + "/100\n"
      + "分项得分：\n" + lines + "\n"
      + "【页面技术信息】\n- " + tech.join("\n- ") + "\n\n"
      + "请输出一份给企业老板看的诊断报告，严格使用下列 Markdown 结构（不要输出其它一级标题，不要用表格）：\n\n"
      + "### 一、AI 眼中的你\n"
      + "（作为大模型，你了解这家网站或公司吗？了解就说出你的认知；不了解就如实说明“不了解”，绝不编造营收、客户名、融资金额等具体事实。）\n\n"
      + "### 二、这个分数说明什么\n"
      + "（2–3 句，结合总分与最弱的两个维度，说明对 AI 搜索、问答与智能体引用的实际影响。）\n\n"
      + "### 三、优先改这 3 件事\n"
      + "1. **动作名称**：具体怎么改，越可操作越好\n"
      + "2. **动作名称**：具体怎么改\n"
      + "3. **动作名称**：具体怎么改\n\n"
      + "### 四、做完之后的预期\n"
      + "（1–2 句，讲清对获客与转化的价值。）\n\n"
      + "要求：中文；专业但通俗，让老板一眼看懂；总字数 400–600 字；不要输出与上面结构无关的客套话。";

    var system = "你是果创科技（GooFuture）的资深企业网站 AI 化顾问，擅长把技术检测结果翻译成老板能听懂的生意判断。"
      + "你客观、严谨，只陈述有依据的内容，对不确定的信息明确说明不知道，绝不编造。";
    return { system: system, user: user };
  }

  // ---------------------- 自包含 HTML 报告渲染（对齐官网报告页） ----------------------

  var BRAND = "#4f5dff";

  function _chip(text, kind) {
    var cls = "chip";
    if (kind === "ok") cls += " ok";
    else if (kind === "no") cls += " no";
    else if (kind === "level") cls += " level";
    return '<span class="' + cls + '">' + esc(text) + "</span>";
  }

  function _dim_class(score) {
    if (score >= 70) return "good";
    if (score >= 55) return "mid";
    return "low";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _render_md_inline(s) {
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }

  function render_html(r) {
    r = r || {};
    var domain = r.domain || "";
    var title = (r.meta && r.meta.title || "").trim();
    var score = parseInt(r.score, 10) || 0;
    var lv = level_word(score);
    var dims = r.dims || {};
    var advice = r.advice || [];
    var meta = r.meta || {};
    var extra = r.extra || {};
    var ai = (r.ai_answer || "").trim();
    var time_str = r.time_str || "";
    var pct = Math.max(0, Math.min(100, score));

    var chips = [_chip("评级：" + lv, "level")];
    chips.push(_chip("llms.txt " + (extra.llms ? "有" : "无"), extra.llms ? "ok" : "no"));
    chips.push(_chip("robots.txt " + (extra.robots ? "有" : "无"), extra.robots ? "ok" : "no"));
    chips.push(_chip("sitemap.xml " + (extra.sitemap ? "有" : "无"), extra.sitemap ? "ok" : "no"));
    chips.push(_chip("JSON-LD " + (extra.jsonld ? "有" : "无"), extra.jsonld ? "ok" : "no"));
    if (meta.html_kb) chips.push(_chip("首页约 " + Math.round(meta.html_kb) + " KB"));
    if (meta.h1_count) chips.push(_chip("H1 × " + Math.round(meta.h1_count)));
    chips.push(_chip("检测时间 " + time_str));

    var dim_rows = "";
    for (var i = 0; i < DIM_ORDER.length; i++) {
      var k = DIM_ORDER[i];
      if (!dims.hasOwnProperty(k)) continue;
      var v = parseInt(dims[k], 10);
      var c = _dim_class(v);
      dim_rows += '<div class="dim"><div class="dim-head"><span class="dim-name">' + esc(dim_label(k))
        + '</span><span class="dim-score ' + c + '">' + v + '</span></div>'
        + '<div class="dim-track"><i class="' + c + '" style="width:' + v + '%"></i></div></div>';
    }

    var advice_html = "";
    if (advice.length) {
      var items = "";
      for (var ai_i = 0; ai_i < advice.length; ai_i++) {
        var a = advice[ai_i];
        items += "<li><strong>" + esc(a.name) + "（" + Math.round(a.score) + " 分）</strong>：" + esc(a.tip) + "</li>";
      }
      advice_html = '<div class="advice"><h3>优先优化建议</h3><ul>' + items + "</ul></div>";
    }

    var ai_html = "";
    if (ai) ai_html = '<div class="ai"><h3>AI 深度解读</h3><div class="ai-box">' + _render_md_inline(ai).replace(/\n/g, "<br>") + "</div></div>";

    var css = ":root{--brand:" + BRAND + ";--ink:#1f2430;--soft:#6b7280;--line:#e6e8ef;--softbg:#f6f7fb}"
      + "{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:var(--ink);background:#fff;line-height:1.6}"
      + ".wrap{max-width:840px;margin:0 auto;padding:28px 20px 60px}"
      + ".head{display:flex;gap:22px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:22px}"
      + ".ring{flex:0 0 132px;width:132px;height:132px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;background:conic-gradient(var(--brand) " + pct + "%, #e9ebf2 0);position:relative}"
      + ".ring::after{content:'';position:absolute;inset:12px;border-radius:50%;background:#fff}"
      + ".ring b{position:relative;font-size:38px;line-height:1;z-index:1}.ring small{position:relative;z-index:1;color:var(--soft);font-size:12px}"
      + ".info h1{margin:0 0 4px;font-size:22px}.info .sub{color:var(--soft);font-size:13px;margin:0 0 10px}"
      + ".chips{display:flex;flex-wrap:wrap;gap:8px}"
      + ".chip{font-size:12.5px;color:var(--soft);background:var(--softbg);border:1px solid var(--line);border-radius:999px;padding:4px 12px}"
      + ".chip.ok{color:#0a8f5b;background:#e7f7ef;border-color:#bce9d6}.chip.no{color:#d23b3b;background:#fdeaea;border-color:#f3c9c9}.chip.level{color:#7a4bff;background:#f0ecff;border-color:#d9ccff}"
      + ".sec{margin-top:30px}.sec h2{font-size:17px;margin:0 0 14px}"
      + ".dim{padding:10px 0;border-bottom:1px solid var(--line)}.dim-head{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px}.dim-score{font-weight:700}"
      + ".dim-score.good{color:#0a8f5b}.dim-score.mid{color:#b07d00}.dim-score.low{color:#d23b3b}"
      + ".dim-track{height:8px;background:#eef0f5;border-radius:999px;overflow:hidden}.dim-track i{display:block;height:100%;border-radius:999px}"
      + ".dim-track i.good{background:#0a8f5b}.dim-track i.mid{background:#e0a800}.dim-track i.low{background:#d23b3b}"
      + ".advice ul{margin:0;padding-left:18px}.advice li{margin:6px 0}"
      + ".ai-box{background:var(--softbg);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:14px}"
      + ".note{margin-top:26px;font-size:12px;color:var(--soft);border-top:1px dashed var(--line);padding-top:14px}a{color:var(--brand)}";

    return "<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'>"
      + "<meta name='viewport' content='width=device-width, initial-scale=1'>"
      + "<title>" + esc(domain) + " 官网 AI 检测报告（" + score + " 分）</title><style>" + css + "</style></head><body>"
      + "<div class='wrap'><div class='head'><div class='ring'><b>" + score + "</b><small>/100</small></div>"
      + "<div class='info'><h1>" + esc(domain) + "</h1>"
      + "<p class='sub'>官网 AI 健康度 · 综合 10 个维度 · 评级：" + esc(lv) + "</p>"
      + "<div class='chips'>" + chips.join("") + "</div></div></div>"
      + "<div class='sec'><h2>分项检测结果</h2>" + dim_rows + "</div>"
      + advice_html + ai_html
      + "<p class='note'>本报告由 GooFuture 开源 AI 网站检测工具生成（B-SiteAgent AI）。检测结果由程序化分析与 AI 参考综合生成，仅供参考。</p>"
      + "</div></body></html>";
  }

  function render_markdown(r) {
    r = r || {};
    var domain = r.domain || "";
    var title = (r.meta && r.meta.title || "").trim();
    var score = parseInt(r.score, 10) || 0;
    var lv = level_word(score);
    var dims = r.dims || {};
    var advice = r.advice || [];
    var meta = r.meta || {};
    var extra = r.extra || {};
    var ai = (r.ai_answer || "").trim();
    var time_str = r.time_str || "";

    var L = [];
    L.push("# " + domain + " · 官网 AI 检测报告");
    if (title) { L.push(""); L.push("> 网站标题：" + title); }
    L.push("");
    L.push("- 综合得分：**" + score + " / 100（" + lv + "）**");
    L.push("- 检测时间：" + time_str);
    L.push("- AI 引用基建：llms.txt " + (extra.llms ? "有" : "无") + "；robots.txt " + (extra.robots ? "有" : "无")
      + "；sitemap.xml " + (extra.sitemap ? "有" : "无") + "；JSON-LD " + (extra.jsonld ? "有" : "无"));
    if (meta.html_kb) L.push("- 首页体积：约 " + Math.round(meta.html_kb) + " KB");
    if (meta.h1_count) L.push("- H1 标题：" + Math.round(meta.h1_count) + " 个");
    L.push("");
    L.push("## 分项检测结果");
    L.push("");
    for (var i = 0; i < DIM_ORDER.length; i++) {
      var k = DIM_ORDER[i];
      if (dims.hasOwnProperty(k)) L.push("- " + dim_label(k) + "：**" + Math.round(dims[k]) + "**");
    }
    L.push("");
    if (advice.length) {
      L.push("## 优先优化建议");
      L.push("");
      for (var ai_i = 0; ai_i < advice.length; ai_i++) {
        var a = advice[ai_i];
        L.push((ai_i + 1) + ". **" + (a.name || "") + "（" + Math.round(a.score) + " 分）**：" + (a.tip || ""));
      }
      L.push("");
    }
    if (ai) { L.push("## AI 深度解读"); L.push(""); L.push(ai); L.push(""); }
    L.push("---");
    L.push("本报告由 GooFuture 开源 AI 网站检测工具生成（B-SiteAgent AI），仅供参考。");
    return L.join("\n");
  }

  var Engine = {
    DIM_LABEL: DIM_LABEL,
    DIM_TIP: DIM_TIP,
    DIM_ORDER: DIM_ORDER,
    dim_label: dim_label,
    dim_tip: dim_tip,
    level_word: level_word,
    analyze: analyze,
    build_advice: build_advice,
    extract_meta: extract_meta,
    build_checklist: build_checklist,
    build_skill_md: build_skill_md,
    build_prompt: build_prompt,
    render_html: render_html,
    render_markdown: render_markdown,
    unescape_html: unescape_html,
    BRAND: BRAND,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  if (root) root.Engine = Engine;
})(typeof window !== "undefined" ? window : null);
