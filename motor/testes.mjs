// Simulador de Linha — testes do motor (etapa E2): cada caso é comparado com a conta feita à mão.
// Uso: node motor/testes.mjs
import { simular } from "./simulador.js";

function linha({ estacoes, horas = 100, lote = null, setup = 0, k = 1, semente = 7, abast = null }) {
  return {
    formato: "simulador-linha/1",
    linha: { nome: "teste", pecas_por_golpe: k, demanda_pecas_dia: 1, lote_pecas: lote, setup_min: setup, dias_simulados: 1, semente },
    turnos: [], calculado: { tempo_disponivel_dia_min: horas * 60, takt_s: null },
    estacoes: estacoes.map((e, i) => ({
      ordem: i + 1, id: "EST_" + (i + 1), nome: "E" + (i + 1), tipo: i === 0 ? "alimentacao" : i === estacoes.length - 1 ? "saida" : "processo",
      ciclo_s: Array.isArray(e.c) ? { min: e.c[0], mais_comum: e.c[1], max: e.c[2] } : { min: e.c, mais_comum: e.c, max: e.c },
      paralelas: e.p || 1, estoque_depois: e.b || 0, falhas: e.mtbf ? { mtbf_min: e.mtbf, mttr_min: e.mttr } : null, refugo_pct: e.r || 0,
    })),
    abastecimento: abast || { empilhadeiras: 0 },
  };
}

const casos = [];
function caso(nome, conta, esperado, obtido, tolerancia) {
  const dif = esperado === 0 ? Math.abs(obtido) : Math.abs(obtido - esperado) / Math.abs(esperado);
  casos.push({ nome, conta, esperado, obtido, dif, ok: dif <= tolerancia, tolerancia });
}
const H = 100, T = H * 3600;

// 1) uma máquina, ciclo fixo
{ const r = simular(linha({ estacoes: [{ c: 4 }], horas: H }));
  caso("1. Uma máquina, ciclo fixo de 4 s", "100 h ÷ 4 s", T / 4, r.golpes_saida, 0.0001); }

// 2) três máquinas ligadas direto (estoque 0): manda a mais lenta
{ const r = simular(linha({ estacoes: [{ c: 3 }, { c: 5 }, { c: 4 }], horas: H }));
  caso("2. Três máquinas ligadas direto (3 s, 5 s, 4 s)", "100 h ÷ 5 s (a mais lenta manda)", T / 5, r.golpes_saida, 0.001); }

// 3) falhas: disponibilidade = MTBF / (MTBF + MTTR)
{ const r = simular(linha({ estacoes: [{ c: 4, mtbf: 60, mttr: 6 }], horas: 2000 }));
  const esp = 2000 * 3600 / 4 * (60 / 66);
  caso("3. Falhas: MTBF 60 min, MTTR 6 min", "2000 h ÷ 4 s × 60/(60+6)", esp, r.golpes_saida, 0.01); }

// 4) refugo de 2%
{ const r = simular(linha({ estacoes: [{ c: 4, r: 2 }], horas: 1000 }));
  const feitos = r.golpes_saida + r.refugo_pecas;
  caso("4. Refugo de 2%", "peças boas ÷ peças feitas = 98%", 0.98, r.golpes_saida / feitos, 0.003); }

// 5) lote e troca de ferramenta
{ const r = simular(linha({ estacoes: [{ c: 4 }], horas: H, lote: 100, setup: 10 }));
  caso("5. Lote de 100 e troca de 10 min", "100 h × 100 ÷ (100 × 4 s + 600 s)", T * 100 / 1000, r.golpes_saida, 0.005); }

// 6) lei de Little: estoque médio = vazão × tempo na linha
{ const r = simular(linha({ estacoes: [{ c: [3, 4, 6] }, { c: [3.5, 4.2, 5] }, { c: [3, 4, 7] }].map((e, i) => ({ ...e, b: i < 2 ? 5 : 0 })), horas: 1000 }));
  const lambda = r.golpes_saida / r.segundos_simulados;
  caso("6. Lei de Little (3 máquinas com estoque)", "estoque médio = vazão × tempo na linha", lambda * r.tempo_medio_na_linha_s, r.estoque_medio_golpes, 0.01); }

// 7) uma pilha só: a linha para enquanto a empilhadeira troca
{ const ab = { empilhadeiras: 1, entrada: { pecas_por_pilha: 100, magazines: 1, chegada_empilhadeira_min: 5, troca_min: 5 },
               saida: { pecas_por_rack: 1e9, posicoes: 2, chegada_empilhadeira_min: 0, troca_min: 0 } };
  const r = simular(linha({ estacoes: [{ c: 4 }], horas: 1000, abast: ab }));
  caso("7. 1 magazine, pilha de 100, empilhadeira 10 min", "1000 h × 100 ÷ (99 × 4 s + 600 s)", 1000 * 3600 * 100 / 996, r.golpes_saida, 0.002); }

