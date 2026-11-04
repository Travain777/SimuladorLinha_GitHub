// Simulador de Linha — relatório da LINHA TRANSFER (etapas S2 e S3). Página HTML que abre sem internet
// (Ctrl+P → Salvar como PDF). Uso pelo rodar.mjs: gerarRelatorioSincronismo(arquivoDaLinha, ciclo, simulacao).
// Sem `simulacao` mostra só o sincronismo (S2); com ela, primeiro o resultado dos dias simulados (S3).
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n = (x, c = 0) => (x == null || Number.isNaN(x) ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }));

// cores por tipo de movimento (mesma paleta validada do relatório E3)
const TIPOS = {
  y: ["Eixo Y (fingers)", "var(--s1)"], x: ["Eixo X (barra)", "var(--s2)"], desce: ["Prensa: martelo descendo e subindo", "var(--s3)"],
  sobe: [null, "var(--s3)"], emb: ["Embreagem / freio", "#9a9893"], freio: [null, "#9a9893"], dest: ["Destacker", "var(--s4)"], conf: ["Confirmação do passo", "#c9c7c0"],
};

const PERDAS = [
  ["bom", "Peças boas (no ciclo ideal)"], ["troca_ferramenta", "Troca de ferramenta"], ["quebrada", "Quebras (param a linha toda)"],
  ["botoeira", "Botoeira da operadora (peça com defeito)"], ["faltou_blank", "Faltou blank (esperando a empilhadeira)"],
  ["ciclo_lento", "Ciclo acima do ideal (destacker, troca A↔B)"], ["enchimento", "Enchimento depois da troca (sem peça saindo)"], ["refugo", "Refugo (peças ruins)"],
];

function secaoSimulacao(arq, c, r) {
  const L = arq.linha, k = L.pecas_por_golpe || 1, dias = r.dias_simulados, dispDia = r.segundos_simulados / 60 / dias;
  const atende = r.pecas_por_dia >= L.demanda_pecas_dia;
  const perdas = PERDAS.map(([id, nome]) => ({ id, nome, min: r.perdas_min[id] / dias })).filter((p) => p.id === "bom" || p.min > 0.05);
  const maior = perdas.filter((p) => p.id !== "bom").sort((a, b) => b.min - a.min)[0];
  const maxMin = Math.max(...perdas.map((p) => p.min));
  const barras = perdas.map((p) => `<div class="pl"><span>${esc(p.nome)}</span><div class="pb" title="${esc(p.nome)}: ${n(p.min, 1)} min por dia (${n(100 * p.min / dispDia, 1)}%)"><i style="width:${(100 * p.min / maxMin).toFixed(1)}%;${p.id === "bom" ? "background:var(--s1)" : ""}"></i></div><span class="pv">${n(p.min, 1)} min · ${n(100 * p.min / dispDia, 1)}%</span></div>`).join("");
  const quebras = [...r.quebras].sort((a, b) => b.min - a.min).map((q) => `<tr><td>${esc(q.nome)}</td><td>${n(q.falhas)}</td><td>${n(q.min, 0)}</td><td>${n(q.min / dias, 1)}</td></tr>`).join("");
  const e = r.empilhadeira, o = r.operadora, o3 = r.oee;
  return `
<h2>Resultado da simulação — ${n(dias, 0)} dias de produção</h2>
<div class="kpis">
  <div class="kpi"><span>Peças boas por dia</span><b class="${atende ? "ok" : "nao"}">${n(r.pecas_por_dia, 0)}</b><span>demanda ${n(L.demanda_pecas_dia)} · ${atende ? "ATENDE" : "NÃO ATENDE"} (${n(100 * r.pecas_por_dia / L.demanda_pecas_dia, 1)}%)</span></div>
  <div class="kpi"><span>Ritmo real × takt</span><b class="${r.ritmo_real_s <= r.takt_s ? "ok" : "nao"}">${n(r.ritmo_real_s, 2)} × ${n(r.takt_s, 2)} s</b><span>uma peça boa a cada ${n(r.ritmo_real_s, 2)} s</span></div>
  <div class="kpi"><span>OEE da linha</span><b>${n(100 * o3.oee, 1)}%</b><span>disp. ${n(100 * o3.disponibilidade, 1)}% · desemp. ${n(100 * o3.desempenho, 1)}% · qual. ${n(100 * o3.qualidade, 2)}%</span></div>
  <div class="kpi"><span>Maior perda</span><b style="font-size:19px">${esc(maior ? maior.nome.split(" (")[0] : "—")}</b><span>${maior ? n(maior.min, 0) + " min por dia" : ""}</span></div>
</div>
<p class="nota">Sem nenhuma perda o ritmo do sincronismo daria ${n(dispDia * 60 / c.ciclo_s * k, 0)} peças por dia. A diferença está nas perdas abaixo (somam os ${n(dispDia, 0)} min disponíveis por dia).</p>
<h3>Para onde vai o tempo (minutos por dia)</h3>
${barras}
<div class="dois">
<div><h3>Quebras (qualquer uma para a linha toda)</h3>
<table><tr><th>Componente</th><th>Falhas</th><th>Min no total</th><th>Min por dia</th></tr>${quebras}</table></div>
<div><h3>Linha, operadora e abastecimento</h3>
<ul>
<li>Trocas de ferramenta: <b>${n(r.trocas_ferramenta)}</b> (${n(r.troca_min / dias, 0)} min/dia) + enchimento de ${r.posicoes} posições depois de cada uma.</li>
<li>Botoeira: <b>${n(r.botoeira.paradas)} paradas</b> (${n(r.botoeira.min / dias, 0)} min/dia). Peças ruins: ${n(r.pecas_ruins_saida)} · a operadora achou ${n(r.refugo_achado)} · passaram ${n(r.defeitos_passaram)}.</li>
<li>Operadora ocupada ${n(o.ocupacao_pct, 1)}% do tempo · na mesa chegou a haver ${n(o.mesa_max)} peças esperando (a mesa nunca para a linha).</li>
<li>Destacker atrasou ${n(r.destacker.atrasou_pct, 1)}% dos ciclos · ${n(r.destacker.trocas_magazine)} trocas de magazine A↔B · faltou blank ${n(r.destacker.faltou_blank_min / dias, 1)} min/dia.</li>
${e ? `<li>Empilhadeira: ${n(e.pedidos)} trocas de pilha · ocupada ${n(e.uso_pct, 1)}% do tempo · espera média ${n(e.espera_media_min, 1)} min.</li>` : ""}
</ul></div></div>`;
}

