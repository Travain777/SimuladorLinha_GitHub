// Simulador de Linha — testes da simulação da linha transfer (etapa S3): cada caso é comparado com a conta feita à mão.
// Uso: node motor/testes_transfer.mjs
import { readFileSync } from "node:fs";
import { simularTransfer } from "./simulador_transfer.js";
import { golpe } from "./sincronismo.js";

const base = JSON.parse(readFileSync(new URL("../modelos/linha_T_transfer_FICTICIA.json", import.meta.url), "utf8"));
// linha "limpa": sem falhas, pega fixa de 1,8 s, sem lote, sem refugo, sem empilhadeira — cada teste liga só o que quer medir
function limpa(f) {
  const a = structuredClone(base);
  a.transfer.falhas = null; a.destacker.falhas = null; a.prensas.forEach((p) => { p.falhas = null; p.refugo_pct = 0; });
  a.destacker.pega_s = { min: 1.8, mais_comum: 1.8, max: 1.8 }; a.linha.lote_pecas = null; a.linha.setup_min = 0;
  a.abastecimento = { empilhadeiras: 0, entrada: null, saida: null };
  f && f(a); return a;
}
const C = 2 * (80 / 600 + 600 / 6000) + (650 / 1500 + 1500 / 6000) + (0.08 + 60 / 32 + 0.12) + 4 * 0.03;   // 3,345 s (S2)
const casos = [];
function caso(nome, conta, esperado, obtido, tol) {
  const dif = esperado === 0 ? Math.abs(obtido) : Math.abs(obtido - esperado) / Math.abs(esperado);
  casos.push({ nome, conta, esperado, obtido, dif, ok: dif <= tol, tol });
}

// 1) enchimento: as 17 primeiras voltas não tiram peça
{ const r = simularTransfer(limpa(), { horas: 1 }), N = Math.floor(3600 / C);
  caso("1. Enchimento de 17 posições (1 hora)", "ciclos completos − 17 = " + N + " − 17", N - 17, r.golpes_saida, 0); }
// 2) lote e troca de ferramenta: cada lote = L ciclos alimentando + 17 esvaziando + setup
{ const L = 100, S = 10 * 60, r = simularTransfer(limpa((a) => { a.linha.lote_pecas = L; a.linha.setup_min = 10; }), { horas: 200 });
  caso("2. Lote de 100 e troca de 10 min", "200 h × 100 ÷ ((100 + 17) × ciclo + 600 s)", 200 * 3600 * L / ((L + 17) * C + S), r.golpes_saida, 0.003); }
// 3) uma falha (transfer): disponibilidade = MTBF ÷ (MTBF + MTTR)
{ const r = simularTransfer(limpa((a) => { a.transfer.falhas = { mtbf_min: 60, mttr_min: 6 }; }), { horas: 3000 });
  caso("3. Transfer com MTBF 60 min e MTTR 6 min", "3000 h ÷ ciclo × 60/66", 3000 * 3600 / C * 60 / 66, r.golpes_saida, 0.012); }
// 4) várias falhas: qualquer uma para a linha toda → disponibilidade = 1 ÷ (1 + Σ MTTR/MTBF)
{ const r = simularTransfer(limpa((a) => { a.prensas[0].falhas = { mtbf_min: 100, mttr_min: 5 }; a.prensas[3].falhas = { mtbf_min: 200, mttr_min: 8 }; a.prensas[7].falhas = { mtbf_min: 400, mttr_min: 10 }; }), { horas: 3000 });
  const disp = 1 / (1 + 5 / 100 + 8 / 200 + 10 / 400);
  caso("4. Três prensas com falhas (uma para todas)", "1 ÷ (1 + 0,05 + 0,04 + 0,025) = 89,7%", disp, r.oee.disponibilidade, 0.012); }
// 5) variação do destacker: o ciclo médio é o da conta exata da S2
{ const a = limpa((a) => { a.destacker.pega_s = { min: 1.6, mais_comum: 1.8, max: 2.4 }; }), r = simularTransfer(a, { horas: 2000 });
  caso("5. Destacker variando 1,6 / 1,8 / 2,4 s", "ciclo médio da S2 (conta exata) = " + r.sincronismo.destacker_variacao.ciclo_medio_s.toFixed(3) + " s", r.sincronismo.destacker_variacao.ciclo_medio_s, 2000 * 3600 / r.ciclos, 0.002); }