// 8) dois magazines: a troca acontece enquanto o outro alimenta — não perde nada
{ const ab = { empilhadeiras: 1, entrada: { pecas_por_pilha: 400, magazines: 2, chegada_empilhadeira_min: 5, troca_min: 5 },
               saida: { pecas_por_rack: 1e9, posicoes: 2, chegada_empilhadeira_min: 0, troca_min: 0 } };
  const r = simular(linha({ estacoes: [{ c: 4 }], horas: H, abast: ab }));
  caso("8. 2 magazines (troca de 10 min < 1 pilha de 26 min)", "100 h ÷ 4 s (sem perda)", T / 4, r.golpes_saida, 0.0001); }

// 9) ciclo sorteado: média da triangular = (mín + mais comum + máx) ÷ 3
{ const r = simular(linha({ estacoes: [{ c: [3, 4, 8] }], horas: 2000 }));
  caso("9. Ciclo sorteado entre 3, 4 e 8 s", "média = (3+4+8)/3 = 5 s", 5, r.segundos_simulados / r.golpes_saida, 0.005); }

// 10) máquinas em paralelo: duas de 8 s valem uma de 4 s
{ const r = simular(linha({ estacoes: [{ c: 2 }, { c: 8, p: 2 }, { c: 2 }].map((e, i) => ({ ...e, b: i === 0 ? 2 : 0 })), horas: H }));
  caso("10. Duas máquinas de 8 s em paralelo", "100 h ÷ (8 s ÷ 2)", T / 4, r.golpes_saida, 0.001); }

// 11) repetível: mesma semente, mesmo resultado
{ const a = simular(linha({ estacoes: [{ c: [3, 4, 6], mtbf: 30, mttr: 5, r: 1 }, { c: [3, 4, 5] }], horas: 50, semente: 3 }));
  const b = simular(linha({ estacoes: [{ c: [3, 4, 6], mtbf: 30, mttr: 5, r: 1 }, { c: [3, 4, 5] }], horas: 50, semente: 3 }));
  caso("11. Mesma semente dá o mesmo resultado", "diferença = 0", 0, a.golpes_saida - b.golpes_saida, 0); }

// 12) OEE com quebras e refugo: OEE = disponibilidade × qualidade (ciclo sempre no ideal)
{ const r = simular(linha({ estacoes: [{ c: 4, mtbf: 60, mttr: 6, r: 2 }], horas: 2000 }));
  caso("12. OEE com quebras e 2% de refugo", "60/(60+6) × 1 × 0,98", (60 / 66) * 0.98, r.estacoes[0].oee.oee, 0.01); }

// 13) desempenho com ciclo sorteado: ciclo ideal 3 s, média 5 s → 60%
{ const r = simular(linha({ estacoes: [{ c: [3, 4, 8] }], horas: 2000 }));
  caso("13. Desempenho com ciclo entre 3, 4 e 8 s", "ciclo ideal 3 s ÷ média 5 s = 60%", 0.6, r.estacoes[0].oee.desempenho, 0.005); }

// 14) as perdas somam o tempo planejado
{ const r = simular(linha({ estacoes: [{ c: [3, 4, 6], mtbf: 30, mttr: 5, r: 1, b: 3 }, { c: [3.5, 4.5, 6], mtbf: 40, mttr: 8 }], horas: 200, lote: 500, setup: 15 }));
  const soma = Object.values(r.estacoes[1].perdas_min).reduce((a, b) => a + b, 0);
  caso("14. Perdas somam o tempo planejado", "200 h = 12.000 min", 12000, soma, 0.0001); }

let ok = 0;
console.log("\nTESTES DO MOTOR — conta à mão × simulador\n");
for (const c of casos) {
  if (c.ok) ok++;
  const fmt = (x) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString("pt-BR") : x.toFixed(4).replace(".", ","));
  console.log((c.ok ? "OK    " : "FALHOU") + "  " + c.nome);
  console.log("        conta: " + c.conta + "  →  esperado " + fmt(c.esperado) + " · simulador " + fmt(c.obtido) +
    " · diferença " + (c.dif * 100).toFixed(3).replace(".", ",") + "% (limite " + (c.tolerancia * 100).toFixed(2).replace(".", ",") + "%)");
}
console.log("\n" + ok + " de " + casos.length + " casos dentro do limite.");
process.exit(ok === casos.length ? 0 : 1);
