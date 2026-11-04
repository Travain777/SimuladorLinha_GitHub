// Simulador de Linha — VALIDAÇÃO COM A LINHA REAL (etapa E6, 04/11/2026). Roda no Node e no navegador.
// Compara o simulador com o que aconteceu de verdade. Meta do plano: diferença de até 5% em peças por turno.
//  1. REPRODUÇÃO — cada turno real é simulado com as MESMAS paradas e trocas que aconteceram (nada sorteado além do destacker).
//     Prova o ciclo, o enchimento/esvaziamento e o ritmo: o que sobra de diferença é do modelo do ciclo.
//  2. PREVISÃO — o simulador roda com o MTBF/MTTR/refugo do arquivo (40 sementes) pelo mesmo tempo dos turnos reais.
//     Prova o modelo de falhas: as peças boas reais têm que cair dentro da faixa simulada.
//  3. GRAVAÇÃO DO CLP — o que a ponte da S5 gravou (só leitura): golpes, ciclo golpe a golpe e paradas, reproduzidos no simulador.
import { conferir } from "./formato.js";
import { calcularCiclo } from "./sincronismo.js";
import { simularTransfer } from "./simulador_transfer.js";

export const META_PCT = 5;
const SIT = ["produzindo", "quebra", "botoeira", "troca_ferramenta", "faltou_blank", "enchendo", "esvaziando"];

function prepararLinha(linha) {
  const arq = structuredClone(linha), cf = conferir(arq);
  if (cf.erros.length) throw new Error("o arquivo da linha tem erro: " + cf.erros[0].campo + " — " + cf.erros[0].txt);
  if (arq.formato !== "simulador-linha/2") throw new Error("a validação é para linha transfer (simulador-linha/2).");
  arq.calculado = { ...(arq.calculado || {}), ...cf.calculado };
  return arq;
}
// equipamento do apontamento → código do componente na linha
function componente(arq, eq) {
  if (eq === "transfer") return arq.transfer.id;
  if (eq === "destacker") return arq.destacker.id;
  const m = /^prensa_(\d+)$/.exec(eq || ""); if (m) return arq.prensas[+m[1] - 1]?.id ?? null;
  return null;
}
const pct = (sim, real) => (real ? 100 * (sim - real) / real : null);
const quantil = (v, q) => { const s = v.slice().sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * q, a = Math.floor(i); return s[a] + (s[Math.min(a + 1, s.length - 1)] - s[a]) * (i - a); };