// 6) botoeira: 1% de refugo na P1, operadora acha 100%, cada parada 2 min → cada peça custa ciclo + 1% × 120 s
{ const r = simularTransfer(limpa((a) => { a.prensas[0].refugo_pct = 1; a.saida.operadora.acha_defeito_pct = 100; a.saida.operadora.parada_botoeira_min = { min: 2, mais_comum: 2, max: 2 }; }), { horas: 2000 });
  caso("6. Botoeira: 1% de refugo, parada de 2 min", "2000 h ÷ (ciclo + 0,01 × 120 s)", 2000 * 3600 / (C + 0.01 * 120), r.golpes_saida, 0.015);
  caso("6b. Uma parada por peça ruim achada", "paradas = refugo achado", r.refugo_achado, r.botoeira.paradas, 0); }
// 7) operadora não acha nenhum defeito: não para, e o defeito passa
{ const r = simularTransfer(limpa((a) => { a.prensas[0].refugo_pct = 1; a.saida.operadora.acha_defeito_pct = 0; }), { horas: 1000 });
  caso("7. Operadora acha 0%: nenhuma parada", "paradas = 0", 0, r.botoeira.paradas, 0);
  caso("7b. Defeitos que passaram = 1% das peças", "0,01 × peças que saíram", 0.01, r.defeitos_passaram / r.golpes_saida, 0.06); }
// 8) duas prensas com 1% cada: qualidade = 0,99 × 0,99
{ const r = simularTransfer(limpa((a) => { a.prensas[1].refugo_pct = 1; a.prensas[5].refugo_pct = 1; a.saida.operadora.acha_defeito_pct = 0; }), { horas: 1000 });
  caso("8. Duas prensas com 1% de refugo", "qualidade = 0,99 × 0,99 = 98,01%", 0.99 * 0.99, r.oee.qualidade, 0.002); }
// 9) um magazine só: a linha espera a empilhadeira a cada pilha
{ const F = 10 * 60, r = simularTransfer(limpa((a) => { a.abastecimento = { empilhadeiras: 1, entrada: { estacao: "EST_Destacker", pecas_por_pilha: 100, magazines: 1, chegada_empilhadeira_min: 5, troca_min: 5 }, saida: null }; }), { horas: 1000 });
  caso("9. 1 magazine de 100, empilhadeira 10 min", "1000 h × 100 ÷ (100 × ciclo + 600 s)", 1000 * 3600 * 100 / (100 * C + F), r.golpes_saida, 0.003); }
// 10) dois magazines e pilha que dura mais que a empilhadeira (300 × 3,345 s = 1.004 s > 600 s):
//     só perde a troca A↔B (pega 1,8 + troca 6 s passa do golpe em 5,725 s, uma vez por pilha)
{ const r = simularTransfer(limpa((a) => { a.abastecimento = { empilhadeiras: 1, entrada: { estacao: "EST_Destacker", pecas_por_pilha: 300, magazines: 2, chegada_empilhadeira_min: 5, troca_min: 5 }, saida: null }; a.destacker.troca_magazine_s = 6; }), { horas: 1000 });
  const extra = 1.8 + 6 - (0.08 + 60 / 32 + 0.12);
  caso("10. 2 magazines de 300: só a troca A↔B", "1000 h × 300 ÷ (300 × ciclo + 5,725 s)", 1000 * 3600 * 300 / (300 * C + extra), r.golpes_saida, 0.002);
  caso("10b. Nunca faltou blank", "faltou blank = 0 min", 0, r.perdas_min.faltou_blank, 0); }
// 11) operadora lenta (5 s por peça, ciclo 3,345 s): a mesa enche mas a linha NÃO para
{ const r1 = simularTransfer(limpa(), { horas: 8 }), r2 = simularTransfer(limpa((a) => { a.saida.operadora.tempo_peca_s = { min: 5, mais_comum: 5, max: 5 }; }), { horas: 8 });
  caso("11. Operadora lenta não para a linha", "mesmas peças com operadora normal e lenta", r1.golpes_saida, r2.golpes_saida, 0);
  casos.push({ nome: "11b. A mesa acumula (mais de 1.000 peças esperando)", conta: "mesa no fim > 1.000", esperado: 1, obtido: r2.operadora.mesa_fim > 1000 ? 1 : 0, dif: 0, ok: r2.operadora.mesa_fim > 1000, tol: 0, logico: true }); }
// 12) mesma semente, mesmo resultado (linha completa)
{ const a = simularTransfer(base, { horas: 50 }), b = simularTransfer(base, { horas: 50 });
  caso("12. Mesma semente dá o mesmo resultado", "diferença = 0", a.golpes_saida, b.golpes_saida, 0); }
