// Simulador de Linha — formulários (etapa S1, 04/11/2026).
// Mostra TODOS os dados do arquivo da linha em formulários, confere cada mudança (motor/formato.js) e salva pelo servidor local.
// Ao salvar por cima, o servidor guarda antes a versão anterior em _reprovados/modelos (nada se perde).
import { conferir, MOTIVOS_PARADA, EQUIPAMENTOS } from "../motor/formato.js";
import { calcularCiclo } from "../motor/sincronismo.js";

const $ = (id) => document.getElementById(id);
let arq = null, original = "", caminhoAtual = "", lista = [];

// ---------------------------------------------------------------- campos (o "mapa" do formulário)
const FALHAS = (c, r) => ({ tipo: "falhas", c, r });
const TRI = (c, r, u, ajuda) => ({ tipo: "tri", c, r, u, ajuda });
const SEC_LINHA = { id: "linha", titulo: "Linha e produção", explica: "Nome, demanda e lote. A troca de ferramenta acontece a cada lote: a linha esvazia, troca e enche de novo.", campos: [
  { c: "linha.nome", r: "Nome da linha", tipo: "texto", largo: true },
  { c: "linha.produto", r: "Peça / produto", tipo: "texto" },
  { c: "linha.pecas_por_golpe", r: "Peças por golpe", u: "peças", int: true, ajuda: "Ferramenta dupla = 2." },
  { c: "linha.demanda_pecas_dia", r: "Demanda por dia", u: "peças", int: true },
  { c: "linha.lote_pecas", r: "Tamanho do lote", u: "peças", int: true, ajuda: "Em branco = sem troca de ferramenta." , opcional: true },
  { c: "linha.setup_min", r: "Troca de ferramenta", u: "min" },
  { c: "linha.dias_simulados", r: "Dias a simular", u: "dias", int: true },
  { c: "linha.semente", r: "Semente do sorteio", int: true, ajuda: "Mesma semente = mesmo resultado. Mude para ver outra sequência de falhas." },
] };
const SEC_TURNOS = { id: "turnos", titulo: "Turnos e pausas", explica: "O simulador conta só o tempo disponível (turno menos pausas).", tabela: { c: "turnos", colunas: [
  { k: "nome", r: "Turno", tipo: "texto" }, { k: "inicio", r: "Início", tipo: "hora" }, { k: "fim", r: "Fim", tipo: "hora" }, { k: "pausa_min", r: "Pausas", u: "min" },
], novo: () => ({ nome: "Novo turno", inicio: "22:00", fim: "06:00", pausa_min: 60 }) }, calc: true };
const SEC_ABAST = (comSaida) => ({ id: "abastecimento", titulo: "Abastecimento (empilhadeira)", explica: comSaida
  ? "Pilhas de blanks na entrada e racks na saída. Com 0 empilhadeiras o abastecimento não é simulado."
  : "Pilhas de blanks dos magazines do destacker. Com 0 empilhadeiras o abastecimento não é simulado.", campos: [
  { c: "abastecimento.empilhadeiras", r: "Empilhadeiras para esta linha", u: "un.", int: true },
  { c: "abastecimento.entrada.pecas_por_pilha", r: "Peças por pilha (magazine)", u: "blanks", int: true },
  { c: "abastecimento.entrada.magazines", r: "Magazines", u: "un.", int: true, ajuda: "2 = troca um enquanto o outro alimenta." },
  { c: "abastecimento.entrada.chegada_empilhadeira_min", r: "Tempo para a empilhadeira chegar", u: "min" },
  { c: "abastecimento.entrada.troca_min", r: "Tempo para trocar a pilha", u: "min" },
  ...(comSaida ? [
    { c: "abastecimento.saida.pecas_por_rack", r: "Peças por rack (saída)", u: "peças", int: true },
    { c: "abastecimento.saida.posicoes", r: "Posições de rack", u: "un.", int: true },
    { c: "abastecimento.saida.chegada_empilhadeira_min", r: "Empilhadeira chegar (rack)", u: "min" },
    { c: "abastecimento.saida.troca_min", r: "Tempo para trocar o rack", u: "min" },
  ] : []),
] });