export function gerarRelatorioSincronismo(arq, c, sim = null) {
  const L = arq.linha, k = L.pecas_por_golpe || 1, disp = arq.calculado?.tempo_disponivel_dia_min || 0;
  const ficticio = /fict/i.test(L.nome || "");
  const pecasDiaIdeal = disp * 60 / c.ciclo_s * k;
  const atende = L.demanda_pecas_dia ? pecasDiaIdeal >= L.demanda_pecas_dia : null;

  // ---------------- carta de tempos (um ciclo = 360° do transfer)
  const recursos = [...new Set(c.carta.map((b) => b.recurso))];
  const W = 900, rot = 170, larg = W - rot - 16, alt = 18, passo = 26, topo = 46, H = topo + recursos.length * passo + 30;
  const xs = (s) => rot + s / c.ciclo_s * larg;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Carta de tempos de um ciclo da linha transfer">`;
  // passos (faixas de fundo) e graus do transfer
  c.passos.forEach((p, i) => {
    svg += `<rect x="${xs(p.inicio_s).toFixed(1)}" y="${topo - 6}" width="${(xs(p.fim_s) - xs(p.inicio_s)).toFixed(1)}" height="${recursos.length * passo + 6}" fill="${i % 2 ? "#f4f3ef" : "#fbfaf7"}"/>`;
    svg += `<text x="${((xs(p.inicio_s) + xs(p.fim_s)) / 2).toFixed(1)}" y="${topo - 12}" text-anchor="middle" class="eixo">passo ${p.n}</text>`;
  });
  for (let g = 0; g <= 360; g += 45) {
    const x = rot + g / 360 * larg;
    svg += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${topo - 6 + recursos.length * passo + 6}" y2="${topo + recursos.length * passo + 4}" stroke="#9a9893"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${g === 0 ? "start" : g === 360 ? "end" : "middle"}" class="eixo">${g}° · ${n(g / 360 * c.ciclo_s, 2)} s</text>`;
  }
  svg += `<text x="${rot}" y="14" class="eixo">ângulo do transfer (mestre) e tempo dentro do ciclo de ${n(c.ciclo_s, 3)} s</text>`;
  recursos.forEach((r, i) => {
    const y = topo + i * passo;
    const segura = (c.segura.id === "golpe" && c.segura.empatadas.some((id) => r === (arq.prensas.find((p) => p.id === id)?.nome || "").split(" — ")[0])) ||
      (c.segura.id === "x_volta" && r.startsWith("Eixo X")) || (c.segura.id === "destacker" && r === "Destacker");
    svg += `<text x="${rot - 10}" y="${y + alt / 2 + 4}" text-anchor="end" class="rot"${segura ? ' font-weight="bold"' : ""}>${esc(r)}${segura ? " ◀" : ""}</text>`;
    for (const b of c.carta.filter((b) => b.recurso === r)) {
      const x0 = xs(b.inicio_s), w = Math.max(1, xs(b.fim_s) - x0 - 2);
      svg += `<rect x="${x0.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${alt}" rx="4" fill="${TIPOS[b.tipo][1]}"><title>${esc(r)} — ${esc(b.rotulo)}: ${n(b.inicio_s, 3)} s → ${n(b.fim_s, 3)} s (${n(b.dur_s, 3)} s)</title></rect>`;
      if (w > 74 && b.tipo !== "conf") svg += `<text x="${(x0 + w / 2).toFixed(1)}" y="${y + alt / 2 + 4}" text-anchor="middle" class="val" fill="${b.tipo === "dest" || b.tipo === "emb" || b.tipo === "freio" ? "#0b0b0b" : "#fff"}">${esc(b.rotulo)}</text>`;
    }
  });
  svg += `</svg>`;
  const legenda = Object.values(TIPOS).filter(([nome]) => nome).map(([nome, cor]) => `<span class="leg"><i style="background:${cor}"></i>${nome}</span>`).join("");

  const linhasPassos = c.passos.map((p) => `<tr><td>${p.n}. ${esc(p.nome)}</td><td>${n(p.mov_s, 3)}</td><td>${n(p.confirmacao_s, 3)}</td><td><b>${n(p.tempo_s, 3)}</b></td><td>${n(p.grau_inicio, 0)}° → ${n(p.grau_fim, 0)}°</td><td>${n(p.pct, 1)}%</td></tr>`).join("");
  const linhasRamos = c.ramos.map((r) => `<tr${r.id === c.segura.id ? ' class="garg"' : ""}><td>${esc(r.nome)}${r.id === c.segura.id ? " <b>(segura a linha)</b>" : ""}</td><td>${n(r.tempo_s, 3)}</td><td>${r.folga_s ? n(r.folga_s, 3) + " s" : "—"}</td></tr>`).join("");
  const linhasPrensas = c.prensas.map((p) => { const cfg = arq.prensas.find((x) => x.id === p.id);
    return `<tr${!p.folga_s ? ' class="garg"' : ""}><td>${esc(p.nome)}</td><td>${n(cfg.spm_volante, 1)}</td><td>${n(cfg.embreagem_s, 2)}</td><td>${n(p.volta_s, 3)}</td><td>${n(cfg.freio_s, 2)}</td><td><b>${n(p.golpe_s, 3)}</b></td><td>${p.folga_s ? n(p.folga_s, 3) + " s" : "a mais lenta"}</td></tr>`; }).join("");
  const X = arq.transfer, dv = c.destacker_variacao;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sincronismo — ${esc(L.nome)}</title>
<style>
:root{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--tx:#0b0b0b;--tx2:#52514e;--borda:#dddcd6;--fundo:#fcfcfb;--marca:#f2b705}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--tx);font:14px/1.45 Arial,Helvetica,sans-serif}
main{max-width:1000px;margin:0 auto;padding:28px 24px 40px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px;padding-bottom:4px;border-bottom:3px solid var(--marca)}
.sub{color:var(--tx2);margin:0}.aviso{background:#fff6d5;border-left:5px solid var(--marca);padding:8px 12px;margin:14px 0;font-size:13px}
.selo{display:inline-block;background:var(--marca);color:#111;font-size:12px;font-weight:bold;border-radius:4px;padding:1px 7px;vertical-align:4px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.kpi{border:1px solid var(--borda);border-radius:10px;padding:12px 14px;background:#fff}.kpi b{display:block;font-size:26px;margin:2px 0}
.kpi span{color:var(--tx2);font-size:12px}.ok{color:#0a7a2f}.nao{color:#b3261e}
.destaque{border:2px solid var(--marca);border-radius:10px;background:#fffdf3;padding:12px 16px;margin-top:14px}
.rot{font-size:12px;fill:var(--tx)}.val{font-size:11px;font-weight:bold}.eixo{font-size:11px;fill:var(--tx2)}
.legenda{display:flex;flex-wrap:wrap;gap:14px;margin:6px 0 8px;font-size:12px;color:var(--tx2)}.leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}th,td{border:1px solid var(--borda);padding:5px 7px;text-align:right}
th{background:#1e2226;color:#fff;font-weight:bold;text-align:center}td:first-child,th:first-child{text-align:left}tr.garg td{background:#fff6d5}
.nota{font-size:12px;color:var(--tx2)}h3{font-size:14px;margin:18px 0 8px}.pl{display:grid;grid-template-columns:300px 1fr 150px;gap:10px;align-items:center;margin:5px 0;font-size:13px}.pb{background:#efeee9;border-radius:4px;height:14px}.pb i{display:block;height:14px;border-radius:4px;background:#52514e}.pv{text-align:right;color:var(--tx2)}.rolar{overflow-x:auto;-webkit-overflow-scrolling:touch}ul{margin:6px 0 0 18px;padding:0}
.dois{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:760px){main{padding:18px 16px 30px}.pl{grid-template-columns:120px 1fr 96px;font-size:12px}.kpis{grid-template-columns:repeat(2,1fr)}.dois{grid-template-columns:1fr}.rolar svg{min-width:760px}}
@media print{main{padding:0}h2{break-after:avoid}table,svg,.kpis{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(L.nome.replace(/\s*\(FICT[ÍI]CIA\)/i, ""))} ${ficticio ? '<span class="selo">FICTÍCIA</span>' : ""}</h1>
<p class="sub">${esc(L.produto || "")} · sincronismo do transfer (o CLP do transfer é o mestre) · ${arq.prensas.length} prensas · ${arq.interpress?.quantidade || 0} interpress</p>
${ficticio ? '<div class="aviso">Linha e números fictícios, só para demonstração.</div>' : ""}
${sim ? secaoSimulacao(arq, c, sim) + '<h2>Sincronismo — o ciclo sem perdas</h2>' : ""}
<div class="kpis">
  <div class="kpi"><span>Ciclo da linha (360° do transfer)</span><b>${n(c.ciclo_s, 3)} s</b><span>calculado pelos movimentos</span></div>
  <div class="kpi"><span>Golpes por minuto</span><b>${n(c.golpes_por_minuto, 2)}</b><span>${n(c.pecas_por_hora, 0)} peças por hora</span></div>
  <div class="kpi"><span>Peças por dia sem nenhuma perda</span><b class="${atende ? "ok" : "nao"}">${n(pecasDiaIdeal, 0)}</b><span>demanda ${n(L.demanda_pecas_dia)} · ${atende ? "o ritmo dá" : "o ritmo não dá"} (sem perdas)</span></div>
  <div class="kpi"><span>Ciclo × takt</span><b class="${c.takt_s && c.ciclo_s / k <= c.takt_s ? "ok" : "nao"}">${n(c.ciclo_s / k, 2)} × ${n(c.takt_s, 2)} s</b><span>takt = tempo disponível ÷ demanda</span></div>
</div>
<div class="destaque"><b>Quem segura a linha: ${esc(c.segura.nome)} (${n(c.segura.tempo_s, 3)} s).</b><br>
Se melhorar até o próximo limite — <b>${esc(c.proximo.nome)}</b>, ${n(c.proximo.tempo_s, 3)} s — o ciclo cai ${n(c.ganho_se_igualar_s, 3)} s,
para ${n(c.ciclo_se_igualar_s, 3)} s: <b>${n(c.gpm_se_igualar, 2)} golpes por minuto</b> (+${n(c.gpm_se_igualar - c.golpes_por_minuto, 2)}).</div>
<p class="nota">Peças por dia sem perda = ${n(disp, 0)} min disponíveis × 60 ÷ ${n(c.ciclo_s, 3)} s. Este é o limite do sincronismo; o resultado com as perdas está acima.</p>

<h2>Carta de tempos de um ciclo</h2>
<div class="legenda">${legenda}</div>
<div class="rolar">${svg}</div>
<p class="nota">O passo 4 é feito em paralelo: X volta para zero, as ${arq.prensas.length} prensas descem e sobem juntas e o destacker põe o próximo blank. O ciclo seguinte só começa quando os três terminam. Passe o mouse nas barras para ver os tempos.</p>

<h2>Os passos do ciclo</h2>
<div class="rolar"><table><tr><th>Passo</th><th>Movimento (s)</th><th>Confirmação (s)</th><th>Total (s)</th><th>Ângulo do transfer</th><th>% do ciclo</th></tr>${linhasPassos}
<tr><td><b>Ciclo</b></td><td></td><td>${n(c.confirmacoes_s, 3)}</td><td><b>${n(c.ciclo_s, 3)}</b></td><td>0° → 360°</td><td>100%</td></tr></table></div>

<div class="dois">
<div><h2>Passo 4: quem chega por último</h2>
<table><tr><th>Ramo (em paralelo)</th><th>Tempo (s)</th><th>Folga</th></tr>${linhasRamos}</table>
<p class="nota">Folga = quanto o ramo pode atrasar sem mexer no ciclo.</p></div>
<div><h2>Variação do destacker</h2>
<p>A pega do blank varia entre ${n(arq.destacker.pega_s.min, 2)} s e ${n(arq.destacker.pega_s.max, 2)} s (mais comum ${n(arq.destacker.pega_s.mais_comum, 2)} s).
Em <b>${n(dv.atrasa_pct, 1)}% dos ciclos</b> ela passa de ${n(dv.limite_s, 3)} s e atrasa a linha.</p>
<ul><li>Ciclo médio contando essa variação: <b>${n(dv.ciclo_medio_s, 3)} s</b> (${n(dv.gpm_medio, 2)} golpes/min)</li>
<li>Pior caso (pega no máximo): ${n(dv.ciclo_pior_s, 3)} s</li></ul></div>
</div>

<h2>Prensas</h2>
<div class="rolar"><table><tr><th>Prensa</th><th>Golpes/min do volante</th><th>Embreagem (s)</th><th>Volta 0°→360° (s)</th><th>Freio (s)</th><th>Golpe (s)</th><th>Folga</th></tr>${linhasPrensas}</table></div>

<h2>Eixos do transfer</h2>
<div class="rolar"><table><tr><th>Eixo</th><th>Curso (mm)</th><th>Velocidade (mm/s)</th><th>Aceleração (mm/s²)</th><th>Perfil</th><th>Tempo de um movimento (s)</th></tr>
<tr><td>X (barra, cremalheira)</td><td>${n(X.eixo_x.curso_mm)}</td><td>${n(X.eixo_x.vel_mm_s)}</td><td>${n(X.eixo_x.acel_mm_s2)}</td><td>${c.eixo_x.tipo}</td><td>${n(c.eixo_x.tempo_s, 3)}</td></tr>
<tr><td>Y (fingers, todos os interpress)</td><td>${n(X.eixo_y.curso_mm)}</td><td>${n(X.eixo_y.vel_mm_s)}</td><td>${n(X.eixo_y.acel_mm_s2)}</td><td>${c.eixo_y.tipo}</td><td>${n(c.eixo_y.tempo_s, 3)}</td></tr></table></div>
<p class="nota">Enchimento: ${c.enchimento.posicoes} posições (interpress + prensas). Depois de uma troca de ferramenta, a primeira peça chega ao fim depois de ${c.enchimento.ciclos} ciclos (≈ ${n(c.enchimento.tempo_s, 0)} s).</p>

<h2>Como foi calculado</h2>
<ul>
<li>Movimento de um eixo (servo): acelera, anda na velocidade máxima e freia. Tempo = curso ÷ velocidade + velocidade ÷ aceleração. Se o curso for curto demais para chegar na velocidade, tempo = 2 × √(curso ÷ aceleração).</li>
<li>Golpe da prensa mecânica = embreagem + uma volta do volante (60 ÷ golpes por minuto) + freio. As prensas golpeiam juntas; vale a mais lenta.</li>
<li>Ciclo = (Y avança + conf.) + (X avança + conf.) + (Y recua + conf.) + (o maior entre X volta, golpe e destacker + conf.).</li>
<li>Variação do destacker: conta exata da distribuição triangular (mínimo, mais comum, máximo).</li>
<li>O motor de sincronismo foi conferido com 31 contas feitas à mão e a simulação da linha com 18 (TESTAR_MOTOR.bat), e com um segundo modelo independente em SimPy, 40 sementes (CONFERIR_SIMPY.bat).</li>
<li>Simulação: ciclo a ciclo, só o tempo disponível. Falhas pelo tempo trabalhado (MTBF) com reparo sorteado (MTTR); qualquer falha para a linha toda. O lote acaba → a linha esvazia, troca e enche de novo. Peça ruim segue até a mesa; achada pela operadora → botoeira → a linha para.</li>
</ul>
<p class="nota">Simulador de Linha · etapas S2 (sincronismo) e S3 (simulação) · gerado em ${new Date().toLocaleString("pt-BR")}</p>
</main></body></html>`;
}
