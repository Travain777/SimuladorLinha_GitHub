// Simulador de Linha — servidor local (etapas E4, S1, E5, S5, S6 e E6, 04/11/2026).
// Serve a pasta do Simulador SÓ para este computador (127.0.0.1) e abre o navegador. Não precisa de internet.
// O navegador não deixa abrir os módulos JavaScript direto do arquivo (file://), por isso este servidorzinho.
// Também grava os formulários: só arquivos .json dentro de modelos/ e de privado/ (dados reais da validação, E6),
// e ANTES de gravar por cima guarda a versão anterior em _reprovados/<pasta>/ (nada se perde).
// Ponte ao vivo (S5): lê o CLP pelo mapa de sinais (SÓ LEITURA — Modbus TCP ou SLMP), manda para a tela por /api/ao-vivo
// e grava o que leu em registros/ (para a validação real, E6).
// Painel (04/11): /tela/painel.html reúne todos os .bat. POST /api/bat roda SÓ um .bat da lista fixa (tela/atalhos_lista.js),
// numa janela própria, e só aceita pedido da própria página (cabeçalho X-Simulador + origem localhost). Toda página .html
// servida ganha a aba "Atalhos" (tela/atalhos.js) com o caminho para as outras.
// Uso: node ferramentas/servidor.mjs [arquivo_da_linha.json] [--formulario | --cenarios | --menu | --painel]      (fechar a janela preta encerra)
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { conferir, FORMATOS } from "../motor/formato.js";
import { criarCliente, blocosDeLeitura, lerSinais } from "./clp/sinais.mjs";
import { calcularCiclo } from "../motor/sincronismo.js";
import { layoutCena, cenaDoCLP } from "../motor/cena_transfer.js";
import { rodarValidacao } from "./validar.mjs";
import { ITENS } from "../tela/atalhos_lista.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELOS = path.join(RAIZ, "modelos"), PASTAS = ["modelos", "privado"];
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".txt": "text/plain; charset=utf-8" };

const json = (res, cod, obj) => { res.writeHead(cod, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const carimbo = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

function listar() {
  return PASTAS.flatMap((pasta) => { const dir = path.join(RAIZ, pasta); return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith("_resultado.json") && !f.startsWith("validacao_")).sort().map((f) => {
    try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); return FORMATOS.includes(d.formato) ? { arquivo: pasta + "/" + f, nome: d.linha?.nome || d.nome || f, formato: d.formato, linha: typeof d.linha === "string" ? d.linha : undefined } : null; }
    catch { return null; }
  }).filter(Boolean) : []; });
}

function salvar(req, res) {
  let corpo = "";
  req.on("data", (c) => { corpo += c; if (corpo.length > 2e6) req.destroy(); });
  req.on("end", () => {
    let p; try { p = JSON.parse(corpo); } catch { return json(res, 400, { ok: false, erro: "dados inválidos" }); }
    const m = /^(modelos|privado)\/([A-Za-z0-9_\-]+\.json)$/.exec(p.arquivo || "");
    if (!m || m[2].endsWith("_resultado.json") || m[2].startsWith("validacao_")) return json(res, 400, { ok: false, erro: "só grava arquivos .json das pastas modelos e privado (nome sem espaço nem acento)." });
    const pasta = m[1], nomeArq = m[2], COPIAS = path.join(RAIZ, "_reprovados", pasta);
    const r = conferir(p.dados);
    if (r.erros.length) return json(res, 400, { ok: false, erro: r.erros.length + " erro(s) no formulário: " + r.erros[0].txt });
    fs.mkdirSync(path.join(RAIZ, pasta), { recursive: true });
    const destino = path.join(RAIZ, pasta, nomeArq);
    let copia = null;
    if (fs.existsSync(destino)) {                                     // guarda a versão anterior antes de gravar por cima
      fs.mkdirSync(COPIAS, { recursive: true });
      copia = path.join(COPIAS, nomeArq.replace(/\.json$/, "") + "__" + carimbo() + ".json");
      fs.copyFileSync(destino, copia);
      copia = path.relative(RAIZ, copia).split(path.sep).join("/");
    }
    p.dados.calculado = { ...(p.dados.calculado || {}), ...r.calculado };
    p.dados.alterado_em = new Date().toISOString();
    fs.writeFileSync(destino, JSON.stringify(p.dados, null, 2), "utf8");
    console.log("  salvo: " + pasta + "/" + nomeArq + (copia ? "  (anterior em " + copia + ")" : ""));
    json(res, 200, { ok: true, arquivo: pasta + "/" + nomeArq, copia });
  });
}

