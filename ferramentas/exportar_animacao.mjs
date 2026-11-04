// Simulador de Linha — exporta a animação da linha transfer quadro a quadro (etapa S6, 04/11/2026).
// Os números vêm SÓ do simulador (S2 sincronismo + S3 simulação). O Blender e o Unreal só mostram este arquivo.
// Uso: node ferramentas/exportar_animacao.mjs <linha.json> [--inicio s|auto] [--duracao 40] [--fps 30] [--vel 1] [--saida arquivo.json]
//   --inicio auto  começa num trecho produzindo (depois do enchimento), no 1º dia
//   --vel 0.25     câmera lenta (0,25× = 4 vezes mais devagar); --vel 1 = tempo real
import fs from "node:fs";
import path from "node:path";
import { conferir } from "../motor/formato.js";
import { calcularCiclo } from "../motor/sincronismo.js";
import { simularTransfer } from "../motor/simulador_transfer.js";
import { prepararCena, cenaEm } from "../motor/cena_transfer.js";

const args = process.argv.slice(2), opc = (k, p) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : p; };
const entrada = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!entrada) { console.log("Uso: node ferramentas/exportar_animacao.mjs <linha.json> [--inicio s|auto] [--duracao 40] [--fps 30] [--vel 1] [--saida arquivo.json]"); process.exit(2); }
const arq = JSON.parse(fs.readFileSync(entrada, "utf8"));
if (arq.formato !== "simulador-linha/2") { console.error("Só para linha transfer (simulador-linha/2)."); process.exit(1); }
const cf = conferir(arq); if (cf.erros.length) { console.error("O arquivo da linha tem erro: " + cf.erros[0].campo + " — " + cf.erros[0].txt); process.exit(1); }
arq.calculado = { ...(arq.calculado || {}), ...cf.calculado };
const fps = +opc("--fps", 30), dur = +opc("--duracao", 40), vel = +opc("--vel", 1);
const disp = arq.calculado.tempo_disponivel_dia_min;
const c = calcularCiclo(arq), r = simularTransfer(arq, { horas: disp / 60, registrar: true }), cn = prepararCena(arq, c, r);
let inicio = opc("--inicio", "auto");
if (inicio === "auto") { const e = r.registro.find((x) => x.tipo === "ciclo" && x.t > 900 && x.entra && x.sai); inicio = e ? e.t : 0; } else inicio = +inicio;
const r4 = (x) => Math.round(x * 10000) / 10000;
const quadros = [];
for (let f = 0; f < Math.round(dur * fps); f++) {
  const t = inicio + f / fps * vel, s = cenaEm(cn, t);
  quadros.push({ t: r4(t), situacao: s.situacao, comp: s.comp, passo: s.passo, grau: r4(s.grau_transfer), barra: { x: r4(s.barra.x), z: r4(s.barra.z) },
    martelos: s.martelos.map((m) => r4(m.altura_m)), angulos: s.martelos.map((m) => r4(m.graus)), volantes: s.volantes.map((v) => r4(v.graus)),
    carro: { x: r4(s.carro.x), y: r4(s.carro.y), z: r4(s.carro.z) }, pilhas: s.pilhas.map(r4),
    pecas: s.pecas.map((p) => [p.id, r4(p.x), r4(p.y), r4(p.z), p.ruim ? 1 : 0]) });
}
const saida = opc("--saida", path.join(path.dirname(entrada), "..", "blender", path.basename(entrada).replace(/\.json$/, "") + "_animacao.json"));
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify({ formato: "simulador-animacao/1", linha: arq.linha.nome, ficticia: /fict/i.test(arq.linha.nome), fps, vel, inicio_s: r4(inicio), duracao_s: dur,
  ciclo_s: c.ciclo_s, golpes_por_minuto: c.golpes_por_minuto, segura: c.segura.nome, layout: cn.lay, prensas: arq.prensas.map((p) => ({ id: p.id, nome: p.nome })), quadros }));
const sits = {}; for (const q of quadros) sits[q.situacao] = (sits[q.situacao] || 0) + 1;
console.log("Animação gravada: " + saida);
console.log("  " + quadros.length + " quadros (" + fps + " por segundo, " + dur + " s de vídeo, velocidade " + vel + "×) a partir de " + inicio.toFixed(1) + " s de produção · ciclo " + c.ciclo_s + " s");
console.log("  situações: " + Object.entries(sits).map(([k, v]) => k + " " + v).join(" · "));