const SECOES = {
  "simulador-linha/1": () => [SEC_LINHA, SEC_TURNOS,
    { id: "estacoes", titulo: "Estações", explica: "Na ordem do fluxo. A primeira é a alimentação e a última a saída. Estoque 0 = ligadas direto. MTBF e MTTR em branco = sem falhas.", tabela: { c: "estacoes", colunas: [
      { k: "id", r: "Código", tipo: "texto", largura: 140 }, { k: "nome", r: "Nome", tipo: "texto", largura: 190 },
      { k: "tipo", r: "Tipo", tipo: "lista", opcoes: [["alimentacao", "alimentação"], ["processo", "processo"], ["saida", "saída"]] },
      { k: "ciclo_s.min", r: "Ciclo mín.", u: "s" }, { k: "ciclo_s.mais_comum", r: "Ciclo mais comum", u: "s" }, { k: "ciclo_s.max", r: "Ciclo máx.", u: "s" },
      { k: "paralelas", r: "Em paralelo", u: "máq.", int: true }, { k: "estoque_depois", r: "Estoque depois", u: "peças", int: true },
      { k: "falhas.mtbf_min", r: "MTBF", u: "min", falha: true }, { k: "falhas.mttr_min", r: "MTTR", u: "min", falha: true },
      { k: "refugo_pct", r: "Refugo", u: "%" }, { k: "observacao", r: "Observação", tipo: "texto", largura: 160 },
    ], novo: (L) => ({ id: "EST_Nova_" + (L.length + 1), nome: "Nova estação", tipo: "processo", ciclo_s: { min: 4, mais_comum: 4.2, max: 4.6 }, paralelas: 1, estoque_depois: 0, falhas: null, refugo_pct: 0, observacao: "" }) } },
    SEC_ABAST(true)],
  "simulador-linha/2": () => [SEC_LINHA, SEC_TURNOS,
    { id: "transfer", titulo: "Transfer — CLP mestre", explica: "O CLP do transfer manda no ciclo: Y avança → X avança → Y recua → X volta enquanto as prensas golpeiam → OK das prensas em PMS. Os Y de todos os interpress andam juntos.", campos: [
      { c: "transfer.id", r: "Código", tipo: "texto" }, { c: "transfer.nome", r: "Nome", tipo: "texto" },
      { c: "transfer.eixo_x.curso_mm", r: "Eixo X — curso (passo)", u: "mm" }, { c: "transfer.eixo_x.vel_mm_s", r: "Eixo X — velocidade", u: "mm/s" }, { c: "transfer.eixo_x.acel_mm_s2", r: "Eixo X — aceleração", u: "mm/s²" },
      { c: "transfer.eixo_y.curso_mm", r: "Eixo Y — curso (fingers)", u: "mm" }, { c: "transfer.eixo_y.vel_mm_s", r: "Eixo Y — velocidade", u: "mm/s" }, { c: "transfer.eixo_y.acel_mm_s2", r: "Eixo Y — aceleração", u: "mm/s²" },
      { c: "transfer.confirmacao_s", r: "Confirmação entre passos", u: "s", ajuda: "Tempo do sensor / sinal de fim de movimento antes do passo seguinte." },
      FALHAS("transfer.falhas", "Falhas do transfer (eixos, servos)"),
    ] },
    { id: "prensas", titulo: "Prensas", explica: "Na ordem da linha. Todas descem e sobem juntas; a mais lenta segura o golpe. Golpe = 1 volta do volante (PMS 0° → PMI 180° → PMS) + embreagem + freio.", tabela: { c: "prensas", colunas: [
      { k: "id", r: "Código", tipo: "texto", largura: 130 }, { k: "nome", r: "Nome", tipo: "texto", largura: 190 },
      { k: "capacidade_t", r: "Capacidade", u: "t" }, { k: "spm_volante", r: "Golpes/min do volante", u: "gpm" }, { k: "curso_mm", r: "Curso do martelo", u: "mm" },
      { k: "embreagem_s", r: "Embreagem", u: "s" }, { k: "freio_s", r: "Freio", u: "s" },
      { k: "falhas.mtbf_min", r: "MTBF", u: "min", falha: true }, { k: "falhas.mttr_min", r: "MTTR", u: "min", falha: true }, { k: "refugo_pct", r: "Refugo", u: "%" },
    ], novo: (L) => { const b = L[L.length - 1] ? structuredClone(L[L.length - 1]) : { capacidade_t: 160, spm_volante: 35, curso_mm: 180, embreagem_s: 0.08, freio_s: 0.12, falhas: null, refugo_pct: 0 };
      b.id = "EST_Prensa_" + (L.length + 1); b.nome = "Prensa " + (L.length + 1); return b; } } },
    { id: "interpress", titulo: "Interpress", explica: "Estações entre as prensas onde a peça espera o próximo passo do transfer (entrada, entre as prensas e saída).", campos: [
      { c: "interpress.quantidade", r: "Quantidade de interpress", u: "un.", int: true }, { c: "interpress.observacao", r: "Observação", tipo: "texto", largo: true },
    ] },
    { id: "destacker", titulo: "Destacker", explica: "Pega o blank do magazine A ou B enquanto as prensas golpeiam. Só troca de magazine quando o atual esvazia.", campos: [
      { c: "destacker.id", r: "Código", tipo: "texto" }, { c: "destacker.nome", r: "Nome", tipo: "texto" },
      TRI("destacker.pega_s", "Tempo para pegar e colocar o blank", "s", "O simulador sorteia cada pega entre o mínimo e o máximo."),
      { c: "destacker.troca_magazine_s", r: "Troca de magazine A ↔ B", u: "s" },
      FALHAS("destacker.falhas", "Falhas do destacker"),
    ] },
    SEC_ABAST(false),
    { id: "saida", titulo: "Saída — esteira, mesa e operadora", explica: "A mesa nunca para a linha por estar cheia. A linha só para quando a operadora acha peça com defeito e aperta a botoeira (ou por defeito de manutenção).", campos: [
      { c: "saida.id", r: "Código", tipo: "texto" }, { c: "saida.nome", r: "Nome", tipo: "texto" },
      { c: "saida.esteira_s", r: "Tempo na esteira até a mesa", u: "s" },
      TRI("saida.operadora.tempo_peca_s", "Tempo da operadora por peça (encaixotar)", "s"),
      { c: "saida.operadora.acha_defeito_pct", r: "Peças com defeito que a operadora acha", u: "%" },
      TRI("saida.operadora.parada_botoeira_min", "Parada quando aperta a botoeira", "min"),
    ] },
  ],
  "simulador-sinais/1": () => [
    { id: "conexao", titulo: "Conexão com o CLP (só leitura)", explica: "O programa SÓ LÊ o CLP: não existe função de escrita. Para testar sem máquina, use o CLP de mentira (127.0.0.1). Ligar na linha real só com autorização da empresa.", campos: [
      { c: "nome", r: "Nome deste mapa", tipo: "texto", largo: true },
      { c: "linha", r: "Arquivo da linha (pasta modelos)", tipo: "texto", ajuda: "Ex.: modelos/linha_T_transfer_FICTICIA.json — é o modelo comparado com o real." },
      { c: "conexao.protocolo", r: "Protocolo", tipo: "lista", opcoes: [["modbus", "Modbus TCP"], ["slmp", "SLMP (Mitsubishi, quadro 3E binário)"]] },
      { c: "conexao.endereco_ip", r: "Endereço do CLP (IP)", tipo: "texto", ajuda: "127.0.0.1 = CLP de mentira neste PC." },
      { c: "conexao.porta", r: "Porta", int: true, ajuda: "Modbus normalmente 502; SLMP a porta configurada no CLP. CLP de mentira: 5020 (Modbus) e 5021 (SLMP)." },
      { c: "conexao.unidade", r: "Unidade Modbus (unit id)", int: true, ajuda: "Só para Modbus." },
      { c: "conexao.intervalo_ms", r: "Ler a cada", u: "ms", int: true },
      { c: "conexao.tempo_max_ms", r: "Tempo máximo de resposta", u: "ms", int: true },
    ] },
    { id: "sinais", titulo: "Sinais", explica: "Endereços — Modbus: HR/IR (registro), C/DI (bit) + número (HR0, C5). SLMP: D/W/R (palavra), M/X/Y/B (bit) (D100, M10, X1F). registro32 = dois registros (palavra baixa primeiro). Valor = número lido × escala. Endereço vazio = não ler.", tabela: { c: "sinais", colunas: [
      { k: "id", r: "Código", tipo: "texto", largura: 150 }, { k: "nome", r: "O que é", tipo: "texto", largura: 300 },
      { k: "tipo", r: "Tipo", tipo: "lista", opcoes: [["registro", "registro"], ["registro32", "registro32"], ["bit", "bit"]] },
      { k: "endereco", r: "Endereço", tipo: "texto", largura: 90 }, { k: "escala", r: "Escala" }, { k: "unidade", r: "Unidade", tipo: "texto", largura: 70 },
    ], novo: (L) => ({ id: "sinal_" + (L.length + 1), nome: "Novo sinal", tipo: "registro", endereco: "", escala: 1, unidade: "" }) } },
  ],
  "simulador-apontamento/1": () => {
    const SN = [["sim", "sim"], ["nao", "não"]];
    return [
      { id: "geral", titulo: "Apontamento real (validação · PRIVADO)", explica: "Turnos reais para comparar com o simulador. Este arquivo fica só na pasta privado deste PC: nunca vai para vídeo, demonstração ou pacote. Use só com autorização da empresa.", campos: [
        { c: "nome", r: "Nome deste apontamento", tipo: "texto", largo: true },
        { c: "linha", r: "Arquivo da linha comparada", tipo: "texto", ajuda: "Ex.: privado/linha_real.json (os tempos reais da linha, no formulário da linha transfer)." },
        { c: "troca_inclui_esvaziar_encher", r: "Os minutos de troca contam também esvaziar e encher a linha?", tipo: "lista", opcoes: SN, ajuda: "sim = da última peça boa à primeira peça boa (o simulador desconta esvaziar e encher). não = só a linha parada trocando a ferramenta." },
        { c: "obs", r: "Observação", tipo: "texto", largo: true },
      ] },
      { id: "turnos", titulo: "Turnos", explica: "Uma linha por turno. Tempo trabalhado = turno menos pausas e refeição. Peças boas e refugo como no apontamento. Marque usar = não para um turno fora do normal (deixa de entrar na conta, mas fica guardado).", tabela: { c: "turnos", colunas: [
        { k: "id", r: "Código", tipo: "texto", largura: 70 }, { k: "data", r: "Data", tipo: "texto", largura: 105 }, { k: "turno", r: "Turno", tipo: "texto", largura: 80 },
        { k: "minutos_disponiveis", r: "Tempo trabalhado", u: "min" }, { k: "comecou_cheia", r: "Começou com a linha cheia?", tipo: "lista", opcoes: SN },
        { k: "pecas_boas", r: "Peças boas", u: "peças", int: true }, { k: "refugo", r: "Refugo", u: "peças", int: true },
        { k: "usar", r: "Usar na conta?", tipo: "lista", opcoes: SN }, { k: "obs", r: "Observação", tipo: "texto", largura: 160 },
      ], novo: (L) => { const a = L[L.length - 1]; return { id: "T" + (L.length + 1), data: a?.data || new Date().toISOString().slice(0, 10), turno: a?.turno || "1º", minutos_disponiveis: a?.minutos_disponiveis || 420, comecou_cheia: "sim", pecas_boas: 0, refugo: 0, usar: "sim", obs: "" }; } } },
      { id: "paradas", titulo: "Paradas de cada turno", explica: "Uma linha por parada: quebra, botoeira, falta de blank, troca de ferramenta ou outra. A hora em que começou é opcional (em branco, o simulador espalha as paradas por igual no turno). Parada que passou de um turno para o outro: lance em cada turno só a parte dele — no turno seguinte ela começa aos 0 min (e, se era troca, esse turno começou com a linha vazia).", tabela: { c: "paradas", colunas: [
        { k: "turno", r: "Código do turno", tipo: "texto", largura: 80 }, { k: "motivo", r: "Motivo", tipo: "lista", opcoes: MOTIVOS_PARADA },
        { k: "equipamento", r: "Equipamento", tipo: "lista", opcoes: EQUIPAMENTOS }, { k: "min", r: "Parado", u: "min" },
        { k: "inicio_min", r: "Começou aos (opcional)", u: "min do turno", opcional: true }, { k: "obs", r: "Observação", tipo: "texto", largura: 180 },
      ], podeVazia: true, novo: (L) => ({ turno: L[L.length - 1]?.turno || "T1", motivo: "quebra", equipamento: "prensa_1", min: 10, inicio_min: null, obs: "" }) } },
    ];
  },
};