// ---------------------------------------------------------------- 1 + 2: apontamento de turnos
export function validarApontamento(linha, ap, { sementes = 40 } = {}) {
  const cfa = conferir(ap); if (cfa.erros.length) throw new Error("o apontamento tem erro: " + cfa.erros[0].campo + " — " + cfa.erros[0].txt);
  const arq = prepararLinha(linha), c = calcularCiclo(arq), k = arq.linha.pecas_por_golpe || 1;
  const N = (arq.interpress?.quantidade || 0) + arq.prensas.length, cicloMed = c.destacker_variacao.ciclo_medio_s;
  const esvaziarEncherMin = 2 * N * cicloMed / 60, avisos = [];
  const turnos = ap.turnos.filter((t) => t.usar === "sim");
  if (!turnos.length) throw new Error("nenhum turno marcado para usar.");

  // ---- 1. reprodução, turno a turno
  const rep = turnos.map((t) => {
    const ps = ap.paradas.filter((p) => p.turno === t.id);
    const trocas = [], ee = esvaziarEncherMin / 2;          // metade esvazia, metade enche
    const paradas = ps.filter((p) => {
      if (p.motivo !== "troca") return true;
      let setup = p.min;
      if (ap.troca_inclui_esvaziar_encher === "sim") {         // desconta o que o simulador já faz: esvaziar (onde começou) e encher (onde terminou)
        const veioDeAntes = (p.inicio_min ?? 1) === 0 && t.comecou_cheia === "nao", passaDoFim = p.inicio_min != null && p.inicio_min + p.min >= t.minutos_disponiveis - 0.5;
        setup -= (veioDeAntes ? 0 : ee) + (passaDoFim ? 0 : ee);
        if (setup < 0) { avisos.push("turno " + t.id + ": troca de " + p.min + " min é menos que esvaziar + encher (" + esvaziarEncherMin.toFixed(1) + " min) — usei 0 de troca parada."); setup = 0; }
      }
      trocas.push({ setup_min: setup, inicio_min: p.inicio_min ?? null, veio: (p.inicio_min ?? 1) === 0 && t.comecou_cheia === "nao" }); return false;
    }).map((p) => {
      const comp = componente(arq, p.equipamento);
      if (p.motivo === "quebra" && !comp && p.equipamento !== "outro") avisos.push("turno " + t.id + ": a linha não tem " + p.equipamento.replace("_", " ") + " — a parada entrou como “outra”.");
      const motivo = p.motivo === "quebra" ? (comp ? "quebrada" : "outra") : p.motivo;
      return { motivo, comp: comp || undefined, min: p.min, inicio_min: p.inicio_min ?? null };
    });
    const r = simularTransfer(arq, { horas: t.minutos_disponiveis / 60, comecar_cheia: t.comecou_cheia === "sim", reproducao: { paradas, trocas } });
    const real = t.pecas_boas + t.refugo, sim = r.golpes_saida * k;
    const parado = ps.reduce((s, p) => s + p.min, 0), rodando = t.minutos_disponiveis - parado;
    return { id: t.id, data: t.data, turno: t.turno, minutos: t.minutos_disponiveis, parado_min: parado, real, sim, dif_pct: pct(sim, real),
      // ciclo real estimado: com as mesmas paradas, a diferença de peças vem do ciclo → ciclo do modelo × simulado ÷ real
      ciclo_real_s: real ? cicloMed * sim / real : null, trocas: trocas.length,
      nao_couberam: r.reproducao.paradas_nao_couberam + r.reproducao.trocas_nao_couberam };
  });
  rep.forEach((x) => { if (x.nao_couberam) avisos.push("turno " + x.id + ": " + x.nao_couberam + " parada(s)/troca(s) ficaram para depois do fim do turno (confira as horas)."); });
  const somaReal = rep.reduce((s, x) => s + x.real, 0), somaSim = rep.reduce((s, x) => s + x.sim, 0);
  const reproducao = { turnos: rep, real: somaReal, sim: somaSim, ciclo_real_estimado_s: somaReal ? cicloMed * somaSim / somaReal : null, dif_pct: pct(somaSim, somaReal), pior_turno_pct: Math.max(...rep.map((x) => Math.abs(x.dif_pct ?? 0))),
    dentro_meta: Math.abs(pct(somaSim, somaReal)) <= META_PCT, turnos_dentro: rep.filter((x) => Math.abs(x.dif_pct ?? 99) <= META_PCT).length };

  // ---- 2. previsão: o mesmo tempo dos turnos reais, um atrás do outro, com falhas sorteadas (várias sementes)
  const aquec = 60 * 60;                                       // 1 h de aquecimento (lote e magazines no meio do caminho)
  const janelas = []; { let t0 = aquec; for (const t of turnos) { janelas.push([t0, t0 + t.minutos_disponiveis * 60]); t0 += t.minutos_disponiveis * 60; } }
  const total = janelas[janelas.length - 1][1];
  const porSemente = [], porTurno = turnos.map(() => []), perdas = { quebra: [], botoeira: [], faltou_blank: [], troca: [] };
  for (let s = 0; s < sementes; s++) {
    const a = structuredClone(arq); a.linha.semente = (arq.linha.semente ?? 1) + 1000 + s;
    const r = simularTransfer(a, { horas: total / 3600, registrar: true, comecar_cheia: true });
    const boas = turnos.map(() => 0), par = { quebra: 0, botoeira: 0, faltou_blank: 0, troca: 0 };
    let j = 0;
    for (const e of r.registro) {
      if (e.t < aquec) continue;
      while (j < janelas.length && e.t >= janelas[j][1]) j++;
      if (j >= janelas.length) break;
      if (e.tipo === "ciclo" && e.sai && !e.ruim) boas[j] += k;
      else if (e.tipo === "parada") { const d = Math.min(e.dur, janelas[janelas.length - 1][1] - e.t) / 60; par[{ quebrada: "quebra", botoeira: "botoeira", faltou_blank: "faltou_blank", troca_ferramenta: "troca" }[e.motivo] || "quebra"] += d; }
    }
    porSemente.push(boas.reduce((x, y) => x + y, 0)); boas.forEach((b, i) => porTurno[i].push(b));
    for (const m in par) perdas[m].push(par[m] / turnos.length);
  }
  const realBoas = turnos.reduce((s, t) => s + t.pecas_boas, 0), media = porSemente.reduce((x, y) => x + y, 0) / sementes;
  const dp = Math.sqrt(porSemente.reduce((s, x) => s + (x - media) ** 2, 0) / Math.max(1, sementes - 1));
  const faixaTurno = porTurno.map((v) => [quantil(v, 0.05), quantil(v, 0.95)]);
  const dentroFaixa = turnos.filter((t, i) => t.pecas_boas >= faixaTurno[i][0] && t.pecas_boas <= faixaTurno[i][1]).length;
  const realPerdas = { quebra: 0, botoeira: 0, faltou_blank: 0, troca: 0, outra: 0 };
  for (const p of ap.paradas) if (turnos.some((t) => t.id === p.turno)) realPerdas[p.motivo] += p.min / turnos.length;
  const med = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const previsao = { sementes, real: realBoas, sim_media: media, sim_p5: quantil(porSemente, 0.05), sim_p95: quantil(porSemente, 0.95), dif_pct: pct(media, realBoas),
    dentro_meta: Math.abs(pct(media, realBoas)) <= META_PCT, real_dentro_faixa: realBoas >= quantil(porSemente, 0.05) && realBoas <= quantil(porSemente, 0.95),
    turnos_dentro_faixa: dentroFaixa, turnos: turnos.map((t, i) => ({ id: t.id, real: t.pecas_boas, p5: faixaTurno[i][0], p95: faixaTurno[i][1], media: med(porTurno[i]) })),
    perdas_por_turno_min: Object.keys(realPerdas).map((m) => ({ motivo: m, real: realPerdas[m], sim: perdas[m] ? med(perdas[m]) : 0 })), dp_total: dp };

  return { formato: "validacao/1", linha: arq.linha.nome, apontamento: ap.nome, data: new Date().toISOString(), meta_pct: META_PCT,
    ciclo_modelo_s: c.ciclo_s, ciclo_medio_modelo_s: cicloMed, gpm_modelo: c.golpes_por_minuto, turnos_usados: turnos.length, turnos_total: ap.turnos.length,
    troca_inclui_esvaziar_encher: ap.troca_inclui_esvaziar_encher, esvaziar_encher_min: esvaziarEncherMin, reproducao, previsao, avisos };
}

