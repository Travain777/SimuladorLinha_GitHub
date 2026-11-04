// Simulador de Linha — cenários A × B (etapa E5, 04/11/2026).
// A = o arquivo da linha como está (só leitura). B = cópia que você altera aqui. Cada mudança refaz a simulação de B
// (em segundo plano, cenarios_worker.js) com as MESMAS sementes do A, e o resultado aparece lado a lado.
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => (x == null || Number.isNaN(x) ? "—" : Number(x).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let A = null, B = null, caminho = "", resA = null, resB = null, grupos = [], wA = null, wB = null, idA = 0, idB = 0, espera = null;

// ---------------------------------------------------------------- caminhos ("prensas.2.spm_volante")
const partes = (c) => c.split(".").map((p) => (/^\d+$/.test(p) ? +p : p));
const pegar = (o, c) => partes(c).reduce((x, p) => (x == null ? undefined : x[p]), o);
function por(o, c, v) { const ps = partes(c); let x = o; for (let i = 0; i < ps.length - 1; i++) { if (x[ps[i]] == null || typeof x[ps[i]] !== "object") x[ps[i]] = {}; x = x[ps[i]]; } x[ps[ps.length - 1]] = v; }
const mostrar = (v) => (v == null ? "" : typeof v === "number" ? String(+v.toFixed(6)).replace(".", ",") : String(v));
function ler(txt, campo) {
  const t = String(txt).trim();
  if (campo.texto) return t;
  if (t === "") return null;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : t;
}

// ---------------------------------------------------------------- todos os dados, em grupos (A e B)
function montarParametros(a) {
  const G = [], g = (titulo, itens) => G.push({ titulo, itens }), n = (c, r, o = {}) => ({ c, r, ...o });
  const F = (base) => [n(base + ".falhas.mtbf_min", "Tempo médio entre falhas — MTBF (min)", { falha: base }), n(base + ".falhas.mttr_min", "Tempo médio de reparo — MTTR (min)", { falha: base })];
  const TRI = (base, r, u) => [["min", "mínimo"], ["mais_comum", "mais comum"], ["max", "máximo"]].map(([k, t]) => n(base + "." + k, r + " — " + t + " (" + u + ")"));
  g("Linha e produção", [n("linha.demanda_pecas_dia", "Demanda por dia (peças)"), n("linha.pecas_por_golpe", "Peças por golpe"), n("linha.lote_pecas", "Tamanho do lote (peças; vazio = sem troca)"),
    n("linha.setup_min", "Troca de ferramenta (min)"), n("linha.dias_simulados", "Dias a simular")]);
  a.turnos.forEach((t, i) => g("Turno " + (i + 1) + " — " + t.nome, [n(`turnos.${i}.inicio`, "Início (HH:MM)", { texto: true }), n(`turnos.${i}.fim`, "Fim (HH:MM)", { texto: true }), n(`turnos.${i}.pausa_min`, "Pausas (min)")]));
  if (a.formato === "simulador-linha/2") {
    g("Transfer (CLP mestre)", [n("transfer.eixo_x.curso_mm", "Eixo X — curso / passo (mm)"), n("transfer.eixo_x.vel_mm_s", "Eixo X — velocidade (mm/s)"), n("transfer.eixo_x.acel_mm_s2", "Eixo X — aceleração (mm/s²)"),
      n("transfer.eixo_y.curso_mm", "Eixo Y — curso (mm)"), n("transfer.eixo_y.vel_mm_s", "Eixo Y — velocidade (mm/s)"), n("transfer.eixo_y.acel_mm_s2", "Eixo Y — aceleração (mm/s²)"),
      n("transfer.confirmacao_s", "Confirmação entre passos (s)"), ...F("transfer")]);
    g("Interpress", [n("interpress.quantidade", "Quantidade de interpress")]);
    a.prensas.forEach((p, i) => g(p.nome, [n(`prensas.${i}.spm_volante`, "Golpes por minuto do volante"), n(`prensas.${i}.embreagem_s`, "Embreagem (s)"), n(`prensas.${i}.freio_s`, "Freio (s)"),
      n(`prensas.${i}.curso_mm`, "Curso do martelo (mm)"), n(`prensas.${i}.capacidade_t`, "Capacidade (t)"), ...F(`prensas.${i}`), n(`prensas.${i}.refugo_pct`, "Refugo (%)")]));
    g("Destacker", [...TRI("destacker.pega_s", "Pega do blank", "s"), n("destacker.troca_magazine_s", "Troca de magazine A ↔ B (s)"), ...F("destacker")]);
    g("Abastecimento (empilhadeira)", [n("abastecimento.empilhadeiras", "Empilhadeiras"), n("abastecimento.entrada.pecas_por_pilha", "Peças por pilha"), n("abastecimento.entrada.magazines", "Magazines"),
      n("abastecimento.entrada.chegada_empilhadeira_min", "Empilhadeira chegar (min)"), n("abastecimento.entrada.troca_min", "Trocar a pilha (min)")]);
    g("Saída — esteira, mesa e operadora", [n("saida.esteira_s", "Tempo na esteira (s)"), ...TRI("saida.operadora.tempo_peca_s", "Operadora por peça", "s"),
      n("saida.operadora.acha_defeito_pct", "Defeitos que a operadora acha (%)"), ...TRI("saida.operadora.parada_botoeira_min", "Parada pela botoeira", "min")]);
  } else {
    a.estacoes.forEach((e, i) => g(e.nome, [...TRI(`estacoes.${i}.ciclo_s`, "Ciclo", "s"), n(`estacoes.${i}.paralelas`, "Máquinas em paralelo"), n(`estacoes.${i}.estoque_depois`, "Estoque depois (peças)"),
      ...F(`estacoes.${i}`), n(`estacoes.${i}.refugo_pct`, "Refugo (%)")]));
    const ab = [n("abastecimento.empilhadeiras", "Empilhadeiras")];
    if (a.abastecimento?.entrada) ab.push(n("abastecimento.entrada.pecas_por_pilha", "Peças por pilha"), n("abastecimento.entrada.magazines", "Magazines"), n("abastecimento.entrada.chegada_empilhadeira_min", "Empilhadeira chegar — entrada (min)"), n("abastecimento.entrada.troca_min", "Trocar a pilha (min)"));
    if (a.abastecimento?.saida) ab.push(n("abastecimento.saida.pecas_por_rack", "Peças por rack"), n("abastecimento.saida.posicoes", "Posições de rack"), n("abastecimento.saida.chegada_empilhadeira_min", "Empilhadeira chegar — saída (min)"), n("abastecimento.saida.troca_min", "Trocar o rack (min)"));
    g("Abastecimento (empilhadeira)", ab);
  }
  return G;
}
function desenharParametros() {
  const box = $("grupos"); box.innerHTML = "";
  grupos.forEach((gr, gi) => {
    const d = document.createElement("details"); if (gi === 0) d.open = true; d.dataset.g = gi;
    d.innerHTML = "<summary><span></span><span class='mud' hidden></span></summary><table class='par'><thead><tr><th>Dado</th><th style='text-align:right'>A</th><th>B</th></tr></thead><tbody></tbody></table>";
    d.querySelector("summary span").textContent = gr.titulo;
    for (const it of gr.itens) {
      const tr = document.createElement("tr"); tr.dataset.c = it.c;
      tr.innerHTML = "<td></td><td class='a'></td><td class='b'><input></td>";
      tr.children[0].textContent = it.r; tr.children[1].textContent = mostrar(pegar(A, it.c)) || "—";
      const inp = tr.querySelector("input"); inp.value = mostrar(pegar(B, it.c)); inp.setAttribute("aria-label", gr.titulo + " — " + it.r + " no cenário B");
      inp.inputMode = it.texto ? "text" : "decimal";
      inp.oninput = () => mudar(it, inp.value);
      d.querySelector("tbody").appendChild(tr);
    }
    box.appendChild(d);
  });
}
function mudar(it, txt) {
  const v = ler(txt, it);
  if (it.falha) {                                       // MTBF e MTTR vazios nos dois = sem falhas
    const f = pegar(B, it.falha + ".falhas") || {}; f[it.c.split(".").pop()] = v;
    por(B, it.falha + ".falhas", f.mtbf_min == null && f.mttr_min == null ? null : f);
  } else por(B, it.c, v);
  marcarMudancas(); pedirB();
}
const igual = (x, y) => (x ?? null) === (y ?? null) || (typeof x === "number" && typeof y === "number" && Math.abs(x - y) < 1e-12);
function mudancas() {
  const lista = [];
  grupos.forEach((gr, gi) => gr.itens.forEach((it) => { const a = pegar(A, it.c), b = pegar(B, it.c); if (!igual(a, b)) lista.push({ gi, gr: gr.titulo, it, a, b }); }));
  return lista;
}
function marcarMudancas() {
  const m = mudancas(), porGrupo = {};
  document.querySelectorAll(".par tr[data-c]").forEach((tr) => tr.classList.toggle("mudou", m.some((x) => x.it.c === tr.dataset.c)));
  for (const x of m) porGrupo[x.gi] = (porGrupo[x.gi] || 0) + 1;
  document.querySelectorAll("#grupos details").forEach((d) => { const s = d.querySelector(".mud"), k = porGrupo[d.dataset.g]; s.hidden = !k; s.textContent = k ? k + " mudança" + (k > 1 ? "s" : "") : ""; });
  const ul = $("mudancas"); ul.innerHTML = "";
  if (!m.length) { ul.innerHTML = "<li>nada ainda — B igual ao A</li>"; return; }
  for (const x of m) { const li = document.createElement("li"); li.textContent = x.gr + " · " + x.it.r + ": " + (mostrar(x.a) || "vazio") + " → " + (mostrar(x.b) || "vazio"); ul.appendChild(li); }
}

// ---------------------------------------------------------------- simulação em segundo plano (mesmas sementes em A e B)
const sementes = () => +$("sementes").value;
function rodar(qual) {
  const id = qual === "A" ? ++idA : ++idB, w = new Worker("cenarios_worker.js", { type: "module" }), alvo = $("calc" + qual);
  if (qual === "A") { wA?.terminate(); wA = w; } else { wB?.terminate(); wB = w; }
  alvo.innerHTML = "Calculando " + qual + "… <progress max='1' value='0'></progress>";
  w.onmessage = (e) => {
    const d = e.data; if ((qual === "A" ? idA : idB) !== id) return;
    if (d.progresso != null) { const p = alvo.querySelector("progress"); if (p) p.value = d.progresso; return; }
    alvo.textContent = ""; w.terminate();
    if (d.erro) { if (qual === "B") { resB = null; mostrarErros(d.erro); } else mostrarErros(d.erro); desenharResultado(); return; }
    mostrarErros(null);
    if (qual === "A") resA = d.resultado; else resB = d.resultado;
    desenharResultado();
  };
  w.onerror = (e) => { alvo.textContent = "Erro no cálculo: " + (e.message || "veja o console"); };
  w.postMessage({ id, arq: qual === "A" ? A : B, sementes: sementes() });
}
function pedirB() {
  clearTimeout(espera);
  if (!mudancas().length) { wB?.terminate(); resB = null; $("calcB").textContent = ""; mostrarErros(null); desenharResultado(); return; }
  $("calcB").textContent = "Esperando você terminar de digitar…";
  espera = setTimeout(() => rodar("B"), 450);
}
function mostrarErros(lista) {
  const e = $("erros"); e.innerHTML = "";
  document.querySelectorAll(".par tr.erro").forEach((t) => t.classList.remove("erro"));
  if (!lista) return;
  const d = document.createElement("div"); d.className = "caixa-erro"; d.innerHTML = "<b>O cenário B tem dado errado (não calculei):</b><ul></ul>";
  for (const t of lista.slice(0, 8)) { const li = document.createElement("li"); li.textContent = t; d.querySelector("ul").appendChild(li); const c = t.split(":")[0]; document.querySelector(".par tr[data-c='" + CSS.escape(c) + "']")?.classList.add("erro"); }
  e.appendChild(d);
}

// ---------------------------------------------------------------- resultado lado a lado
const NOMES_PERDAS = {
  bom: "Peças boas (no ciclo ideal)", troca_ferramenta: "Troca de ferramenta", quebrada: "Quebras", botoeira: "Botoeira da operadora", faltou_blank: "Faltou blank",
  ciclo_lento: "Ciclo acima do ideal", enchimento: "Enchimento depois da troca", refugo: "Refugo", faltou_peca: "Faltou peça", bloqueada: "Bloqueada",
};
function desenharResultado() {
  if (!resA) return;
  const b = resB || resA, mesmo = !resB, transfer = resA.formato === "simulador-linha/2";
  $("tituloRes").textContent = "Resultado — média de " + resA.sementes + " semente" + (resA.sementes > 1 ? "s" : "") + " (as mesmas em A e B)";
  // manchete
  const dp = b.pecas_dia.media - resA.pecas_dia.media, pct = 100 * dp / resA.pecas_dia.media;
  const atA = resA.pecas_dia.media >= resA.demanda, atB = b.pecas_dia.media >= b.demanda;
  let m = "";
  if (mesmo) m = "B está igual ao A. Mude um dado na coluna B para comparar.";
  else {
    m = Math.abs(dp) < 0.5 ? "B dá o mesmo número de peças boas que A." : "B dá <span class='" + (dp > 0 ? "bom" : "ruim") + "'>" + (dp > 0 ? "+" : "−") + fmt(Math.abs(dp)) + " peças boas por dia (" + (dp > 0 ? "+" : "−") + fmt(Math.abs(pct), 1) + "%)</span>";
    if (atA !== atB) m += atB ? " — e passa a <span class='bom'>ATENDER</span> a demanda." : " — e deixa de <span class='ruim'>atender</span> a demanda.";
    const sA = transfer ? resA.ciclo.segura : resA.gargalo_nome, sB = transfer ? b.ciclo.segura : b.gargalo_nome;
    if (sA !== sB) m += "<br>" + (transfer ? "Quem segura a linha mudou: " : "O gargalo mudou: ") + esc(sA) + " → <b>" + esc(sB) + "</b>.";
  }
  $("manchete").innerHTML = m;
  // tabela
  const linha = (nome, va, vb, d, melhorMaior, txt = false, nota = "") => {
    let dif = "", cls = "";
    if (!mesmo) {
      if (txt) { dif = va === vb ? "igual" : "mudou"; cls = va === vb ? "" : "ruim"; if (va !== vb) cls = "mud"; }
      else { const x = vb - va; if (Math.abs(x) > 1e-9) { dif = (x > 0 ? "+" : "−") + fmt(Math.abs(x), d); cls = (x > 0) === melhorMaior ? "bom" : "ruim"; } else dif = "igual"; }
    }
    const v = (z) => (txt ? esc(z) : fmt(z, d));
    return `<tr><td>${nome}${nota ? "<small>" + nota + "</small>" : ""}</td><td>${v(va)}</td><td>${mesmo ? "—" : v(vb)}</td><td class="dif ${cls}">${dif}</td></tr>`;
  };
  const faixa = (r) => "faixa " + fmt(r.pecas_dia.min) + " a " + fmt(r.pecas_dia.max);
  let h = `<h3>Comparação</h3><div style="overflow-x:auto"><table class="comp"><tr><th>Resultado</th><th>A — como está</th><th>B — com as mudanças</th><th>Diferença</th></tr>`;
  h += `<tr><td>Peças boas por dia<small>A: ${faixa(resA)}${mesmo ? "" : " · B: " + faixa(b)}</small></td><td><b>${fmt(resA.pecas_dia.media)}</b></td><td><b>${mesmo ? "—" : fmt(b.pecas_dia.media)}</b></td><td class="dif ${mesmo || Math.abs(dp) < 0.5 ? "" : dp > 0 ? "bom" : "ruim"}">${mesmo ? "" : Math.abs(dp) < 0.5 ? "igual" : (dp > 0 ? "+" : "−") + fmt(Math.abs(dp)) + " (" + (dp > 0 ? "+" : "−") + fmt(Math.abs(pct), 1) + "%)"}</td></tr>`;
  h += linha("% da demanda (" + fmt(resA.demanda) + (b.demanda !== resA.demanda ? " → " + fmt(b.demanda) : "") + " por dia)", 100 * resA.pecas_dia.media / resA.demanda, 100 * b.pecas_dia.media / b.demanda, 1, true);
  h += linha("Ritmo real (s por peça boa)", resA.ritmo_s, b.ritmo_s, 2, false, false, "takt " + fmt(resA.takt_s, 2) + " s" + (b.takt_s !== resA.takt_s ? " → " + fmt(b.takt_s, 2) + " s" : ""));
  h += linha("OEE da linha (%)", 100 * resA.oee.oee, 100 * b.oee.oee, 1, true);
  h += linha("Disponibilidade (%)", 100 * resA.oee.disponibilidade, 100 * b.oee.disponibilidade, 1, true, false, transfer ? "" : "do gargalo");
  if (transfer) h += linha("Desempenho (%)", 100 * resA.oee.desempenho, 100 * b.oee.desempenho, 1, true);
  h += linha("Qualidade (%)", 100 * resA.oee.qualidade, 100 * b.oee.qualidade, 2, true);
  if (transfer) {
    h += linha("Ciclo do sincronismo (s)", resA.ciclo.ciclo_s, b.ciclo.ciclo_s, 3, false, false, "sem perdas");
    h += linha("Golpes por minuto (sem perdas)", resA.ciclo.gpm, b.ciclo.gpm, 2, true);
    h += linha("Quem segura a linha", resA.ciclo.segura, b.ciclo.segura, 0, true, true);
    h += linha("Paradas pela botoeira por dia", resA.botoeira_dia, b.botoeira_dia, 1, false);
    h += linha("Trocas de ferramenta por dia", resA.trocas_dia, b.trocas_dia, 1, false);
  } else {
    h += linha("Gargalo", resA.gargalo_nome, b.gargalo_nome, 0, true, true);
    if (resA.empilhadeira_pct != null) h += linha("Empilhadeira ocupada (%)", resA.empilhadeira_pct, b.empilhadeira_pct, 1, false);
  }
  const maior = (r) => Object.entries(r.perdas).filter(([k]) => k !== "bom").sort((x, y) => y[1] - x[1])[0];
  const mA = maior(resA), mB = maior(b);
  h += linha("Maior perda", mA ? NOMES_PERDAS[mA[0]] + " (" + fmt(mA[1]) + " min/dia)" : "—", mB ? NOMES_PERDAS[mB[0]] + " (" + fmt(mB[1]) + " min/dia)" : "—", 0, true, true);
  h += `</table></div>`;
  $("tabela").innerHTML = h;
  // para onde vai o tempo: A × B
  const chaves = Object.keys({ ...resA.perdas, ...b.perdas }).filter((k) => (resA.perdas[k] || 0) > 0.05 || (b.perdas[k] || 0) > 0.05);
  chaves.sort((x, y) => (x === "bom" ? -1 : y === "bom" ? 1 : (resA.perdas[y] || 0) - (resA.perdas[x] || 0)));
  const max = Math.max(...chaves.map((k) => Math.max(resA.perdas[k] || 0, b.perdas[k] || 0)), 1);
  let p = `<h3>Para onde vai o tempo — minutos por dia${transfer ? "" : " no gargalo"}</h3><div class="leg"><span><i style="background:#9a9893"></i>A — como está</span>${mesmo ? "" : "<span><i style='background:var(--s1)'></i>B — com as mudanças</span>"}</div><div class="barras">`;
  for (const k of chaves) {
    const a = resA.perdas[k] || 0, bb = b.perdas[k] || 0;
    p += `<div class="l"><span>${esc(NOMES_PERDAS[k] || k)}</span><div class="bb"><div style="width:${(100 * a / max).toFixed(1)}%;background:#9a9893" title="A: ${fmt(a, 1)} min/dia"></div>${mesmo ? "" : `<div style="width:${(100 * bb / max).toFixed(1)}%;background:var(--s1)" title="B: ${fmt(bb, 1)} min/dia"></div>`}</div><span class="v">${fmt(a, 1)}${mesmo ? "" : " → " + fmt(bb, 1)} min</span></div>`;
  }
  $("perdas").innerHTML = p + "</div>";
  // detalhe
  let x = "";
  if (transfer) {
    const linhas = resA.quebras.map((q, i) => ({ nome: q.nome, a: q.min_dia, b: (b.quebras[i] || {}).min_dia ?? 0 })).filter((q) => q.a > 0.05 || q.b > 0.05).sort((u, v) => v.a - u.a);
    if (linhas.length) x = `<h3>Quebras — minutos parados por dia</h3><table class="comp"><tr><th>Componente</th><th>A</th><th>B</th><th>Diferença</th></tr>` + linhas.map((q) => linha(esc(q.nome), q.a, mesmo ? q.a : q.b, 1, false)).join("") + "</table>";
  } else {
    x = `<h3>OEE de cada estação</h3><table class="comp"><tr><th>Estação</th><th>A</th><th>B</th><th>Diferença</th></tr>` + resA.estacoes.map((e, i) => linha(esc(e.nome) + (e.id === resA.gargalo ? " ◀" : ""), 100 * e.oee, 100 * ((b.estacoes || [])[i]?.oee ?? e.oee), 1, true)).join("") + "</table>";
  }
  $("extra").innerHTML = x;
  $("rodape").textContent = "A e B foram simulados com as sementes 1 a " + resA.sementes + ". Com poucas sementes, diferenças pequenas podem ser sorteio: confira a faixa (mín.–máx.) ou aumente as sementes. Quebras sorteadas variam muito de uma rodada para outra.";
}

// ---------------------------------------------------------------- abrir, salvar
async function abrir(c) {
  const r = await fetch("../" + c + "?t=" + Date.now()); if (!r.ok) throw new Error("não achei " + c);
  A = await r.json(); B = structuredClone(A); caminho = c; resA = resB = null;
  grupos = montarParametros(A); desenharParametros(); marcarMudancas(); mostrarErros(null);
  $("estado").innerHTML = esc(A.linha.nome) + (/FICT/i.test(A.linha.nome) ? "" : "");
  rodar("A"); $("calcB").textContent = "";
  history.replaceState(null, "", "?linha=" + encodeURIComponent(c));
}
async function carregarLista() {
  const r = await fetch("/api/lista"), l = (r.ok ? await r.json() : []).filter((f) => f.formato !== "simulador-sinais/1"), s = $("arquivo"); s.innerHTML = "";
  for (const f of l) { const o = document.createElement("option"); o.value = f.arquivo; o.textContent = f.nome + (f.formato === "simulador-linha/2" ? " · transfer" : " · estações"); s.appendChild(o); }
  return l;
}
$("arquivo").onchange = (e) => abrir(e.target.value);
$("sementes").onchange = () => { resA = resB = null; rodar("A"); if (mudancas().length) rodar("B"); };
$("bZerar").onclick = () => { B = structuredClone(A); desenharParametros(); marcarMudancas(); pedirB(); };
$("bImprimir").onclick = () => window.print();
$("bSalvar").onclick = () => { $("caixaComo").classList.add("aberto"); $("nomeComo").value = caminho.split("/").pop().replace(/\.json$/, "") + "_cenario_B"; $("nomeComo").focus(); };
$("bComoCancela").onclick = () => $("caixaComo").classList.remove("aberto");
$("bComoOk").onclick = async () => {
  const nome = $("nomeComo").value.trim().replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9_\-]+$/.test(nome)) { $("estado").textContent = "Nome do arquivo: só letras sem acento, números, _ e -."; return; }
  const dados = structuredClone(B);
  if (dados.linha.nome === A.linha.nome) dados.linha.nome = A.linha.nome + " — cenário B";
  dados.cenario_de = { arquivo: caminho, mudancas: mudancas().map((x) => x.gr + " · " + x.it.r + ": " + mostrar(x.a) + " → " + mostrar(x.b)) };
  const r = await fetch("/api/salvar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo: "modelos/" + nome + ".json", dados }) });
  const j = await r.json().catch(() => ({ ok: false, erro: "resposta inválida" }));
  $("caixaComo").classList.remove("aberto");
  $("estado").textContent = j.ok ? "B salvo em " + j.arquivo + (j.copia ? " (versão anterior em " + j.copia + ")" : "") : "Não salvou: " + j.erro;
  if (j.ok) { const v = $("arquivo").value; await carregarLista(); $("arquivo").value = v; }
};
window.cenarios = { mudar: (c, v) => { const it = grupos.flatMap((g) => g.itens).find((i) => i.c === c); const inp = document.querySelector(".par tr[data-c='" + CSS.escape(c) + "'] input"); if (inp) inp.value = v; mudar(it, v); }, pronto: () => !!resA && !$("calcB").textContent };

(async () => {
  try {
    const l = await carregarLista();
    const pedido = new URLSearchParams(location.search).get("linha"), ini = (pedido && pedido.replace(/^\.\.\//, "")) || l.find((f) => f.formato === "simulador-linha/2")?.arquivo || l[0]?.arquivo;
    if (!ini) throw new Error("nenhum arquivo de linha na pasta modelos");
    $("arquivo").value = ini; await abrir(ini);
  } catch (err) { $("erros").innerHTML = "<div class='caixa-erro'>Não consegui abrir: " + esc(err.message) + " — abra pelo ABRIR_CENARIOS.bat.</div>"; }
})();