// 13) as perdas somam o tempo planejado e o OEE fecha (linha completa, 5 dias)
{ const r = simularTransfer(base), soma = Object.values(r.perdas_min).reduce((x, y) => x + y, 0);
  caso("13. Perdas somam o tempo planejado", "5 dias × 840 min = 4.200 min", 4200, soma, 1e-9);
  caso("13b. OEE = disponibilidade × desempenho × qualidade", "A × D × Q = boas × ciclo ideal ÷ tempo planejado", r.oee.oee_direto, r.oee.oee, 1e-9); }

// ---- E6: REPRODUÇÃO de um turno real (as paradas que aconteceram entram no lugar das sorteadas)
const T8 = 8 * 60 * 60;                                                   // um turno de 8 h (480 min) sem pausa
// 14) linha já cheia, nenhuma parada: sai uma peça por ciclo desde o 1º
{ const r = simularTransfer(limpa(), { horas: 8, comecar_cheia: true, reproducao: { paradas: [], trocas: [] } });
  caso("14. Reprodução: linha cheia, sem parada (8 h)", "ciclos completos = 28.800 s ÷ ciclo", Math.floor(T8 / C), r.golpes_saida, 0); }
// 15) paradas reais somando 47 min (sem hora: espalhadas no turno)
{ const par = [{ motivo: "quebrada", comp: "EST_Prensa_3", min: 20 }, { motivo: "botoeira", min: 4 }, { motivo: "faltou_blank", min: 8 }, { motivo: "outra", min: 15 }];
  const r = simularTransfer(limpa(), { horas: 8, comecar_cheia: true, reproducao: { paradas: par, trocas: [] } });
  caso("15. Reprodução: 47 min de paradas reais", "(28.800 − 47 × 60) ÷ ciclo", Math.floor((T8 - 47 * 60) / C), r.golpes_saida, 0);
  caso("15b. Minutos por motivo iguais aos do turno", "20 + 4 + 8 + 15 = 47 min", 47, r.perdas_min.quebrada + r.perdas_min.botoeira + r.perdas_min.faltou_blank + r.perdas_min.outras_paradas, 1e-9);
  const p3 = r.quebras.find((q) => q.id === "EST_Prensa_3");
  caso("15c. A quebra fica na prensa certa", "Prensa 3: 1 quebra de 20 min", 20, p3 ? p3.min : 0, 1e-9); }
// 16) linha vazia no começo do turno: as 17 primeiras voltas não tiram peça
{ const r = simularTransfer(limpa(), { horas: 8, reproducao: { paradas: [{ motivo: "quebrada", comp: "EST_Transfer", min: 30, inicio_min: 100 }] } });
  caso("16. Reprodução: começa vazia, 30 min de quebra às 100 min", "(28.800 − 1.800) ÷ ciclo − 17", Math.floor((T8 - 1800) / C) - 17, r.golpes_saida, 0); }
// 17) uma troca real de 25 min: esvazia (17 voltas ainda tiram peça), troca, enche (17 voltas sem peça)
{ const r = simularTransfer(limpa(), { horas: 8, comecar_cheia: true, reproducao: { paradas: [], trocas: [{ inicio_min: 200, setup_min: 25 }] } });
  caso("17. Reprodução: 1 troca de ferramenta de 25 min", "(28.800 − 1.500) ÷ ciclo − 17", Math.floor((T8 - 1500) / C) - 17, r.golpes_saida, 0);
  caso("17b. Uma troca contada", "1 troca", 1, r.trocas_ferramenta, 0); }
// 18) na reprodução nada é sorteado: com MTBF e refugo ligados, nenhuma quebra nem refugo aparece
{ const r = simularTransfer(base, { horas: 8, comecar_cheia: true, reproducao: { paradas: [], trocas: [] } });
  caso("18. Reprodução não sorteia quebra, refugo nem botoeira", "quebras + refugo + botoeira = 0", 0, r.quebras.reduce((s, q) => s + q.falhas, 0) + r.pecas_ruins_saida + r.botoeira.paradas, 0); }

let ok = 0;
console.log("\nTESTES DA LINHA TRANSFER — conta à mão × simulação\n");
const f = (x) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString("pt-BR") : x.toFixed(4).replace(".", ","));
for (const c of casos) {
  if (c.ok) ok++;
  console.log((c.ok ? "OK    " : "FALHOU") + "  " + c.nome);
  console.log("        conta: " + c.conta + (c.logico ? "" : "  →  esperado " + f(c.esperado) + " · simulação " + f(c.obtido) + " · diferença " + (c.dif * 100).toFixed(3).replace(".", ",") + "% (limite " + (c.tol * 100).toFixed(2).replace(".", ",") + "%)"));
}
console.log("\n" + ok + " de " + casos.length + " casos dentro do limite.");
process.exit(ok === casos.length ? 0 : 1);