// ---------------------------------------------------------------- ler e gravar pelo caminho ("prensas.2.falhas.mtbf_min")
const partes = (c) => c.split(".").map((p) => (/^\d+$/.test(p) ? +p : p));
function pegar(obj, c) { return partes(c).reduce((o, p) => (o == null ? undefined : o[p]), obj); }
function por(obj, c, v) {
  const ps = partes(c); let o = obj;
  for (let i = 0; i < ps.length - 1; i++) { if (o[ps[i]] == null || typeof o[ps[i]] !== "object") o[ps[i]] = typeof ps[i + 1] === "number" ? [] : {}; o = o[ps[i]]; }
  o[ps[ps.length - 1]] = v;
}
const mostrarNum = (v) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v));
function lerNum(txt, opcional) {
  const t = String(txt).trim().replace(/\s/g, "");
  if (t === "") return opcional ? null : "";
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : t;                    // texto inválido fica como texto: a conferência mostra o erro
}

// ---------------------------------------------------------------- montar a tela
function criaEntrada(campo, valor, onMuda) {
  let el;
  if (campo.tipo === "lista") {
    el = document.createElement("select");
    for (const [v, r] of campo.opcoes) { const o = document.createElement("option"); o.value = v; o.textContent = r; el.appendChild(o); }
    el.value = valor ?? "";
    el.onchange = () => onMuda(el.value);
  } else {
    el = document.createElement("input");
    el.type = "text";
    if (campo.tipo === "texto") { el.value = valor ?? ""; el.oninput = () => onMuda(el.value); }
    else if (campo.tipo === "hora") { el.value = valor ?? ""; el.placeholder = "06:00"; el.inputMode = "numeric"; el.oninput = () => onMuda(el.value.trim()); }
    else { el.inputMode = "decimal"; el.value = mostrarNum(valor); el.oninput = () => onMuda(lerNum(el.value, campo.opcional)); }
    if (campo.tipo === "texto" && /\.data$/.test(campo.k || "")) el.placeholder = "2026-11-03";
  }
  return el;
}
function caixaCampo(rotulo, entrada, un, ajuda, campo) {
  const d = document.createElement("div"); d.className = "campo"; d.dataset.campo = campo;
  const id = "f_" + campo.replace(/\W/g, "_"); entrada.id = id; entrada.dataset.campo = campo;
  const l = document.createElement("label"); l.htmlFor = id; l.textContent = rotulo; d.appendChild(l);
  const e = document.createElement("div"); e.className = "entrada" + (un ? " com-un" : ""); e.appendChild(entrada);
  if (un) { const u = document.createElement("span"); u.className = "un"; u.textContent = un; e.appendChild(u); }
  d.appendChild(e);
  if (ajuda) { const a = document.createElement("div"); a.className = "ajuda"; a.textContent = ajuda; d.appendChild(a); }
  const m = document.createElement("div"); m.className = "msg"; d.appendChild(m);
  return d;
}