// ---------------------------------------------------------------- ponte ao vivo com o CLP (só leitura)
const ponte = { ligada: false, mapa: null, arquivo: null, cliente: null, ouvintes: new Set(), ultimo: null, leituras: 0, erros: 0, gravacao: null, ultimaGravada: 0, chaveAnterior: "" };
function enviar(msg) { const txt = "data: " + JSON.stringify(msg) + "\n\n"; for (const r of ponte.ouvintes) r.write(txt); }
function gravar(msg) {
  if (!ponte.gravacao) return;
  const v = msg.v || {}, chave = [v.situacao, v.comp_parada, v.golpes, v.pecas_saida, v.botoeiras, msg.ok].join("|");
  if (chave !== ponte.chaveAnterior || msg.t - ponte.ultimaGravada >= 1000) { fs.appendFileSync(ponte.gravacao, JSON.stringify(msg) + "\n"); ponte.chaveAnterior = chave; ponte.ultimaGravada = msg.t; }
}
async function laçoPonte() {
  const c = ponte.mapa.conexao, prot = c.protocolo, blocos = blocosDeLeitura(prot, ponte.mapa.sinais);
  while (ponte.ligada) {
    const t0 = Date.now();
    try {
      if (!ponte.cliente) { ponte.cliente = criarCliente(c); await ponte.cliente.conectar(); console.log("  ponte: conectada a " + c.endereco_ip + ":" + c.porta + " (" + prot + ", só leitura)"); }
      const v = await lerSinais(ponte.cliente, prot, blocos);
      const msg = { t: Date.now(), ok: true, ms: Date.now() - t0, v }; ponte.ultimo = msg; ponte.leituras++; enviar(msg); gravar(msg);
    } catch (e) {
      ponte.erros++; ponte.cliente?.fechar(); ponte.cliente = null;
      const msg = { t: Date.now(), ok: false, erro: e.message }; ponte.ultimo = msg; enviar(msg); gravar(msg);
      await new Promise((r) => setTimeout(r, 2000)); continue;
    }
    await new Promise((r) => setTimeout(r, Math.max(0, c.intervalo_ms - (Date.now() - t0))));
  }
  ponte.cliente?.fechar(); ponte.cliente = null;
}
function corpoJSON(req) { return new Promise((ok) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); }); }
async function apiPonte(rel, req, res) {
  if (rel === "/api/ao-vivo" && req.method === "GET") {                                        // fluxo contínuo para a tela (Server-Sent Events)
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("retry: 2000\n\n"); ponte.ouvintes.add(res); if (ponte.ultimo) res.write("data: " + JSON.stringify(ponte.ultimo) + "\n\n");
    req.on("close", () => ponte.ouvintes.delete(res)); return;
  }
  if (rel === "/api/ao-vivo/estado") return json(res, 200, { ligada: ponte.ligada, arquivo: ponte.arquivo, leituras: ponte.leituras, erros: ponte.erros, gravacao: ponte.gravacao && path.relative(RAIZ, ponte.gravacao).split(path.sep).join("/"), ultimo: ponte.ultimo });
  if (rel === "/api/ao-vivo/parar" && req.method === "POST") { ponte.ligada = false; return json(res, 200, { ok: true }); }
  if (rel === "/api/ao-vivo/cena") {                                    // a cena em metros, pronta para o Blender e o Unreal (S6)
    if (!ponte.ligada || !ponte.ultimo?.ok) return json(res, 200, { ok: false, erro: ponte.ligada ? "sem leitura do CLP" : "ponte desligada" });
    try {
      if (!ponte.cena || ponte.cena.mapa !== ponte.arquivo) {
        const arq = JSON.parse(fs.readFileSync(path.join(RAIZ, ponte.mapa.linha), "utf8")); arq.calculado = { ...(arq.calculado || {}), ...conferir(arq).calculado };
        ponte.cena = { mapa: ponte.arquivo, arq, c: calcularCiclo(arq), lay: layoutCena(arq) };
      }
      const { arq, c, lay } = ponte.cena;
      return json(res, 200, { ok: true, leitura_t: ponte.ultimo.t, ...cenaDoCLP(arq, c, lay, ponte.ultimo.v) });
    } catch (e) { return json(res, 500, { ok: false, erro: e.message }); }
  }
  if (rel === "/api/ao-vivo/iniciar" && req.method === "POST") {
    const p = await corpoJSON(req), m = /^(modelos|privado)\/([A-Za-z0-9_\-]+\.json)$/.exec(p.mapa || "");
    if (!m) return json(res, 400, { ok: false, erro: "escolha um mapa de sinais da pasta modelos ou privado." });
    let mapa; try { mapa = JSON.parse(fs.readFileSync(path.join(RAIZ, m[1], m[2]), "utf8")); } catch { return json(res, 400, { ok: false, erro: "não consegui ler " + p.mapa }); }
    if (mapa.formato !== "simulador-sinais/1") return json(res, 400, { ok: false, erro: p.mapa + " não é um mapa de sinais." });
    const r = conferir(mapa); if (r.erros.length) return json(res, 400, { ok: false, erro: "o mapa de sinais tem erro: " + r.erros[0].txt });
    ponte.ligada = false; await new Promise((ok) => setTimeout(ok, 50));
    fs.mkdirSync(path.join(RAIZ, "registros"), { recursive: true });
    Object.assign(ponte, { ligada: true, mapa, arquivo: p.mapa, cena: null, leituras: 0, erros: 0, ultimo: null, chaveAnterior: "", gravacao: path.join(RAIZ, "registros", "ao_vivo_" + carimbo() + ".jsonl") });
    fs.writeFileSync(ponte.gravacao, JSON.stringify({ inicio: new Date().toISOString(), mapa: p.mapa, conexao: mapa.conexao }) + "\n");
    laçoPonte();
    return json(res, 200, { ok: true, gravacao: path.relative(RAIZ, ponte.gravacao).split(path.sep).join("/") });
  }
  json(res, 404, { ok: false });
}