// ---------------------------------------------------------------- 3: gravação da ponte do CLP (registros/ao_vivo_*.jsonl)
export function validarGravacao(linha, texto) {
  const arq = prepararLinha(linha), c = calcularCiclo(arq), k = arq.linha.pecas_por_golpe || 1;
  const linhas = texto.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const cab = linhas[0] && !("t" in linhas[0]) ? linhas.shift() : null;
  const L = linhas.filter((m) => m.ok && m.v);
  if (L.length < 2) throw new Error("a gravação tem menos de 2 leituras boas.");
  const t0 = L[0].t, t1 = L[L.length - 1].t, dur = (t1 - t0) / 1000;
  const conta = (id) => (L[0].v[id] != null && L[L.length - 1].v[id] != null ? L[L.length - 1].v[id] - L[0].v[id] : null);
  // ciclo golpe a golpe (só produzindo), tempo em cada situação e paradas para reproduzir
  const intervalos = [], tempoSit = {}, paradas = [], trocas = [];
  let ultGolpe = null, seg = null, iniEsvaziando = null;   // a troca começa a esvaziar a linha antes de parar
  for (let i = 0; i < L.length; i++) {
    const m = L[i], v = m.v, prox = L[i + 1];
    if (prox) { const s = SIT[v.situacao] || "desconhecida"; tempoSit[s] = (tempoSit[s] || 0) + (prox.t - m.t) / 1000; }
    if (v.golpes != null && i > 0 && v.golpes > L[i - 1].v.golpes) {
      if (ultGolpe && v.golpes - L[i - 1].v.golpes === 1 && [0, 5, 6].includes(v.situacao) && [0, 5, 6].includes(L[i - 1].v.situacao)) intervalos.push((m.t - ultGolpe) / 1000);
      ultGolpe = m.t;
    }
    if (v.situacao != null && ![0, 5, 6].includes(v.situacao)) ultGolpe = null;   // parou: o próximo intervalo não é ciclo
    if (v.situacao === 6 && (i === 0 || L[i - 1].v.situacao !== 6)) iniEsvaziando = m.t; else if (v.situacao === 0 || v.situacao === 5) iniEsvaziando = null;
    const parado = v.situacao != null && ![0, 5, 6].includes(v.situacao);
    if (parado && !seg) seg = { sit: v.situacao, comp: v.comp_parada, ini: m.t, esv: iniEsvaziando };
    if (seg && (!parado || v.situacao !== seg.sit || !prox)) {
      const min = (m.t - seg.ini) / 60000, ini = (seg.ini - t0) / 60000;
      if (min > 0) {
        if (seg.sit === 3) trocas.push({ setup_min: min, inicio_min: seg.esv != null ? (seg.esv - t0) / 60000 : ini });
        else paradas.push({ motivo: { 1: "quebrada", 2: "botoeira", 4: "faltou_blank" }[seg.sit] || "outra", comp: seg.sit === 1 && seg.comp ? [arq.transfer.id, arq.destacker.id, ...arq.prensas.map((p) => p.id)][seg.comp - 1] : undefined, min, inicio_min: ini });
      }
      seg = parado ? { sit: v.situacao, comp: v.comp_parada, ini: m.t, esv: iniEsvaziando } : null;
    }
  }
  const golpes = conta("golpes"), saidas = conta("pecas_saida");
  const cheia = L[0].v.situacao === 0;
  // a troca na gravação já é só o tempo parado (o CLP mostra esvaziando/enchendo à parte)
  const r = simularTransfer(arq, { horas: dur / 3600, comecar_cheia: cheia, reproducao: { paradas, trocas } });
  const real = saidas != null ? saidas : golpes, simv = saidas != null ? r.golpes_saida * k : r.ciclos;
  const media = intervalos.length ? intervalos.reduce((x, y) => x + y, 0) / intervalos.length : null;
  return { formato: "validacao-gravacao/1", linha: arq.linha.nome, mapa: cab?.mapa || null, inicio: cab?.inicio || new Date(t0).toISOString(), duracao_min: dur / 60, leituras: L.length,
    golpes, pecas_saida: saidas, comparado: saidas != null ? "peças que saíram" : "golpes",
    ciclo: { golpes_medidos: intervalos.length, medio_s: media, mediana_s: quantil(intervalos, 0.5), p95_s: quantil(intervalos, 0.95), modelo_s: c.ciclo_s, modelo_medio_s: c.destacker_variacao.ciclo_medio_s, dif_pct: media ? pct(media, c.destacker_variacao.ciclo_medio_s) : null },
    tempo_situacao_min: Object.fromEntries(Object.entries(tempoSit).map(([s, x]) => [s, x / 60])), paradas, trocas,
    reproducao: { real, sim: simv, dif_pct: pct(simv, real), dentro_meta: real ? Math.abs(pct(simv, real)) <= META_PCT : false }, meta_pct: META_PCT };
}