function montarSecao(sec) {
  const s = document.createElement("section"); s.id = "sec_" + sec.id;
  s.innerHTML = "<h2></h2><p class='explica'></p>"; s.querySelector("h2").textContent = sec.titulo; s.querySelector(".explica").textContent = sec.explica || "";
  if (sec.campos) {
    const g = document.createElement("div"); g.className = "grade"; s.appendChild(g);
    for (const f of sec.campos) {
      if (f.tipo === "tri") {
        const d = document.createElement("div"); d.className = "campo"; d.style.gridColumn = "span 2"; d.dataset.campo = f.c;
        d.innerHTML = "<label></label><div class='tri'></div><div class='ajuda'></div><div class='msg'></div>"; d.querySelector("label").textContent = f.r + " (" + f.u + ")";
        d.querySelector(".ajuda").textContent = f.ajuda || "";
        for (const [k, r] of [["min", "mínimo"], ["mais_comum", "mais comum"], ["max", "máximo"]]) {
          const c = f.c + "." + k, box = document.createElement("div");
          box.innerHTML = "<small></small>"; box.querySelector("small").textContent = r;
          const inp = criaEntrada({}, pegar(arq, c), (v) => mudou(c, v)); inp.dataset.campo = c; inp.setAttribute("aria-label", f.r + " — " + r);
          box.appendChild(inp); d.querySelector(".tri").appendChild(box);
        }
        g.appendChild(d);
      } else if (f.tipo === "falhas") {
        const d = document.createElement("div"); d.className = "campo"; d.style.gridColumn = "span 2"; d.dataset.campo = f.c;
        const tem = pegar(arq, f.c) != null;
        d.innerHTML = "<label class='falhas-liga'><input type='checkbox'> <span></span></label><div class='tri' style='grid-template-columns:1fr 1fr'></div><div class='msg'></div>";
        d.querySelector("span").textContent = f.r;
        const chk = d.querySelector("input"); chk.checked = tem;
        const caixa = d.querySelector(".tri");
        const desenhar = () => {
          caixa.innerHTML = ""; caixa.style.display = chk.checked ? "" : "none";
          for (const [k, r, u] of [["mtbf_min", "Tempo médio entre falhas (MTBF)", "min"], ["mttr_min", "Tempo médio de reparo (MTTR)", "min"]]) {
            const c = f.c + "." + k, box = document.createElement("div");
            box.innerHTML = "<small></small>"; box.querySelector("small").textContent = r + " — " + u;
            const inp = criaEntrada({}, pegar(arq, c), (v) => mudou(c, v)); inp.dataset.campo = c; inp.setAttribute("aria-label", r);
            box.appendChild(inp); caixa.appendChild(box);
          }
        };
        chk.onchange = () => { por(arq, f.c, chk.checked ? { mtbf_min: 600, mttr_min: 10 } : null); desenhar(); mudou(); };
        desenhar(); g.appendChild(d);
      } else {
        const inp = criaEntrada(f, pegar(arq, f.c), (v) => mudou(f.c, v));
        const d = caixaCampo(f.r, inp, f.u, f.ajuda, f.c); if (f.largo) d.style.gridColumn = "span 2";
        g.appendChild(d);
      }
    }
  }
  if (sec.tabela) s.appendChild(montarTabela(sec));
  if (sec.calc) { const c = document.createElement("div"); c.className = "calc"; c.id = "calc"; s.appendChild(c); }
  return s;
}

