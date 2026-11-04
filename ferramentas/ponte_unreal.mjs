// Simulador de Linha — PONTE PARA O UNREAL 4.27 AO VIVO (etapa S6, 04/11/2026).
// Manda as posições da Linha T para o Unreal pelo plugin Remote Control API (vem no 4.27, gratuito), ~20 vezes por segundo.
// Fontes: --fonte simulacao (reproduz o 1º dia da simulação em tempo real) ou --fonte clp (o que a ponte da S5 leu do CLP).
// Só o simulador escreve no UNREAL (posição de atores). Nada aqui fala com o CLP: o CLP continua só lido, pela S5.
// Uso: node ferramentas/ponte_unreal.mjs [--fonte simulacao|clp] [--config blender/unreal_ponte.json] [--teste]
//   --teste  não manda nada: só mostra o primeiro pacote que mandaria (para conferir os nomes dos atores)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conferir } from "../motor/formato.js";
import { calcularCiclo } from "../motor/sincronismo.js";
import { simularTransfer } from "../motor/simulador_transfer.js";
import { prepararCena, cenaEm, layoutCena } from "../motor/cena_transfer.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), opc = (k, p) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : p; };
const cfgArq = opc("--config", path.join(RAIZ, "blender", "unreal_ponte.json"));
const cfg = JSON.parse(fs.readFileSync(cfgArq, "utf8")), fonte = opc("--fonte", cfg.fonte || "simulacao"), teste = args.includes("--teste");
const arq = JSON.parse(fs.readFileSync(path.join(RAIZ, cfg.linha), "utf8")); arq.calculado = { ...(arq.calculado || {}), ...conferir(arq).calculado };
const c = calcularCiclo(arq), lay = layoutCena(arq), Y = lay.Y_TRAB;
let cn = null, inicio = Date.now();
if (fonte === "simulacao") { const r = simularTransfer(arq, { horas: arq.calculado.tempo_disponivel_dia_min / 60, registrar: true }); cn = prepararCena(arq, c, r); }

// simulador (x ao longo, y para cima, z para a frente; metros) → Unreal (X, Y, Z em centímetros)
const UE = (x, y, z) => ({ X: +(x * 100).toFixed(2), Y: +(z * 100).toFixed(2), Z: +(y * 100).toFixed(2) });
const caminho = (nome) => cfg.mapa_unreal + ":PersistentLevel." + (cfg.atores?.[nome] || nome);
const chamar = (nome, funcao, parametros) => ({ RequestId: 0, URL: "/remote/object/call", Verb: "PUT", Body: { objectPath: caminho(nome), functionName: funcao, parameters: parametros, generateTransaction: false } });
const mover = (nome, loc) => chamar(nome, "K2_SetActorLocation", { NewLocation: loc, bSweep: false, bTeleport: true });

function pacote(s) {
  const req = [];
  for (const lado of [-1, 1]) req.push(mover(lado < 0 ? "EST_Transfer_Barra_Tras" : "EST_Transfer_Barra_Frente", UE(s.barra.x, Y + 0.02, lado * s.barra.z)));
  const prensas = lay.posicoes.filter((p) => p.tipo === "prensa");
  s.martelos.forEach((m, k) => req.push(mover(m.id + "_Martelo", UE(prensas[k].x, Y + 0.012 + m.altura_m, 0))));
  if (s.carro) req.push(mover("EST_Destacker_Carro", UE(s.carro.x, s.carro.y, s.carro.z)));
  lay.destacker.magazines.forEach((mg, k) => { const h = 0.02 + (s.pilhas[k] ?? 1); const nome = "EST_Destacker_Mag_" + "AB"[k];
    req.push(chamar(nome, "SetActorScale3D", { NewScale3D: { X: 1, Y: 1, Z: +h.toFixed(4) } })); req.push(mover(nome, UE(mg.x, 0.3 + h / 2, mg.z))); });
  req.forEach((r, i) => { r.RequestId = i; });
  return { Requests: req };
}
async function estadoAgora() {
  if (fonte === "clp") { const r = await fetch(cfg.simulador + "/api/ao-vivo/cena"); const j = await r.json(); if (!j.ok) throw new Error("simulador: " + j.erro + " (ligue a ponte do CLP na tela 3D ou no Blender)"); return j; }
  return cenaEm(cn, (cfg.inicio_s || 900) + (Date.now() - inicio) / 1000);
}

if (teste) { const s = await estadoAgora(); console.log(JSON.stringify(pacote(s), null, 1).slice(0, 2500)); process.exit(0); }
console.log("\n  PONTE PARA O UNREAL — fonte: " + (fonte === "clp" ? "CLP (pela ponte da S5, só leitura)" : "simulação em tempo real"));
console.log("  Unreal: " + cfg.unreal + " · mapa " + cfg.mapa_unreal + "\n  Para encerrar: feche esta janela.\n");
let ok = 0, falhas = 0, ultimoErro = "";
for (;;) {
  const t0 = Date.now();
  try {
    const s = await estadoAgora();
    const r = await fetch(cfg.unreal + "/remote/batch", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pacote(s)) });
    if (!r.ok) throw new Error("Unreal respondeu " + r.status + " " + (await r.text()).slice(0, 160));
    ok++;
  } catch (e) { falhas++; ultimoErro = e.message; if (falhas % 20 === 1) console.log("  ainda sem Unreal: " + ultimoErro + " (o Unreal está aberto, com o plugin Remote Control API ligado?)"); await new Promise((r) => setTimeout(r, 1000)); continue; }
  if (ok % 100 === 1) console.log("  " + new Date().toLocaleTimeString("pt-BR") + " · " + ok + " pacotes enviados");
  await new Promise((r) => setTimeout(r, Math.max(0, 50 - (Date.now() - t0))));
}
