// Simulador de Linha — relatório do estudo (etapa E3). Gera uma página HTML só com o necessário (abre sem internet;
// no navegador, Ctrl+P → Salvar como PDF). Uso pelo rodar.mjs: gerarRelatorio(arquivoDaLinha, resultado).
const ESTADOS = [
  ["produzindo", "Produzindo", "var(--s1)", "#fff"], ["faltou_peca", "Faltou peça", "var(--s2)", "#fff"], ["bloqueada", "Bloqueada", "var(--s3)", "#0b0b0b"],
  ["quebrada", "Quebrada", "var(--s4)", "#0b0b0b"], ["troca_ferramenta", "Troca de ferramenta", "var(--s5)", "#0b0b0b"],
];
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n = (x, c = 0) => x == null || Number.isNaN(x) ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const p = (x, c = 1) => n(100 * x, c) + "%";

export function gerarRelatorio(arq, r) {
  const L = arq.linha, k = L.pecas_por_golpe || 1, dias = r.dias_simulados || 1;
  const atende = r.demanda_pecas_dia ? r.pecas_por_dia >= r.demanda_pecas_dia : null;
  const g = r.estacoes.find((e) => e.id === r.gargalo);
  const ficticio = /fict/i.test(L.nome || "");

  // gráfico: barras horizontais empilhadas, uma por estação (100% do tempo disponível)
  const W = 720, rot = 230, barraW = W - rot - 10, alt = 22, passo = 34, topo = 8;
  const H = topo + r.estacoes.length * passo + 4;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Tempo de cada estação por estado">`;
  r.estacoes.forEach((e, i) => {
    const y = topo + i * passo;
    svg += `<text x="${rot - 10}" y="${y + alt / 2 + 4}" text-anchor="end" class="rot">${esc(e.nome)}${e.id === r.gargalo ? " ◀" : ""}</text>`;
    let x = rot;
    for (const [id, nome, cor, tinta] of ESTADOS) {
      const v = e.pct[id] / 100 * barraW;
      if (v < 0.5) continue;
      const larg = Math.max(0, v - 2);                // 2 px de folga entre segmentos
      svg += `<rect x="${x.toFixed(1)}" y="${y}" width="${larg.toFixed(1)}" height="${alt}" rx="3" fill="${cor}"><title>${esc(e.nome)} — ${nome}: ${n(e.pct[id], 1)}% (${n(e.pct[id] / 100 * r.horas_simuladas * 60 / dias, 0)} min por dia)</title></rect>`;
      if (larg > 38) svg += `<text x="${(x + larg / 2).toFixed(1)}" y="${y + alt / 2 + 4}" text-anchor="middle" class="val" fill="${tinta}">${n(e.pct[id], 0)}%</text>`;
      x += v;
    }
  });
  svg += `</svg>`;
  const legenda = ESTADOS.map(([, nome, cor]) => `<span class="leg"><i style="background:${cor}"></i>${nome}</span>`).join("");

  // tabela por estação
  const linhasTab = r.estacoes.map((e) => `<tr${e.id === r.gargalo ? ' class="garg"' : ""}><td>${esc(e.nome)}${e.id === r.gargalo ? " <b>(gargalo)</b>" : ""}</td>` +
    ESTADOS.map(([id]) => `<td>${n(e.pct[id], 1)}%</td>`).join("") +
    `<td>${p(e.oee.disponibilidade)}</td><td>${p(e.oee.desempenho)}</td><td>${p(e.oee.qualidade, 2)}</td><td><b>${p(e.oee.oee)}</b></td><td>${n(e.refugo * k)}</td></tr>`).join("");

  // perdas do gargalo em minutos por dia
  const PERDAS = [["refugo", "Refugo"], ["ciclo_lento", "Ciclo acima do ideal"], ["faltou_peca", "Faltou peça"], ["bloqueada", "Bloqueada"], ["quebrada", "Quebrada"], ["troca_ferramenta", "Troca de ferramenta"]];
  const totPerdas = PERDAS.reduce((s, [id]) => s + g.perdas_min[id], 0);
  const maxP = Math.max(...PERDAS.map(([id]) => g.perdas_min[id]));
  const perdas = PERDAS.slice().sort((a, b) => g.perdas_min[b[0]] - g.perdas_min[a[0]]).map(([id, nome]) =>
    `<div class="pl"><span>${nome}</span><span class="pb"><i style="width:${(100 * g.perdas_min[id] / (maxP || 1)).toFixed(1)}%"></i></span><span class="pv">${n(g.perdas_min[id] / dias, 0)} min/dia</span></div>`).join("");

  // premissas
  const premEst = arq.estacoes.map((e) => `<tr><td>${esc(e.nome)}</td><td>${n(e.ciclo_s.min, 2)} / ${n(e.ciclo_s.mais_comum, 2)} / ${n(e.ciclo_s.max, 2)}</td><td>${e.paralelas}</td><td>${e.estoque_depois}</td><td>${e.falhas ? n(e.falhas.mtbf_min) + " / " + n(e.falhas.mttr_min, 1) : "—"}</td><td>${n(e.refugo_pct, 1)}%</td></tr>`).join("");
  const ab = arq.abastecimento;
  const premAb = ab && ab.empilhadeiras > 0
    ? `Entrada: pilhas de ${n(ab.entrada.pecas_por_pilha)} blanks, ${ab.entrada.magazines} magazine(s), empilhadeira chega em ${n(ab.entrada.chegada_empilhadeira_min, 1)} min e troca em ${n(ab.entrada.troca_min, 1)} min. Saída: racks de ${n(ab.saida.pecas_por_rack)} peças, ${ab.saida.posicoes} posição(ões), chegada ${n(ab.saida.chegada_empilhadeira_min, 1)} min, troca ${n(ab.saida.troca_min, 1)} min. ${ab.empilhadeiras} empilhadeira(s) para entrada e saída.`
    : "Abastecimento não simulado (sempre abastecido).";
  const turnos = (arq.turnos || []).map((t) => `${esc(t.nome)} ${t.inicio}–${t.fim} (pausas ${n(t.pausa_min)} min)`).join(" · ");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Estudo de linha — ${esc(L.nome)}</title>
<style>
:root{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--tx:#0b0b0b;--tx2:#52514e;--borda:#dddcd6;--fundo:#fcfcfb;--marca:#f2b705}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--tx);font:14px/1.45 Arial,Helvetica,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 24px 40px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px;padding-bottom:4px;border-bottom:3px solid var(--marca)}
.sub{color:var(--tx2);margin:0}.aviso{background:#fff6d5;border-left:5px solid var(--marca);padding:8px 12px;margin:14px 0;font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.kpi{border:1px solid var(--borda);border-radius:10px;padding:12px 14px;background:#fff}.kpi b{display:block;font-size:26px;margin:2px 0}
.kpi span{color:var(--tx2);font-size:12px}.ok{color:#0a7a2f}.nao{color:#b3261e}
.rot{font-size:12px;fill:var(--tx)}.val{font-size:11px;font-weight:bold}
.legenda{display:flex;flex-wrap:wrap;gap:14px;margin:6px 0 8px;font-size:12px;color:var(--tx2)}.leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}th,td{border:1px solid var(--borda);padding:5px 7px;text-align:right}
th{background:#1e2226;color:#fff;font-weight:bold;text-align:center}td:first-child,th:first-child{text-align:left}tr.garg td{background:#fff6d5}
.pl{display:grid;grid-template-columns:200px 1fr 110px;gap:10px;align-items:center;margin:5px 0}.pb{background:#efeee9;border-radius:4px;height:14px}
.pb i{display:block;height:14px;border-radius:4px;background:#52514e}.pv{text-align:right;color:var(--tx2)}
.nota{font-size:12px;color:var(--tx2)}.rolar{overflow-x:auto;-webkit-overflow-scrolling:touch}table.simples td{text-align:left}ul{margin:6px 0 0 18px;padding:0}
@media (max-width:720px){main{padding:18px 16px 30px}.kpis{grid-template-columns:repeat(2,1fr)}.pl{grid-template-columns:110px 1fr 84px}}
@media print{main{padding:0}h2{break-after:avoid}table,svg,.kpis{break-inside:avoid}}
</style></head><body><main>
<h1>Estudo de linha — ${esc(L.nome)}</h1>
<p class="sub">Peça: ${esc(L.produto || "—")} · ${n(dias, 1)} dias de produção simulados (${n(r.horas_simuladas, 1)} h disponíveis) · gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
${ficticio ? '<p class="aviso"><b>Linha e números FICTÍCIOS</b>, só para demonstração.</p>' : ""}
<div class="kpis">
 <div class="kpi"><span>Peças boas por dia</span><b>${n(r.pecas_por_dia)}</b><span>demanda ${n(r.demanda_pecas_dia)} · ${atende == null ? "" : atende ? '<b class="ok" style="display:inline;font-size:12px">ATENDE</b>' : '<b class="nao" style="display:inline;font-size:12px">NÃO ATENDE</b>'} (${n(100 * r.pecas_por_dia / r.demanda_pecas_dia, 1)}%)</span></div>
 <div class="kpi"><span>Ritmo real (uma peça boa a cada)</span><b>${n(r.ciclo_real_s, 2)} s</b><span>takt pedido ${n(r.takt_s, 2)} s</span></div>
 <div class="kpi"><span>OEE da linha</span><b>${p(r.oee_linha.oee)}</b><span>ciclo ideal da linha ${n(r.oee_linha.ciclo_ideal_s, 2)} s</span></div>
 <div class="kpi"><span>Gargalo</span><b style="font-size:18px">${esc(g.nome)}</b><span>produzindo ou quebrada ${n(g.pct.produzindo + g.pct.quebrada, 1)}% do tempo</span></div>
</div>

<h2>Onde vai o tempo de cada estação</h2>
<div class="legenda">${legenda}</div>
${svg}
<p class="nota">Cada barra é 100% do tempo disponível da estação. Passe o mouse sobre um trecho para ver os minutos por dia. ◀ = gargalo.</p>

<h2>OEE por estação</h2>
<div class="rolar"><table><thead><tr><th>Estação</th>${ESTADOS.map(([, nome]) => `<th>${nome}</th>`).join("")}<th>Disponib.</th><th>Desempenho</th><th>Qualidade</th><th>OEE</th><th>Refugo (pç)</th></tr></thead><tbody>${linhasTab}</tbody></table></div>
<p class="nota">OEE = disponibilidade × desempenho × qualidade. Disponibilidade = tempo sem quebra nem troca de ferramenta. Desempenho = golpes feitos × ciclo ideal (ciclo mínimo da planilha) ÷ tempo operando — falta de peça, bloqueio e ciclo lento entram aqui. Qualidade = golpes bons ÷ golpes feitos.</p>

<h2>Onde o gargalo perde tempo — ${esc(g.nome)}</h2>
${perdas}
<p class="nota">Total de perdas no gargalo: ${n(totPerdas / dias, 0)} min por dia, de ${n(r.horas_simuladas * 60 / dias, 0)} min disponíveis.</p>

<h2>Outros números</h2>
<div class="rolar"><table class="simples"><tbody>
<tr><td>Peças boas no período</td><td>${n(r.pecas_boas)} (${n(r.pecas_por_hora)} por hora · ${n(r.golpes_saida / (r.horas_simuladas * 60), 2)} golpes por minuto, com todas as perdas)</td></tr>
<tr><td>Refugo</td><td>${n(r.refugo_pecas)} peças</td></tr>
<tr><td>Trocas de ferramenta</td><td>${n(r.trocas_ferramenta)} (${n(r.tempo_troca_ferramenta_s / 60)} min de troca com a linha parada)</td></tr>
<tr><td>Estoque médio dentro da linha</td><td>${n(r.estoque_medio_golpes, 1)} golpes · cada peça fica ${n(r.tempo_medio_na_linha_s, 1)} s na linha</td></tr>
${r.empilhadeiras ? `<tr><td>Empilhadeira(s)</td><td>${r.empilhadeiras.quantidade} · ${n(r.empilhadeiras.pedidos)} trocas · ocupada ${n(r.empilhadeiras.uso_pct, 1)}% do tempo · espera média ${n(r.empilhadeiras.espera_media_min, 1)} min (máx. ${n(r.empilhadeiras.espera_max_min, 1)} min)</td></tr>` : ""}
</tbody></table></div>

<h2>Dados usados (premissas)</h2>
<p>Demanda ${n(L.demanda_pecas_dia)} peças/dia · ${k} peça(s) por golpe · lote de ${n(L.lote_pecas)} peças · troca de ferramenta ${n(L.setup_min, 1)} min · turnos: ${turnos || "—"}.</p>
<div class="rolar"><table><thead><tr><th>Estação</th><th>Ciclo mín. / mais comum / máx. (s)</th><th>Em paralelo</th><th>Estoque depois</th><th>MTBF / MTTR (min)</th><th>Refugo</th></tr></thead><tbody>${premEst}</tbody></table></div>
<p>${premAb}</p>

<h2>Como foi calculado</h2>
<ul class="nota">
<li>Simulação de eventos discretos: o tempo avança de evento em evento (ciclo, falha, reparo, troca, empilhadeira), com os tempos sorteados dentro das faixas medidas. Semente ${esc(L.semente)}: a mesma semente repete o mesmo resultado.</li>
<li>O motor foi conferido com contas feitas à mão (14 casos) e com um segundo modelo independente, feito em SimPy (40 sementes cada, mesma média dentro do ruído do sorteio).</li>
<li>Limites: o reparo começa na hora (sem fila de manutentores); micro-paradas e troca de bobina não estão incluídas; o resultado vale tanto quanto os tempos de entrada.</li>
<li>Estudo técnico de tempo e fluxo. Não é laudo de engenharia e não calcula resistência de peças ou estruturas.</li>
</ul>
</main></body></html>`;
}