function montarTabela(sec) {
  const T = sec.tabela, cont = document.createElement("div");
  const rolar = document.createElement("div"); rolar.className = "rolar"; cont.appendChild(rolar);
  const desenhar = () => {
    const L = pegar(arq, T.c) || [];
    const tab = document.createElement("table");
    const cab = "<tr><th>#</th>" + T.colunas.map((k) => "<th style='min-width:" + (k.largura || 80) + "px'>" + esc(k.r) + (k.u ? "<span>" + esc(k.u) + "</span>" : "") + "</th>").join("") + "<th></th></tr>";
    tab.innerHTML = "<thead>" + cab + "</thead><tbody></tbody>";
    L.forEach((linha, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td class='n'>" + (i + 1) + "</td>";
      for (const k of T.colunas) {
        const c = T.c + "." + i + "." + k.k, td = document.createElement("td"); td.dataset.campo = c;
        const inp = criaEntrada(k, pegar(arq, c), (v) => {
          if (k.falha) {                                      // MTBF/MTTR em branco nos dois = sem falhas
            const f = linha.falhas || {}; f[k.k.split(".")[1]] = v === "" ? null : v;
            linha.falhas = (f.mtbf_min == null || f.mtbf_min === "") && (f.mttr_min == null || f.mttr_min === "") ? null : f;
            mudou();
          } else mudou(c, v);
        });
        if (k.falha && pegar(arq, c) == null) inp.value = "";
        inp.dataset.campo = c; inp.setAttribute("aria-label", k.r + " — linha " + (i + 1));
        td.appendChild(inp); tr.appendChild(td);
      }
      const ac = document.createElement("td"); ac.className = "acoes";
      const bt = (txt, titulo, fn, off) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.title = titulo; b.setAttribute("aria-label", titulo + " (linha " + (i + 1) + ")"); b.disabled = !!off; b.onclick = () => { fn(); desenhar(); mudou(); }; ac.appendChild(b); };
      bt("↑", "Subir", () => { [L[i - 1], L[i]] = [L[i], L[i - 1]]; }, i === 0);
      bt("↓", "Descer", () => { [L[i + 1], L[i]] = [L[i], L[i + 1]]; }, i === L.length - 1);
      bt("⧉", "Duplicar", () => { const n = structuredClone(linha); if (n.id) n.id = n.id + "_copia"; L.splice(i + 1, 0, n); });
      bt("✕", "Remover", () => { L.splice(i, 1); }, L.length <= 1 && !T.podeVazia);
      tr.appendChild(ac);
      tab.querySelector("tbody").appendChild(tr);
    });
    rolar.innerHTML = ""; rolar.appendChild(tab);
    marcarErros();
  };
  const mais = document.createElement("button"); mais.type = "button"; mais.className = "mais"; mais.textContent = "+ Acrescentar";
  mais.onclick = () => { const L = pegar(arq, T.c) || []; L.push(T.novo(L)); por(arq, T.c, L); desenhar(); mudou(); };
  cont.appendChild(mais);
  desenhar();
  return cont;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------- conferência a cada mudança
