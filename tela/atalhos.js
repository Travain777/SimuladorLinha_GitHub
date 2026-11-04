// Simulador de Linha — ATALHOS em todas as páginas (04/11/2026). O servidor põe este script em toda página .html que serve.
// Uma aba "Atalhos" na borda direita abre a gaveta com o painel, todas as telas e os .bat. Estilo isolado (shadow DOM):
// não mexe no visual da página onde entra. Fecha com Esc ou clicando fora.
import { GRUPOS, ITENS, ICONES } from "./atalhos_lista.js";

if (!window.__atalhosSimulador && !location.pathname.endsWith("/painel.html")) {
  window.__atalhosSimulador = true;
  const host = document.createElement("div"); host.id = "simulador-atalhos";
  host.style.cssText = "position:fixed;inset:auto;z-index:2147483000";
  document.body.appendChild(host);
  const raiz = host.attachShadow({ mode: "open" });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ic = (n, cor) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONES[n] || ICONES.painel}"/></svg>`;
  const atual = (h) => { try { const u = new URL(h, location.href); return u.pathname === location.pathname && (u.search === location.search || !u.search); } catch { return false; } };
  raiz.innerHTML = `<style>
  :host{all:initial}
  *{box-sizing:border-box;font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif}
  .aba{position:fixed;right:0;top:58%;transform:translateY(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 7px;border:0;cursor:pointer;
    border-radius:12px 0 0 12px;color:#eef0f3;background:linear-gradient(180deg,#15171b,#07080a);box-shadow:inset 1px 1px 0 rgba(255,255,255,.08),0 0 0 1px rgba(255,255,255,.1),-8px 10px 26px -12px rgba(0,0,0,.9)}
  .aba span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
  .aba:hover,.aba:focus-visible{outline:none;box-shadow:inset 1px 1px 0 rgba(255,255,255,.08),0 0 0 1px rgba(242,183,5,.7),0 0 0 4px rgba(242,183,5,.18)}
  .veu{position:fixed;inset:0;z-index:3;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .18s}
  .gaveta{position:fixed;top:0;right:0;bottom:0;z-index:4;width:min(380px,92vw);display:flex;flex-direction:column;color:#eef0f3;transform:translateX(104%);transition:transform .2s ease;
    background:radial-gradient(500px 260px at 100% -80px,rgba(255,255,255,.08),transparent 70%),#060708;box-shadow:inset 1px 0 0 rgba(255,255,255,.1),-24px 0 48px -12px rgba(0,0,0,.9)}
  :host([aberto]) .gaveta{transform:none}:host([aberto]) .veu{opacity:1;pointer-events:auto}
  .cab{display:flex;align-items:center;gap:10px;padding:16px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
  .cab b{font-size:15px}.cab small{display:block;color:#8d949d;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
  .fechar{margin-left:auto;width:32px;height:32px;border-radius:9px;border:0;cursor:pointer;color:#cfd5dc;background:#101215;box-shadow:0 0 0 1px rgba(255,255,255,.1);font-size:18px;line-height:1}
  .fechar:hover,.fechar:focus-visible{outline:none;box-shadow:0 0 0 1px #f2b705}
  .lista{overflow:auto;padding:8px 10px 20px}
  .painel{display:flex;align-items:center;gap:10px;margin:8px 4px 4px;padding:12px;border-radius:12px;text-decoration:none;color:#111;font-weight:650;font-size:14px;background:linear-gradient(180deg,#ffd23a,#f2b705);box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
  .painel:focus-visible{outline:2px solid #fff;outline-offset:2px}
  h3{margin:16px 8px 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8d949d;font-weight:650}
  a.it,button.it{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;border:0;background:none;text-align:left;cursor:pointer;color:#dfe3e8;text-decoration:none;font-size:13.5px}
  a.it:hover,button.it:hover,a.it:focus-visible,button.it:focus-visible{outline:none;background:#121418;box-shadow:0 0 0 1px rgba(255,255,255,.09)}
  a.it[aria-current="page"]{background:rgba(242,183,5,.1);box-shadow:0 0 0 1px rgba(242,183,5,.45)}
  .it small{margin-left:auto;font:11px ui-monospace,Consolas,monospace;color:#6b727b}
  .msg{margin:8px 10px 0;min-height:18px;font-size:12.5px;color:#9aa1aa}
  @media (prefers-reduced-motion:reduce){.gaveta,.veu{transition:none}}
  </style>
  <button class="aba" type="button" aria-label="Abrir os atalhos do Simulador de Linha" aria-expanded="false">${ic("painel", "#f2b705")}<span>Atalhos</span></button>
  <div class="veu"></div>
  <aside class="gaveta" role="dialog" aria-modal="true" aria-label="Atalhos do Simulador de Linha">
    <div class="cab">${ic("painel", "#f2b705")}<div><b>Simulador de Linha</b><small>Atalhos</small></div><button class="fechar" type="button" aria-label="Fechar atalhos">×</button></div>
    <div class="lista">
      <a class="painel" href="/tela/painel.html">${ic("painel", "#111")} Painel completo · todos os .bat</a>
      ${GRUPOS.map((g) => { const its = ITENS.filter((i) => i.grupo === g.id); return its.length ? `<h3>${esc(g.titulo)}</h3>` + its.map((i, k) => i.tipo === "pagina"
        ? `<a class="it" href="${esc(i.href)}"${atual(i.href) ? ' aria-current="page"' : ""}>${ic(i.icone, "#cfd5dc")}${esc(i.titulo)}</a>`
        : `<button class="it" type="button" data-bat="${esc(i.bat)}">${ic(i.icone, "#f2b705")}${esc(i.titulo)}<small>.bat</small></button>`).join("") : ""; }).join("")}
      <div class="msg" role="status" aria-live="polite"></div>
    </div>
  </aside>`;
  const aba = raiz.querySelector(".aba"), msg = raiz.querySelector(".msg");
  const abrir = (sim) => { if (sim) host.setAttribute("aberto", ""); else host.removeAttribute("aberto"); aba.setAttribute("aria-expanded", String(sim)); if (sim) raiz.querySelector(".fechar").focus(); else aba.focus(); };
  aba.onclick = () => abrir(true);
  raiz.querySelector(".fechar").onclick = () => abrir(false);
  raiz.querySelector(".veu").onclick = () => abrir(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && host.hasAttribute("aberto")) abrir(false); });
  for (const b of raiz.querySelectorAll("[data-bat]")) b.onclick = async () => {
    msg.textContent = "Abrindo " + b.dataset.bat + "…";
    try {
      const r = await fetch("/api/bat", { method: "POST", headers: { "Content-Type": "application/json", "X-Simulador": "painel" }, body: JSON.stringify({ nome: b.dataset.bat }) });
      const j = await r.json(); msg.textContent = j.ok ? b.dataset.bat + " aberto numa janela própria." : "Não abriu: " + j.erro;
    } catch { msg.textContent = "O servidor não respondeu."; }
  };
}
