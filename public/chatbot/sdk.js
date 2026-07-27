/*!
 * WWJMRD Support Assistant — embeddable widget SDK
 *
 * <script src="https://wwjmrdai.online/chatbot/sdk.js"
 *         data-public-key="pk_xxx"
 *         data-api="https://<project>.supabase.co/functions/v1/chatbot-public"
 *         defer></script>
 *
 * Or manually:  WWJMRDChat.init({ publicKey: "pk_xxx", api: "..." });
 */
(function () {
  "use strict";
  if (window.WWJMRDChat) return;

  var S = {};
  var state = { open: false, conversationId: null, sessionId: null, busy: false, cfg: null };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function css(color) {
    return (
      ".wwc-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;padding:14px 18px;" +
      "background:" + color + ";color:#fff;font:600 14px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)}" +
      ".wwc-panel{position:fixed;right:20px;bottom:84px;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);" +
      "z-index:2147483000;background:#fff;color:#111;border-radius:16px;overflow:hidden;display:none;flex-direction:column;" +
      "box-shadow:0 20px 60px rgba(0,0,0,.3);font:14px/1.5 system-ui,sans-serif}" +
      ".wwc-panel.open{display:flex}" +
      ".wwc-head{background:" + color + ";color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;font-weight:600}" +
      ".wwc-head img{height:24px;width:auto;border-radius:4px;background:#fff}" +
      ".wwc-head button{margin-left:auto;background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1}" +
      ".wwc-body{flex:1;overflow-y:auto;padding:14px;background:#f7f8fa}" +
      ".wwc-msg{margin-bottom:10px;display:flex}" +
      ".wwc-msg.u{justify-content:flex-end}" +
      ".wwc-msg span{padding:9px 12px;border-radius:14px;max-width:82%;white-space:pre-wrap;word-break:break-word}" +
      ".wwc-msg.u span{background:" + color + ";color:#fff;border-bottom-right-radius:4px}" +
      ".wwc-msg.a span{background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}" +
      ".wwc-typing span{background:#fff;border:1px solid #e5e7eb;color:#888}" +
      ".wwc-fb{display:flex;gap:6px;margin:-4px 0 10px 2px}" +
      ".wwc-fb button{border:1px solid #e5e7eb;background:#fff;border-radius:8px;cursor:pointer;padding:2px 7px;font-size:12px}" +
      ".wwc-foot{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}" +
      ".wwc-foot input{flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;font:inherit;outline:none}" +
      ".wwc-foot button{border:0;background:" + color + ";color:#fff;border-radius:10px;padding:0 14px;font:600 14px system-ui;cursor:pointer}" +
      ".wwc-note{font-size:11px;color:#888;text-align:center;padding:0 0 8px}"
    );
  }

  function api(payload) {
    return fetch(S.api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ publicKey: S.publicKey }, payload)),
    }).then(function (r) { return r.json(); });
  }

  function scroll(body) { body.scrollTop = body.scrollHeight; }

  function addMsg(body, role, text) {
    var m = el("div", "wwc-msg " + (role === "user" ? "u" : "a"));
    m.appendChild(el("span", null, String(text).replace(/[<>]/g, "")));
    body.appendChild(m);
    scroll(body);
    return m;
  }

  function addFeedback(body, messageId) {
    if (!messageId) return;
    var row = el("div", "wwc-fb");
    [["👍", 1], ["👎", -1]].forEach(function (p) {
      var b = el("button", null, p[0]);
      b.onclick = function () {
        api({ action: "feedback", messageId: messageId, rating: p[1] });
        row.innerHTML = "<span style='font-size:11px;color:#888'>Thanks for the feedback</span>";
      };
      row.appendChild(b);
    });
    body.appendChild(row);
    scroll(body);
  }

  function build(cfg) {
    var color = cfg.primaryColor || "#0066cc";
    var style = el("style"); style.textContent = css(color); document.head.appendChild(style);

    var btn = el("button", "wwc-btn", "💬 " + (S.buttonLabel || "Support"));
    var panel = el("div", "wwc-panel");
    var head = el("div", "wwc-head");
    if (cfg.logoUrl) { var img = el("img"); img.src = cfg.logoUrl; img.alt = ""; head.appendChild(img); }
    head.appendChild(el("div", null, cfg.name || "Support Assistant"));
    var close = el("button", null, "×");
    head.appendChild(close);

    var body = el("div", "wwc-body");
    var note = el("div", "wwc-note", "Answers come from our official Knowledge Base.");
    var foot = el("div", "wwc-foot");
    var input = el("input");
    input.placeholder = "Ask about fees, status, review…";
    var send = el("button", null, "Send");
    foot.appendChild(input); foot.appendChild(send);
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(note); panel.appendChild(foot);
    document.body.appendChild(btn); document.body.appendChild(panel);

    addMsg(body, "assistant", cfg.welcomeMessage || "Hello! How can I help you today?");

    function toggle(open) {
      state.open = open;
      panel.classList.toggle("open", open);
      if (open) input.focus();
    }
    btn.onclick = function () { toggle(!state.open); };
    close.onclick = function () { toggle(false); };

    function submit() {
      var text = input.value.trim();
      if (!text || state.busy) return;
      input.value = "";
      addMsg(body, "user", text);
      state.busy = true;
      var typing = el("div", "wwc-msg a wwc-typing");
      typing.appendChild(el("span", null, "Typing…"));
      body.appendChild(typing); scroll(body);

      api({
        action: "message",
        message: text,
        sessionId: state.sessionId,
        conversationId: state.conversationId,
        memory: S.memory || {},
      }).then(function (d) {
        typing.remove();
        state.busy = false;
        if (d && d.conversationId) state.conversationId = d.conversationId;
        addMsg(body, "assistant", (d && (d.reply || d.error)) || "Sorry, something went wrong.");
        if (d && d.messageId) addFeedback(body, d.messageId);
      }).catch(function () {
        typing.remove();
        state.busy = false;
        addMsg(body, "assistant", "Sorry, I couldn't reach support right now. Please try again.");
      });
    }
    send.onclick = submit;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });

    S.open = function () { toggle(true); };
    S.close = function () { toggle(false); };
  }

  function init(opts) {
    opts = opts || {};
    var tag = document.currentScript || document.querySelector("script[data-public-key]");
    S.publicKey = opts.publicKey || (tag && tag.getAttribute("data-public-key"));
    S.api = opts.api || (tag && tag.getAttribute("data-api"));
    S.buttonLabel = opts.buttonLabel || (tag && tag.getAttribute("data-label"));
    S.memory = opts.memory || {};
    if (!S.publicKey || !S.api) {
      console.error("[WWJMRDChat] publicKey and api are required.");
      return;
    }
    state.sessionId = "sdk-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

    api({ action: "config" }).then(function (cfg) {
      if (cfg && cfg.error) { console.error("[WWJMRDChat] " + cfg.error); return; }
      state.cfg = cfg;
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { build(cfg); });
      } else build(cfg);
    });
  }

  S.init = init;
  window.WWJMRDChat = S;

  var auto = document.currentScript;
  if (auto && auto.getAttribute("data-public-key")) init({});
})();