let resultado = { erros: [], avisos: [], calculado: null };
function mudou(c, v) {
  if (c) por(arq, c, v);
  resultado = conferir(arq);
  arq.calculado = { ...(arq.calculado || {}), ...(resultado.calculado || {}) };
  marcarErros(); atualizarEstado();
}
function marcarErros() {
  document.querySelectorAll(".tem-erro,.tem-aviso").forEach((e) => e.classList.remove("tem-erro", "tem-aviso"));
  document.querySelectorAll(".campo .msg").forEach((m) => (m.textContent = ""));
  const porSecao = {};
  const achar = (campo) => {
    let el = document.querySelector("[data-campo='" + CSS.escape(campo) + "']:not(input):not(select)") || document.querySelector("input[data-campo='" + CSS.escape(campo) + "']")?.closest("td,.campo");
    let c = campo; while (!el && c.includes(".")) { c = c.slice(0, c.lastIndexOf(".")); el = document.querySelector("[data-campo='" + CSS.escape(c) + "']"); }
    return el;
  };
  for (const [lista, classe] of [[resultado.avisos, "tem-aviso"], [resultado.erros, "tem-erro"]]) for (const e of lista) {
    const el = achar(e.campo); if (!el) continue;
    const alvo = el.matches("input,select") ? el.closest("td,.campo") : el;
    alvo.classList.add(classe);
    const msg = alvo.querySelector(".msg"); if (msg && classe === "tem-erro") msg.textContent = msg.textContent ? msg.textContent + " " + e.txt : e.txt;
    const sec = alvo.closest("section")?.id; if (sec) { porSecao[sec] = porSecao[sec] || { e: 0, a: 0 }; porSecao[sec][classe === "tem-erro" ? "e" : "a"]++; }
  }
  document.querySelectorAll("#menu a").forEach((a) => {
    const n = porSecao[a.hash.slice(1)], s = a.querySelector(".cont");
    s.textContent = n ? (n.e || n.a) : ""; s.className = "cont" + (n && !n.e ? " aviso" : ""); s.style.display = n ? "" : "none";
  });
  const r = $("resumo"); r.innerHTML = "";
  if (resultado.erros.length) {
    const d = document.createElement("div"); d.className = "caixa-erro";
    d.innerHTML = "<b>" + resultado.erros.length + " ponto(s) para corrigir antes de salvar:</b><ul></ul>";
    for (const e of resultado.erros.slice(0, 12)) { const li = document.createElement("li"); const a = document.createElement("a"); a.href = "#"; a.textContent = nomeCampo(e.campo) + ": " + e.txt; a.onclick = (ev) => { ev.preventDefault(); irPara(e.campo); }; li.appendChild(a); d.querySelector("ul").appendChild(li); }
    r.appendChild(d);
  }
  if (!resultado.erros.length && arq.formato === "simulador-linha/2") {            // ciclo calculado na hora (motor de sincronismo, etapa S2)
    try {
      const c = calcularCiclo(arq), d = document.createElement("div"); d.className = "caixa-ok"; d.id = "cicloAoVivo";
      d.innerHTML = "<b>Ciclo calculado: <span></span></b><div></div><div></div>";
      d.querySelector("span").textContent = mostrarNum(c.ciclo_s) + " s · " + mostrarNum(+c.golpes_por_minuto.toFixed(2)) + " golpes/min · " + Math.round(c.pecas_por_hora).toLocaleString("pt-BR") + " peças/h";
      d.children[1].textContent = "Quem segura a linha: " + c.segura.nome + " (" + mostrarNum(c.segura.tempo_s) + " s). Melhorando até " + c.proximo.nome + " (" + mostrarNum(c.proximo.tempo_s) + " s): " + mostrarNum(+c.gpm_se_igualar.toFixed(2)) + " golpes/min.";
      d.children[2].textContent = "Destacker atrasa " + mostrarNum(+c.destacker_variacao.atrasa_pct.toFixed(1)) + "% dos ciclos · ciclo médio " + mostrarNum(c.destacker_variacao.ciclo_medio_s) + " s · sem perdas: " + Math.round((resultado.calculado.tempo_disponivel_dia_min * 60 / c.ciclo_s) * (arq.linha.pecas_por_golpe || 1)).toLocaleString("pt-BR") + " peças/dia (demanda " + Number(arq.linha.demanda_pecas_dia).toLocaleString("pt-BR") + ").";
      r.appendChild(d);
    } catch (e) { /* dado incompleto: a conferência já mostra */ }
  }
  if (resultado.avisos.length) {
    const d = document.createElement("div"); d.className = "caixa-aviso"; d.innerHTML = "<b>Conferir:</b><ul></ul>";
    for (const e of resultado.avisos) { const li = document.createElement("li"); li.textContent = e.txt; d.querySelector("ul").appendChild(li); }
    r.appendChild(d);
  }
  const c = $("calc");
  if (c && resultado.calculado) c.innerHTML = "<div>Tempo disponível por dia<b>" + mostrarNum(resultado.calculado.tempo_disponivel_dia_min) + " min</b></div><div>Takt (demanda)<b>" + (resultado.calculado.takt_s ? mostrarNum(resultado.calculado.takt_s) + " s" : "—") + "</b></div>";
}
function nomeCampo(c) {
  const p = partes(c);
  const nomes = { linha: "Linha", turnos: "Turno", estacoes: "Estação", prensas: "Prensa", transfer: "Transfer", destacker: "Destacker", saida: "Saída", abastecimento: "Abastecimento", interpress: "Interpress", sinais: "Sinal", conexao: "Conexão", nome: "Nome" };
  return (nomes[p[0]] || p[0]) + (typeof p[1] === "number" ? " " + (p[1] + 1) : "");
}
function irPara(campo) {
  const el = document.querySelector("[data-campo='" + CSS.escape(campo) + "']");
  const alvo = el?.matches("input,select") ? el : el?.querySelector("input,select") || document.querySelector("input[data-campo^='" + CSS.escape(campo) + "']");
  if (alvo) { alvo.scrollIntoView({ block: "center" }); alvo.focus(); }
}
function atualizarEstado() {
  const sujo = JSON.stringify(arq) !== original;
  const e = $("estado");
  e.textContent = (resultado.erros.length ? resultado.erros.length + " erro(s) · " : "") + (sujo ? "alterações não salvas" : "sem alterações") + " · " + caminhoAtual;
  e.className = sujo ? "sujo" : "";
  $("bSalvar").disabled = !sujo || resultado.erros.length > 0;
  $("bComoOk").disabled = resultado.erros.length > 0;
  $("bDesfazer").disabled = !sujo;
  $("b3d").style.display = ["simulador-sinais/1", "simulador-apontamento/1"].includes(arq?.formato) ? "none" : "";
  $("bValidar").style.display = arq?.formato === "simulador-apontamento/1" ? "" : "none";
  $("b3d").href = (arq?.formato === "simulador-linha/2" ? "transfer.html" : "index.html") + "?linha=" + encodeURIComponent("../" + caminhoAtual);
}

