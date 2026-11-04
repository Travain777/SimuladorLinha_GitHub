// Simulador de Linha — testes da VALIDAÇÃO (etapa E6). A "linha real" aqui é FICTÍCIA: uma linha simulada com outra semente.
// Prova que a ferramenta (1) dá diferença ~0 quando o modelo é a verdade e (2) ACUSA quando o modelo está errado.
// Uso: node motor/testes_validacao.mjs
import { readFileSync } from "node:fs";
import { calcularCiclo } from "./sincronismo.js";
import { validarApontamento, validarGravacao } from "./validacao.js";
import { gerarApontamento, gerarGravacao } from "../conferencia/gerar_apontamento_ficticio.mjs";

const T = JSON.parse(readFileSync(new URL("../modelos/linha_T_transfer_FICTICIA.json", import.meta.url), "utf8"));
const T29 = structuredClone(T); T29.prensas[0].spm_volante = 29;       // "linha real" com a Prensa 1 mais lenta que no modelo
const cm = calcularCiclo(T).destacker_variacao.ciclo_medio_s, cm29 = calcularCiclo(T29).destacker_variacao.ciclo_medio_s;
const casos = [];
function caso(nome, conta, esperado, obtido, tol, absoluto) {
  const dif = absoluto || esperado === 0 ? Math.abs(obtido - esperado) : Math.abs(obtido - esperado) / Math.abs(esperado);
  casos.push({ nome, conta, esperado, obtido, dif, ok: dif <= tol, tol, absoluto: absoluto || esperado === 0 });
}
const logico = (nome, conta, ok) => casos.push({ nome, conta, ok, logico: true });

const ap = gerarApontamento(T, { turnos: 12 });
{ const v = validarApontamento(T, ap, { sementes: 40 });
  caso("1. Reprodução: modelo = verdade (12 turnos)", "diferença total ≈ 0% (só o sorteio do destacker muda)", 0, v.reproducao.dif_pct, 0.5);
  caso("1b. Reprodução: pior turno", "cada turno dentro de ±1,5%", 0, v.reproducao.pior_turno_pct, 1.5);
  logico("2. Previsão: peças boas reais dentro da faixa simulada (40 sementes)", "real " + v.previsao.real + " entre P5 " + Math.round(v.previsao.sim_p5) + " e P95 " + Math.round(v.previsao.sim_p95), v.previsao.real_dentro_faixa);
  caso("2b. Previsão: diferença da média", "dentro da meta de 5%", 0, v.previsao.dif_pct, 5);
  const q = v.previsao.perdas_por_turno_min.find((p) => p.motivo === "troca");
  caso("2c. Previsão: minutos de troca por turno", "simulado ≈ real (mesmo lote e setup)", q.real, q.sim, 0.15); }
{ const v = validarApontamento(T, gerarApontamento(T29, { turnos: 12 }), { sementes: 10 });
  caso("3. Reprodução ACUSA modelo errado (Prensa 1 real 29 gpm, modelo 32)", "diferença = ciclo real ÷ ciclo do modelo − 1 = " + (100 * (cm29 / cm - 1)).toFixed(2) + "%", 100 * (cm29 / cm - 1), v.reproducao.dif_pct, 0.03);
  logico("3b. …e diz que está FORA da meta de 5%", "dentro_meta = falso", v.reproducao.dentro_meta === false); }
{ const a = structuredClone(ap), v0 = validarApontamento(T, ap, { sementes: 1 });
  a.troca_inclui_esvaziar_encher = "sim";
  for (const p of a.paradas) if (p.motivo === "troca") {                      // o apontador conta da última à primeira peça boa
    const t = a.turnos.find((x) => x.id === p.turno), veio = p.inicio_min === 0 && t.comecou_cheia === "nao", passa = p.inicio_min + p.min >= t.minutos_disponiveis - 0.5;
    const antes = veio ? 0 : v0.esvaziar_encher_min / 2, depois = passa ? 0 : v0.esvaziar_encher_min / 2;
    p.inicio_min = +Math.max(0, p.inicio_min - antes).toFixed(4); p.min = +Math.min(t.minutos_disponiveis - p.inicio_min, p.min + antes + depois).toFixed(4); }
  const v = validarApontamento(T, a, { sementes: 1 });
  caso("4. Troca apontada da última à primeira peça boa", "descontando esvaziar + encher (" + v0.esvaziar_encher_min.toFixed(2) + " min) dá o mesmo", v0.reproducao.sim, v.reproducao.sim, 0.002); }
{ const v1 = validarApontamento(T, ap, { sementes: 5 }), v2 = validarApontamento(T, ap, { sementes: 5 });
  logico("5. Repetível", "a mesma entrada dá o mesmo resultado", JSON.stringify({ ...v1, data: 0 }) === JSON.stringify({ ...v2, data: 0 })); }
{ const g = validarGravacao(T, gerarGravacao(T, { minutos: 180 }));
  caso("6. Gravação do CLP: ciclo golpe a golpe", "média medida ≈ ciclo médio do modelo " + cm.toFixed(3) + " s", cm, g.ciclo.medio_s, 0.01);
  caso("6b. Gravação do CLP reproduzida (paradas lidas do CLP)", "peças que saíram: diferença ≈ 0%", 0, g.reproducao.dif_pct, 1);
  logico("6c. Paradas e troca reconhecidas na gravação", g.paradas.length + " paradas e " + g.trocas.length + " troca(s)", g.paradas.length > 0 && g.trocas.length > 0); }
{ const g = validarGravacao(T, gerarGravacao(T29, { minutos: 120 }));
  caso("7. Gravação ACUSA ciclo real mais lento", "ciclo medido ≈ " + cm29.toFixed(3) + " s (Prensa 1 a 29 gpm)", cm29, g.ciclo.medio_s, 0.01);
  logico("7b. …e fora da meta", "dentro_meta = falso (" + g.reproducao.dif_pct.toFixed(2) + "%)", g.reproducao.dentro_meta === false); }

let ok = 0;
console.log("\nTESTES DA VALIDAÇÃO (E6) — dados FICTÍCIOS\n");
const f = (x) => x.toFixed(3).replace(".", ",");
for (const c of casos) {
  if (c.ok) ok++;
  console.log((c.ok ? "OK    " : "FALHOU") + "  " + c.nome);
  console.log("        conta: " + c.conta + (c.logico ? "" : "  →  esperado " + f(c.esperado) + " · obtido " + f(c.obtido) + " · diferença " + (c.absoluto ? f(c.dif) + " (limite " + f(c.tol) + ")" : (c.dif * 100).toFixed(2).replace(".", ",") + "% (limite " + (c.tol * 100).toFixed(1).replace(".", ",") + "%)")));
}
console.log("\n" + ok + " de " + casos.length + " casos certos.");
process.exit(ok === casos.length ? 0 : 1);
