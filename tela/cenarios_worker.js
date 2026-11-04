// Simulador de Linha — cálculo dos cenários em segundo plano (etapa E5). Roda o MESMO motor validado, várias sementes,
// e devolve as médias. A e B usam as mesmas sementes (comparação justa: a diferença vem da mudança, não do sorteio).
import { simular } from "../motor/simulador.js";
import { simularTransfer } from "../motor/simulador_transfer.js";
import { calcularCiclo } from "../motor/sincronismo.js";
import { conferir } from "../motor/formato.js";

const media = (v) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const moda = (v) => { const c = {}; for (const x of v) c[x] = (c[x] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

onmessage = (e) => {
  const { id, arq, sementes } = e.data;
  try {
    const conf = conferir(arq);
    if (conf.erros.length) { postMessage({ id, erro: conf.erros.map((x) => x.campo + ": " + x.txt) }); return; }
    arq.calculado = { ...(arq.calculado || {}), ...conf.calculado };
    const runs = [];
    for (let s = 1; s <= sementes; s++) {
      const a = structuredClone(arq); a.linha.semente = s;
      runs.push(a.formato === "simulador-linha/2" ? simularTransfer(a) : simular(a));
      postMessage({ id, progresso: s / sementes });
    }
    const L = arq.linha, k = L.pecas_por_golpe || 1, res = { formato: arq.formato, sementes, demanda: L.demanda_pecas_dia, takt_s: arq.calculado.takt_s };
    const pd = runs.map((r) => r.pecas_por_dia);
    res.pecas_dia = { media: media(pd), min: Math.min(...pd), max: Math.max(...pd) };
    if (arq.formato === "simulador-linha/2") {
      const c = calcularCiclo(arq);
      res.ritmo_s = media(runs.map((r) => r.ritmo_real_s));
      res.oee = { oee: media(runs.map((r) => r.oee.oee)), disponibilidade: media(runs.map((r) => r.oee.disponibilidade)), desempenho: media(runs.map((r) => r.oee.desempenho)), qualidade: media(runs.map((r) => r.oee.qualidade)) };
      res.ciclo = { ciclo_s: c.ciclo_s, gpm: c.golpes_por_minuto, segura: c.segura.nome, segura_id: c.segura.id + (c.segura.prensa ? ":" + c.segura.prensa : ""), proximo: c.proximo.nome, gpm_se_igualar: c.gpm_se_igualar, destacker_atrasa_pct: c.destacker_variacao.atrasa_pct };
      const dias = runs[0].dias_simulados;
      res.perdas = Object.fromEntries(Object.keys(runs[0].perdas_min).map((p) => [p, media(runs.map((r) => r.perdas_min[p] / r.dias_simulados))]));
      res.quebras = runs[0].quebras.map((q, i) => ({ id: q.id, nome: q.nome, min_dia: media(runs.map((r) => r.quebras[i].min / r.dias_simulados)) }));
      res.botoeira_dia = media(runs.map((r) => r.botoeira.paradas / dias));
      res.trocas_dia = media(runs.map((r) => r.trocas_ferramenta / dias));
      res.dispDia = runs[0].segundos_simulados / 60 / dias;
    } else {
      res.ritmo_s = media(runs.map((r) => r.ciclo_real_s));
      res.oee = { oee: media(runs.map((r) => r.oee_linha.oee)), disponibilidade: media(runs.map((r) => r.oee_linha.disponibilidade_gargalo)), qualidade: media(runs.map((r) => r.oee_linha.qualidade)) };
      res.gargalo = moda(runs.map((r) => r.gargalo));
      res.gargalo_nome = arq.estacoes.find((x) => x.id === res.gargalo)?.nome || res.gargalo;
      const dias = runs[0].dias_simulados;
      res.estacoes = arq.estacoes.map((x, i) => ({ id: x.id, nome: x.nome, oee: media(runs.map((r) => r.estacoes[i].oee.oee)),
        pct: Object.fromEntries(Object.keys(runs[0].estacoes[i].pct).map((s) => [s, media(runs.map((r) => r.estacoes[i].pct[s]))])) }));
      const ig = arq.estacoes.findIndex((x) => x.id === res.gargalo);
      res.perdas = ig >= 0 ? Object.fromEntries(Object.keys(runs[0].estacoes[ig].perdas_min).map((p) => [p, media(runs.map((r) => r.estacoes[ig].perdas_min[p] / dias))])) : {};
      res.dispDia = runs[0].segundos_simulados / 60 / dias;
      res.empilhadeira_pct = runs[0].empilhadeiras ? media(runs.map((r) => r.empilhadeiras.uso_pct)) : null;
    }
    res.pecas_dia.media = res.pecas_dia.media; res.k = k;
    postMessage({ id, resultado: res });
  } catch (err) { postMessage({ id, erro: [err.message] }); }
};