// ---------------------------------------------------------------- abrir, salvar
function montarTudo() {
  const secs = (SECOES[arq.formato] || (() => []))();
  $("secoes").innerHTML = ""; $("menu").innerHTML = "";
  for (const s of secs) {
    $("secoes").appendChild(montarSecao(s));
    const a = document.createElement("a"); a.href = "#sec_" + s.id; a.innerHTML = "<span></span><span class='cont' style='display:none'></span>"; a.firstChild.textContent = s.titulo;
    $("menu").appendChild(a);
  }
  resultado = conferir(arq); arq.calculado = { ...(arq.calculado || {}), ...(resultado.calculado || {}) };
  original = JSON.stringify(arq);
  marcarErros(); atualizarEstado();
}
async function abrir(caminho) {
  const r = await fetch("../" + caminho + "?t=" + Date.now());
  if (!r.ok) throw new Error("não achei " + caminho);
  arq = await r.json(); caminhoAtual = caminho;
  montarTudo();
  history.replaceState(null, "", "?linha=" + encodeURIComponent(caminho));
}
async function salvar(caminho) {
  mudou();
  if (resultado.erros.length) { irPara(resultado.erros[0].campo); return; }
  $("estado").textContent = "salvando…";
  const r = await fetch("/api/salvar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo: caminho, dados: arq }) });
  const j = await r.json().catch(() => ({ ok: false, erro: "resposta inválida do servidor" }));
  if (!j.ok) { aviso("Não salvou: " + (j.erro || r.status)); atualizarEstado(); return; }
  aviso("");
  caminhoAtual = j.arquivo; original = JSON.stringify(arq);
  await carregarLista(); $("arquivo").value = caminhoAtual;
  history.replaceState(null, "", "?linha=" + encodeURIComponent(caminhoAtual));
  atualizarEstado();
  $("estado").textContent = "salvo ✓ " + caminhoAtual + (j.copia ? " · versão anterior guardada em " + j.copia : "");
}
function aviso(txt) { const a = $("aviso-servidor"); a.style.display = txt ? "block" : "none"; a.textContent = txt; }
async function carregarLista() {
  const r = await fetch("/api/lista"); lista = r.ok ? await r.json() : [];
  const s = $("arquivo"); s.innerHTML = "";
  for (const f of lista) { const o = document.createElement("option"); o.value = f.arquivo; o.textContent = (f.arquivo.startsWith("privado/") ? "🔒 " : "") + f.nome + (f.formato === "simulador-linha/2" ? " · transfer" : f.formato === "simulador-sinais/1" ? " · sinais do CLP" : f.formato === "simulador-apontamento/1" ? " · apontamento real" : " · estações"); s.appendChild(o); }
}

$("arquivo").onchange = async (e) => {
  const novo = e.target.value;
  if (JSON.stringify(arq) === original) { await abrir(novo); return; }
  e.target.value = caminhoAtual;                       // tem alteração: pergunta na própria página, sem janela do navegador
  const a = $("aviso-servidor"); a.style.display = "block"; a.textContent = "Há alterações não salvas em " + caminhoAtual + ". ";
  const b1 = document.createElement("button"); b1.textContent = "Descartar e abrir " + novo.split("/").pop();
  b1.onclick = async () => { aviso(""); $("arquivo").value = novo; await abrir(novo); };
  const b2 = document.createElement("button"); b2.textContent = "Continuar editando"; b2.style.marginLeft = "6px"; b2.onclick = () => aviso("");
  a.append(b1, b2);
};
$("bSalvar").onclick = () => salvar(caminhoAtual);
$("bSalvarComo").onclick = () => { $("caixaComo").classList.add("aberto"); $("nomeComo").value = caminhoAtual.split("/").pop().replace(/\.json$/, "") + "_v2"; $("nomeComo").focus(); };
$("bComoCancela").onclick = () => $("caixaComo").classList.remove("aberto");
$("bComoOk").onclick = async () => {
  const n = $("nomeComo").value.trim().replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9_\-]+$/.test(n)) { aviso("Nome do arquivo: só letras sem acento, números, _ e -."); return; }
  $("caixaComo").classList.remove("aberto"); await salvar((caminhoAtual.startsWith("privado/") ? "privado/" : "modelos/") + n + ".json");
};
$("bDesfazer").onclick = () => { arq = JSON.parse(original); montarTudo(); };
$("bValidar").onclick = async () => {                        // E6: roda a validação no servidor e abre o relatório
  if (JSON.stringify(arq) !== original) { aviso("Salve o apontamento antes de validar."); return; }
  aviso("Validando… (a previsão roda 40 sementes, leva alguns segundos)");
  const r = await fetch("/api/validar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apontamento: caminhoAtual }) });
  const j = await r.json().catch(() => ({ ok: false, erro: "resposta inválida" }));
  if (!j.ok) { aviso("Não validou: " + j.erro); return; }
  aviso(""); location.href = "/" + j.relatorio;
};
$("bBaixar").onclick = () => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(arq, null, 2)], { type: "application/json" }));
  a.download = caminhoAtual.split("/").pop(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.addEventListener("beforeunload", (e) => { if (arq && JSON.stringify(arq) !== original) { e.preventDefault(); e.returnValue = ""; } });
const obs = new IntersectionObserver((ents) => { for (const en of ents) if (en.isIntersecting) document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("ativo", a.hash === "#" + en.target.id)); }, { rootMargin: "-40% 0px -55% 0px" });
new MutationObserver(() => document.querySelectorAll("section").forEach((s) => obs.observe(s))).observe($("secoes"), { childList: true });

(async () => {
  try {
    await carregarLista();
    const pedido = new URLSearchParams(location.search).get("linha");
    const inicial = (pedido && pedido.replace(/^\.\.\//, "")) || lista[0]?.arquivo;
    if (!inicial) throw new Error("nenhum arquivo de linha na pasta modelos.");
    if (![...$("arquivo").options].some((o) => o.value === inicial)) { const o = document.createElement("option"); o.value = inicial; o.textContent = inicial; $("arquivo").appendChild(o); }
    $("arquivo").value = inicial;
    await abrir(inicial);
    window.formularioPronto = true;
  } catch (err) { aviso("Não consegui abrir: " + err.message + " — abra pelo ABRIR_FORMULARIOS.bat."); $("estado").textContent = ""; }
})();
