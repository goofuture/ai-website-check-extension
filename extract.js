/*
 * extract.js — 注入到「当前打开页面」的提取函数。
 *
 * 通过 chrome.scripting.executeScript 注入运行，在目标页面的同源上下文中：
 *   1) 抽取评分所需的 DOM 信息（html / text / jsonld / title / description / h1）；
 *   2) 同源探测 llms.txt / robots.txt / sitemap.xml 是否可达。
 * 同源 fetch 不受 CORS 限制，因此无需为「当前页面」申请宽泛的主机权限。
 *
 * 返回结构与 popup.js 中 fetch 模式（analyzeDomain）返回的对象保持一致。
 */

// 注意：该函数会被序列化注入到页面执行，不能使用外部闭包 / 模块变量。
function extractPage() {
  function probe(url) {
    // 同源 HEAD，失败再退化 GET，仅判断可达（2xx/3xx 视为有）
    return new Promise(function (resolve) {
      var done = function (ok) { resolve(!!ok); };
      try {
        fetch(url, { method: "HEAD", cache: "no-store" })
          .then(function (r) {
            if (r.status >= 200 && r.status < 400) return done(true);
            // 部分服务器不支持 HEAD
            return fetch(url, { method: "GET", cache: "no-store" })
              .then(function (r2) { done(r2.status >= 200 && r2.status < 400); })
              .catch(function () { done(false); });
          })
          .catch(function () { done(false); });
      } catch (e) {
        done(false);
      }
    });
  }

  var html = "";
  try { html = document.documentElement ? document.documentElement.outerHTML : ""; } catch (e) { html = ""; }
  if (html.length > 1500000) html = html.slice(0, 1500000);

  var text = "";
  try { text = (document.body && document.body.innerText) ? document.body.innerText : ""; } catch (e) { text = ""; }

  var has_jsonld = false;
  try {
    var nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].textContent && nodes[i].textContent.trim().length > 0) { has_jsonld = true; break; }
    }
  } catch (e) { has_jsonld = false; }

  var origin = location.origin;
  return Promise.all([
    probe(origin + "/llms.txt"),
    probe(origin + "/robots.txt"),
    probe(origin + "/sitemap.xml"),
  ]).then(function (res) {
    return {
      url: location.href,
      html: html,
      text: text,
      has_jsonld: has_jsonld,
      llms: res[0],
      robots: res[1],
      sitemap: res[2],
      title: document.title || "",
      lang: document.documentElement ? (document.documentElement.lang || "") : "",
    };
  });
}