// ---------------------------------------------------------------- painel
const BATS = [...new Set(ITENS.filter((i) => i.bat).map((i) => i.bat))];
const ATALHOS = '<script type="module" src="/tela/atalhos.js"></script>';
function clpLigado() {                                               // o CLP de mentira (127.0.0.1:5020) responde? só abre e fecha a conexão
  return new Promise((ok) => { const sock = net.connect({ host: "127.0.0.1", port: 5020 }); let feito = false;
    const fim = (v) => { if (feito) return; feito = true; sock.destroy(); ok(v); };
    sock.setTimeout(600, () => fim(false)); sock.on("connect", () => fim(true)); sock.on("error", () => fim(false)); });
}
function ultimaValidacao() {
  const d = path.join(RAIZ, "privado"); if (!fs.existsSync(d)) return null;
  const f = fs.readdirSync(d).filter((x) => /^validacao_.*\.html$/.test(x)).map((x) => ({ x, t: fs.statSync(path.join(d, x)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  return f ? "privado/" + f.x : null;
}
async function rodarBat(req, res) {
  const origem = req.headers.origin || "", daqui = !origem || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origem);
  if (req.headers["x-simulador"] !== "painel" || !daqui) return json(res, 403, { ok: false, erro: "pedido recusado (só o painel deste PC pode abrir .bat)." });
  const p = await corpoJSON(req), nome = p.nome;
  if (!BATS.includes(nome)) return json(res, 400, { ok: false, erro: "esse .bat não está na lista do painel." });
  if (!fs.existsSync(path.join(RAIZ, nome))) return json(res, 404, { ok: false, erro: nome + " não está nesta pasta." });
  if (process.platform !== "win32") return json(res, 501, { ok: false, erro: "os .bat só rodam no Windows." });
  exec('start "Simulador - ' + nome.replace(/\.bat$/, "") + '" "' + nome + '"', { cwd: RAIZ, windowsHide: false }, () => {});
  console.log("  painel: abriu " + nome);
  json(res, 200, { ok: true });
}

const servidor = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === "/api/lista" && req.method === "GET") return json(res, 200, listar());
  if (rel === "/api/salvar" && req.method === "POST") return salvar(req, res);
  if (rel.startsWith("/api/ao-vivo")) return apiPonte(rel, req, res);
  if (rel === "/api/clp-de-mentira") return clpLigado().then((ok) => json(res, 200, { ok }));   // E8: o CLP de mentira está ligado?
  if (rel === "/api/painel") return clpLigado().then((clp) => json(res, 200, {                      // painel: o que existe e o que está ligado
    windows: process.platform === "win32", sistema: process.platform, clp, ponte: { ligada: ponte.ligada, leituras: ponte.leituras, arquivo: ponte.arquivo },
    bats: BATS.filter((b) => fs.existsSync(path.join(RAIZ, b))),
    arquivos: Object.fromEntries(ITENS.filter((i) => i.precisa).map((i) => [i.precisa, fs.existsSync(path.join(RAIZ, i.precisa))])),
    ultima_validacao: ultimaValidacao() }));
  if (rel === "/ir/ultima-validacao") {
    const u = ultimaValidacao();
    if (u) { res.writeHead(302, { Location: "/" + u, "Cache-Control": "no-store" }); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end("<!doctype html><meta charset='utf-8'><title>Validação</title><body style='background:#050607;color:#eef0f3;font:15px system-ui;padding:40px'><h1 style='font-size:20px'>Ainda não há relatório de validação</h1><p>Rode o VALIDAR_LINHA_REAL.bat ou o botão “Validar com o simulador” do apontamento real.</p><p><a style='color:#f2b705' href='/tela/painel.html'>Voltar ao painel</a></p>" + ATALHOS + "</body>");
  }
  if (rel === "/api/bat" && req.method === "POST") return rodarBat(req, res);
  if (rel === "/api/validar" && req.method === "POST") return corpoJSON(req).then((p) => {   // E6: validação com a linha real
    try { const r = rodarValidacao({ apontamento: p.apontamento, gravacao: p.gravacao, sementes: 40 }); console.log("  validação: " + r.relatorio); json(res, 200, { ok: true, relatorio: r.relatorio, aviso: r.avisoFic }); }
    catch (e) { json(res, 400, { ok: false, erro: e.message }); }
  });
  if (req.method !== "GET") { res.writeHead(405).end(); return; }
  if (rel.endsWith("/")) rel += "index.html";
  const arq = path.resolve(RAIZ, "." + rel);
  if (arq !== RAIZ && !arq.startsWith(RAIZ + path.sep)) { res.writeHead(403).end(); return; }   // só dentro da pasta
  fs.readFile(arq, (err, dados) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado: " + rel); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    if (path.extname(arq).toLowerCase() === ".html" && !arq.endsWith("painel.html")) {          // aba "Atalhos" em toda página
      const t = dados.toString("utf8"), i = t.lastIndexOf("</body>");
      return res.end(i >= 0 ? t.slice(0, i) + ATALHOS + t.slice(i) : t + ATALHOS);
    }
    res.end(dados);
  });
});

