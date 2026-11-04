// Simulador de Linha — estado da linha transfer num instante, a partir do registro da simulação (etapa S5, 04/11/2026).
// Usado pelo CLP de mentira (para responder como se fosse a máquina) e serve de referência para a tela.
// Códigos de situação (os mesmos do mapa de sinais):
export const SITUACAO = { produzindo: 0, quebra: 1, botoeira: 2, troca_ferramenta: 3, faltou_blank: 4, enchendo: 5, esvaziando: 6 };
import { estadoNoCiclo } from "./sincronismo.js";

export function prepararReproducao(arq, c, r) {
  const ev = r.registro.slice().sort((a, b) => a.t - b.t);
  const linhaEv = ev.filter((e) => e.tipo === "ciclo" || e.tipo === "parada");
  // contadores acumulados por evento de linha
  let golpes = 0, saidas = 0;
  for (const e of linhaEv) { if (e.tipo === "ciclo") { golpes++; if (e.sai) saidas++; } e.golpes = golpes; e.saidas = saidas; }
  const botoeiras = ev.filter((e) => e.tipo === "botoeira").map((e) => ({ t: e.t }));
  // magazines
  const pilha = arq.abastecimento?.entrada?.pecas_por_pilha || 0, nMag = arq.abastecimento?.entrada?.magazines || 0;
  const n = Array.from({ length: nMag }, () => pilha); let atual = 0; const mag = [{ t: 0, n: n.slice(), atual }];
  for (const e of ev) {
    if (e.tipo === "troca_magazine") atual = e.mag; else if (e.tipo === "ciclo" && e.entra && nMag) n[atual]--; else if (e.tipo === "pilha_trocada") n[e.mag] = pilha; else continue;
    mag.push({ t: e.t, n: n.slice(), atual });
  }
  const comps = [arq.transfer.id, arq.destacker.id, ...arq.prensas.map((p) => p.id)];
  return { arq, c, linhaEv, botoeiras, mag, comps, fim: r.segundos_simulados };
}

const ultimo = (l, t, k = "t") => { let a = 0, b = l.length - 1, r = -1; while (a <= b) { const m = (a + b) >> 1; if (l[m][k] <= t) { r = m; a = m + 1; } else b = m - 1; } return r; };

export function estadoEm(rep, t) {
  const { arq, c, linhaEv } = rep, i = ultimo(linhaEv, t), e = linhaEv[i];
  let situacao = SITUACAO.produzindo, comp = 0, tRel = null;
  const golpes = e ? (e.tipo === "ciclo" && t < e.t + e.dur ? e.golpes - 1 : e.golpes) : 0;     // conta o golpe quando o ciclo termina
  const saidas = e ? (e.tipo === "ciclo" && t < e.t + e.dur ? e.saidas - (e.sai ? 1 : 0) : e.saidas) : 0;
  if (e && e.tipo === "ciclo" && t < e.t + e.dur) { tRel = t - e.t; if (!e.entra) situacao = SITUACAO.esvaziando; else if (!e.sai) situacao = SITUACAO.enchendo; }
  else if (e && e.tipo === "parada" && t < e.t + e.dur) {
    situacao = { quebrada: SITUACAO.quebra, botoeira: SITUACAO.botoeira, troca_ferramenta: SITUACAO.troca_ferramenta, faltou_blank: SITUACAO.faltou_blank }[e.motivo] ?? SITUACAO.quebra;
    if (e.motivo === "quebrada") comp = rep.comps.indexOf(e.comp) + 1;          // 1 = transfer, 2 = destacker, 3.. = prensa 1..
  }
  const est = tRel != null ? estadoNoCiclo(arq, c, Math.min(tRel, c.ciclo_s - 1e-6)) : { x_mm: 0, y_mm: 0, grau_transfer: 0, passo: 0, prensas: arq.prensas.map(() => ({ graus: 0 })) };
  // ângulo do transfer: 0..360 ao longo do ciclo real (o passo 4 estica quando o destacker atrasa)
  let grau = 0;
  if (tRel != null) {
    const p4 = c.passos[3].inicio_s, ext = e.dur - c.ciclo_s, tn = tRel < p4 ? tRel : p4 + (tRel - p4) * (c.ciclo_s - p4) / (c.ciclo_s - p4 + Math.max(0, ext));
    grau = Math.min(359.9, 360 * tn / c.ciclo_s);
  }
  const m = rep.mag[Math.max(0, ultimo(rep.mag, t))];
  const pms = est.prensas.map((p) => (p.graus <= 2 || p.graus >= 358 ? 1 : 0));
  return {
    situacao, comp, em_ciclo: tRel != null ? 1 : 0, angulo_transfer: grau, passo: tRel != null ? est.passo : 0, x_mm: est.x_mm, y_mm: est.y_mm,
    prensas_graus: est.prensas.map((p) => p.graus), prensas_pms: pms, golpes, pecas_saida: saidas,
    botoeiras: ultimo(rep.botoeiras, t) + 1, magazine_atual: m.atual, blanks: m.n,
  };
}
