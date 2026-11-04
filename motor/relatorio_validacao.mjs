// Simulador de Linha — relatório da VALIDAÇÃO com a linha real (etapa E6). Página HTML única, sem internet.
// Fica na pasta privado/: tem dados da empresa. NÃO publicar. (Com origem.ficticio = exemplo gerado por simulação, para a demonstração.)
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const n = (x, d = 0) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const sinal = (x, d = 1) => (x == null ? "—" : (x > 0 ? "+" : "") + n(x, d) + "%");
const selo = (ok, txt) => `<span class="selo ${ok ? "ok" : "nao"}">${ok ? "✓" : "✗"} ${esc(txt)}</span>`;
const NOMES = { quebra: "Quebra / manutenção", botoeira: "Botoeira (peça com defeito)", faltou_blank: "Faltou blank", troca: "Troca de ferramenta", outra: "Outras paradas" };

export function gerarRelatorioValidacao(v, g, origem = {}) {
  const partes = [];
  if (v) {
    const R = v.reproducao, P = v.previsao;
    const diag = [];
    if (!R.dentro_meta) diag.push(R.dif_pct > 0
      ? "O simulador faz MAIS peças que a linha com as mesmas paradas: o ciclo real é mais lento que o do modelo. Confira no formulário da linha a prensa mais lenta (golpes/min, embreagem, freio), os eixos X e Y (velocidade, aceleração) e a confirmação entre passos."
      : "O simulador faz MENOS peças que a linha com as mesmas paradas: o ciclo do modelo está mais lento que o real. Confira golpes/min das prensas, eixos e o tempo de pega do destacker.");
    else diag.push("Com as mesmas paradas, o simulador bate com a linha: o ciclo e o ritmo do modelo estão certos.");
    if (R.dentro_meta && !P.dentro_meta) diag.push("A reprodução bate, mas a previsão não: o modelo de perdas é que precisa de ajuste — MTBF/MTTR, refugo, lote/troca ou botoeira (veja a tabela de perdas por motivo).");
    if (R.dentro_meta && P.dentro_meta) diag.push("A previsão também ficou dentro da meta: o modelo de falhas e perdas representa bem estes turnos.");
    partes.push(`
<section><h2>1. Reprodução — os mesmos turnos, com as mesmas paradas</h2>
<p class="explica">Cada turno real foi simulado com as paradas e trocas que aconteceram. Nada de falha sorteada: o que sobra de diferença é do ciclo do modelo.</p>
<div class="cartoes">
  <div class="cartao"><small>Peças reais (boas + refugo)</small><b>${n(R.real)}</b></div>
  <div class="cartao"><small>Simulador</small><b>${n(R.sim)}</b></div>
  <div class="cartao ${R.dentro_meta ? "bom" : "ruim"}"><small>Diferença (meta ±${v.meta_pct}%)</small><b>${sinal(R.dif_pct, 2)}</b>${selo(R.dentro_meta, R.dentro_meta ? "dentro da meta" : "fora da meta")}</div>
  <div class="cartao"><small>Turnos dentro de ±${v.meta_pct}%</small><b>${R.turnos_dentro} de ${R.turnos.length}</b></div>
  <div class="cartao"><small>Ciclo real estimado</small><b>${n(R.ciclo_real_estimado_s, 3)} s</b><small>modelo ${n(v.ciclo_medio_modelo_s, 3)} s (com o destacker)</small></div>
</div>
<table><thead><tr><th>Turno</th><th>Data</th><th>Trabalhado</th><th>Parado</th><th>Trocas</th><th>Real</th><th>Simulador</th><th>Diferença</th><th>Ciclo real estimado</th></tr></thead><tbody>
${R.turnos.map((t) => `<tr><td>${esc(t.id)} · ${esc(t.turno)}</td><td>${esc(t.data)}</td><td>${n(t.minutos)} min</td><td>${n(t.parado_min, 1)} min</td><td>${t.trocas}</td><td>${n(t.real)}</td><td>${n(t.sim)}</td><td class="${Math.abs(t.dif_pct) <= v.meta_pct ? "" : "fora"}">${sinal(t.dif_pct, 2)}</td><td>${t.ciclo_real_s ? n(t.ciclo_real_s, 3) + " s" : "—"}</td></tr>`).join("")}
</tbody></table>
<p class="nota">Ciclo do modelo: ${n(v.ciclo_modelo_s, 3)} s (${n(v.gpm_modelo, 2)} golpes/min); com a variação do destacker, ${n(v.ciclo_medio_modelo_s, 3)} s em média.
 Ciclo real estimado = ciclo do modelo × peças do simulador ÷ peças reais (as paradas são as mesmas, então a diferença vem do ciclo).
Troca apontada ${v.troca_inclui_esvaziar_encher === "sim" ? "da última à primeira peça boa: o simulador descontou esvaziar + encher (" + n(v.esvaziar_encher_min, 1) + " min por troca)." : "só com a linha parada (o simulador esvazia e enche por conta própria)."}</p>
</section>
<section><h2>2. Previsão — o modelo de falhas e perdas (${P.sementes} sementes)</h2>
<p class="explica">O simulador rodou o mesmo tempo dos turnos reais, um atrás do outro, sorteando falhas pelo MTBF/MTTR, refugo e botoeira do arquivo da linha. As peças boas reais têm que cair dentro da faixa simulada.</p>
<div class="cartoes">
  <div class="cartao"><small>Peças boas reais</small><b>${n(P.real)}</b></div>
  <div class="cartao"><small>Simulador (média)</small><b>${n(P.sim_media)}</b><small>faixa ${n(P.sim_p5)} a ${n(P.sim_p95)} (90% das sementes)</small></div>
  <div class="cartao ${P.dentro_meta ? "bom" : "ruim"}"><small>Diferença da média (meta ±${v.meta_pct}%)</small><b>${sinal(P.dif_pct, 2)}</b>${selo(P.dentro_meta, P.dentro_meta ? "dentro da meta" : "fora da meta")}</div>
  <div class="cartao"><small>Turnos dentro da faixa do turno</small><b>${P.turnos_dentro_faixa} de ${P.turnos.length}</b></div>
</div>
<h3>Perdas por turno (média, em minutos)</h3>
<table><thead><tr><th>Motivo</th><th>Real</th><th>Simulador</th><th>Diferença</th></tr></thead><tbody>
${P.perdas_por_turno_min.filter((p) => p.real > 0.05 || p.sim > 0.05).map((p) => `<tr><td>${esc(NOMES[p.motivo] || p.motivo)}</td><td>${n(p.real, 1)}</td><td>${n(p.sim, 1)}</td><td>${n(p.sim - p.real, 1)} min</td></tr>`).join("")}
</tbody></table>
<details><summary>Turno a turno</summary><table><thead><tr><th>Turno</th><th>Peças boas reais</th><th>Faixa simulada (P5–P95)</th><th>Média simulada</th></tr></thead><tbody>
${P.turnos.map((t) => `<tr><td>${esc(t.id)}</td><td>${n(t.real)}</td><td class="${t.real >= t.p5 && t.real <= t.p95 ? "" : "fora"}">${n(t.p5)} a ${n(t.p95)}</td><td>${n(t.media)}</td></tr>`).join("")}
</tbody></table></details>
</section>
<section><h2>O que isto quer dizer</h2><ul>${diag.map((d) => "<li>" + esc(d) + "</li>").join("")}</ul>
${v.avisos.length ? "<h3>Avisos</h3><ul>" + v.avisos.map((a) => "<li>" + esc(a) + "</li>").join("") + "</ul>" : ""}
${v.turnos_usados < 10 ? "<p class='nota'>Só " + v.turnos_usados + " turno(s) na conta: com 10 ou mais a comparação fica bem mais firme.</p>" : ""}</section>`);
  }
  if (g) {
    const C = g.ciclo, Rg = g.reproducao;
    partes.push(`
<section><h2>${v ? "3" : "1"}. Gravação do CLP (só leitura) — ${n(g.duracao_min, 1)} min</h2>
<p class="explica">O que a ponte gravou do CLP em ${esc(g.inicio)}. As paradas lidas do CLP foram reproduzidas no simulador, e o ciclo foi medido golpe a golpe.</p>
<div class="cartoes">
  <div class="cartao"><small>Ciclo medido (golpe a golpe)</small><b>${n(C.medio_s, 3)} s</b><small>mediana ${n(C.mediana_s, 3)} · 95% até ${n(C.p95_s, 3)} · ${n(C.golpes_medidos)} golpes</small></div>
  <div class="cartao ${Math.abs(C.dif_pct ?? 99) <= g.meta_pct ? "bom" : "ruim"}"><small>Modelo (com destacker)</small><b>${n(C.modelo_medio_s, 3)} s</b><small>diferença ${sinal(C.dif_pct, 2)}</small></div>
  <div class="cartao"><small>${esc(g.comparado)} — CLP</small><b>${n(Rg.real)}</b></div>
  <div class="cartao ${Rg.dentro_meta ? "bom" : "ruim"}"><small>Simulador com as mesmas paradas</small><b>${n(Rg.sim)}</b><small>${sinal(Rg.dif_pct, 2)}</small>${selo(Rg.dentro_meta, Rg.dentro_meta ? "dentro da meta" : "fora da meta")}</div>
</div>
<table><thead><tr><th>Situação lida do CLP</th><th>Minutos</th></tr></thead><tbody>
${Object.entries(g.tempo_situacao_min).sort((a, b) => b[1] - a[1]).map(([s, m]) => `<tr><td>${esc(s.replace("_", " "))}</td><td>${n(m, 1)}</td></tr>`).join("")}
</tbody></table>
<p class="nota">${g.paradas.length} parada(s) e ${g.trocas.length} troca(s) reconhecidas. ${g.leituras.toLocaleString("pt-BR")} leituras.</p>
</section>`);
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Validação com a linha real</title><style>
:root{--fundo:#f4f5f6;--papel:#fff;--tinta:#1d2125;--suave:#5b636b;--linha:#dfe2e5;--ok:#1a7f4b;--ruim:#b42318;--azul:#2a78d6}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--tinta);font:15px/1.45 system-ui,Segoe UI,Arial,sans-serif}
header{background:#22272c;color:#fff;padding:18px 20px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#c9ced3;font-size:13px}
.privado{background:#b42318;color:#fff;padding:8px 20px;font-weight:600;font-size:13px}
main{max-width:1100px;margin:0 auto;padding:16px}section{background:var(--papel);border:1px solid var(--linha);border-radius:10px;padding:16px 18px;margin:0 0 16px}
h2{font-size:17px;margin:0 0 4px}h3{font-size:15px;margin:16px 0 6px}.explica,.nota{color:var(--suave);font-size:13px;margin:4px 0 12px}
.cartoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:8px 0 14px}
.cartao{border:1px solid var(--linha);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}.cartao b{font-size:22px}.cartao small{color:var(--suave);font-size:12px}
.cartao.bom{border-color:var(--ok);background:#eef8f2}.cartao.ruim{border-color:var(--ruim);background:#fdf0ee}
.selo{font-size:12px;font-weight:600;margin-top:4px}.selo.ok{color:var(--ok)}.selo.nao{color:var(--ruim)}
table{width:100%;border-collapse:collapse;font-size:13px;display:block;overflow-x:auto}th,td{padding:6px 8px;border-bottom:1px solid var(--linha);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{color:var(--suave);font-weight:600}td.fora{color:var(--ruim);font-weight:600}
details summary{cursor:pointer;color:var(--azul);margin:8px 0}ul{margin:6px 0;padding-left:20px}
</style></head><body>
${origem.ficticio ? '<div class="privado" style="background:#1b5e9a">EXEMPLO FICTÍCIO — os "turnos reais" foram gerados por uma linha simulada, só para mostrar como a validação funciona.</div>' : '<div class="privado">PRIVADO — dados da linha real. Só para validação neste PC. Não publicar, não usar em vídeo nem em demonstração.</div>'}
<header><h1>Validação com a linha real</h1><p>${esc(v?.linha || g?.linha)} · ${esc(origem.apontamento || "")} ${origem.gravacao ? "· " + esc(origem.gravacao) : ""} · gerado em ${new Date().toLocaleString("pt-BR")} · meta: até ±${(v || g).meta_pct}% em peças</p></header>
<main>${partes.join("")}</main></body></html>`;
}