const args = process.argv.slice(2), formulario = args.includes("--formulario"), cenarios = args.includes("--cenarios"), menu = args.includes("--menu"), painel = args.includes("--painel");
const arqLinha = args.find((a) => !a.startsWith("--"));
let porta = 8091;
servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE" && porta < 8110) { porta++; servidor.listen(porta, "127.0.0.1"); }
  else { console.error("Não consegui abrir o servidor: " + e.message); process.exit(1); }
});
servidor.on("listening", () => {
  let url = "http://localhost:" + porta + "/tela/" + (painel ? "painel.html" : menu ? "inicio.html" : "");
  if (formulario || cenarios) url += (cenarios ? "cenarios.html" : "formulario.html") + (arqLinha ? "?linha=" + encodeURIComponent(path.relative(RAIZ, path.resolve(arqLinha)).split(path.sep).join("/")) : "");
  else if (arqLinha) url += "?linha=" + encodeURIComponent(path.relative(path.join(RAIZ, "tela"), path.resolve(arqLinha)).split(path.sep).join("/"));
  console.log("\n  Simulador de Linha — " + (painel ? "painel" : menu ? "demonstração" : cenarios ? "cenários A × B" : formulario ? "formulários" : "tela 3D"));
  console.log("  Endereço: " + url);
  console.log("  Para encerrar: feche esta janela.\n");
  if (!process.env.SEM_NAVEGADOR) {
    const cmd = process.platform === "win32" ? 'start "" "' + url + '"' : process.platform === "darwin" ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
    exec(cmd);
  }
});
servidor.listen(porta, "127.0.0.1");
