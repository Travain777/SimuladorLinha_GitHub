// Simulador de Linha — conferência do arquivo da linha (etapa S1, 04/11/2026). Roda no navegador (formulários) e no Node.
// Formatos:
//   simulador-linha/1  linha de estações soltas (com estoques entre elas) — a linha A
//   simulador-linha/2  linha transfer sincronizada (CLP do transfer é o mestre) — a linha T
// conferir(arq) devolve { erros, avisos, calculado }. Cada erro tem { campo, txt }: `campo` é o caminho no arquivo
// (ex.: "prensas.2.spm_volante") para o formulário marcar a caixa certa.

export const FORMATOS = ["simulador-linha/1", "simulador-linha/2", "simulador-sinais/1", "simulador-apontamento/1"];
export const FORMATOS_LINHA = ["simulador-linha/1", "simulador-linha/2"];

export function tempoDisponivelDia(turnos) { return (turnos || []).reduce((s, t) => s + (t.duracao_min - t.pausa_min), 0); }
export function minutosDoDia(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; }

export function conferir(arq) {
  const erros = [], avisos = [];
  const erro = (campo, txt) => erros.push({ campo, txt });
  const ehNum = (x) => typeof x === "number" && Number.isFinite(x);
  const numero = (obj, chave, campo, { min = null, maior = null, max = null, inteiro = false, nome = chave } = {}) => {
    const v = obj ? obj[chave] : undefined;
    if (!ehNum(v)) { erro(campo, "“" + nome + "” precisa ser um número."); return null; }
    if (inteiro && !Number.isInteger(v)) { erro(campo, "“" + nome + "” precisa ser um número inteiro."); return null; }
    if (min != null && v < min) { erro(campo, "“" + nome + "” precisa ser pelo menos " + min + "."); return null; }
    if (maior != null && !(v > maior)) { erro(campo, "“" + nome + "” precisa ser maior que " + maior + "."); return null; }
    if (max != null && v > max) { erro(campo, "“" + nome + "” pode ser no máximo " + max + "."); return null; }
    return v;
  };
  const tri = (obj, chave, campo, nome) => {
    const t = obj ? obj[chave] : null;
    if (!t || typeof t !== "object") { erro(campo, "preencha " + nome + " (mínimo, mais comum, máximo)."); return; }
    const a = numero(t, "min", campo + ".min", { maior: 0, nome: nome + " — mínimo" });
    const b = numero(t, "mais_comum", campo + ".mais_comum", { maior: 0, nome: nome + " — mais comum" });
    const c = numero(t, "max", campo + ".max", { maior: 0, nome: nome + " — máximo" });
    if (a != null && b != null && c != null && !(a <= b && b <= c)) erro(campo + ".mais_comum", nome + ": precisa ficar em ordem — mínimo ≤ mais comum ≤ máximo.");
  };
  const falhas = (obj, campo, nome) => {
    const f = obj ? obj.falhas : null;
    if (f == null) return;
    const a = numero(f, "mtbf_min", campo + ".falhas.mtbf_min", { maior: 0, nome: nome + " — tempo médio entre falhas (min)" });
    const b = numero(f, "mttr_min", campo + ".falhas.mttr_min", { maior: 0, nome: nome + " — tempo médio de reparo (min)" });
    return a != null && b != null;
  };
  const codigo = (obj, campo, usados) => {
    const id = obj ? obj.id : "";
    if (!/^EST_[A-Za-z0-9_]+$/.test(id || "")) { erro(campo + ".id", "o código começa por EST_ e não tem espaço nem acento (ex.: EST_Prensa_1)."); return; }
    if (usados.has(id)) erro(campo + ".id", "o código " + id + " está repetido."); usados.add(id);
  };

  if (!arq || typeof arq !== "object") return { erros: [{ campo: "", txt: "o arquivo está vazio ou não é um arquivo da linha." }], avisos, calculado: null };
  if (!FORMATOS.includes(arq.formato)) { erro("formato", "formato desconhecido (“" + arq.formato + "”). Use simulador-linha/1 ou /2."); return { erros, avisos, calculado: null }; }
  if (arq.formato === "simulador-sinais/1") return conferirSinais(arq);
  if (arq.formato === "simulador-apontamento/1") return conferirApontamento(arq);

  // ---- linha
  const L = arq.linha || {};
  if (!String(L.nome || "").trim()) erro("linha.nome", "dê um nome para a linha.");
  numero(L, "pecas_por_golpe", "linha.pecas_por_golpe", { min: 1, inteiro: true, nome: "Peças por golpe" });
  numero(L, "demanda_pecas_dia", "linha.demanda_pecas_dia", { min: 1, inteiro: true, nome: "Demanda por dia" });
  if (L.lote_pecas != null) numero(L, "lote_pecas", "linha.lote_pecas", { min: 1, inteiro: true, nome: "Tamanho do lote" });
  numero(L, "setup_min", "linha.setup_min", { min: 0, nome: "Troca de ferramenta (min)" });
  numero(L, "dias_simulados", "linha.dias_simulados", { min: 1, max: 60, inteiro: true, nome: "Dias a simular" });
  numero(L, "semente", "linha.semente", { min: 0, inteiro: true, nome: "Semente" });

  // ---- turnos
  const T = Array.isArray(arq.turnos) ? arq.turnos : [];
  if (!T.length) erro("turnos", "preencha pelo menos um turno.");
  T.forEach((t, i) => {
    const c = "turnos." + i, a = minutosDoDia(t.inicio), b = minutosDoDia(t.fim);
    if (a == null) erro(c + ".inicio", "início no formato 06:00.");
    if (b == null) erro(c + ".fim", "fim no formato 14:00.");
    const pz = numero(t, "pausa_min", c + ".pausa_min", { min: 0, nome: "Pausas (min)" });
    if (a != null && b != null) {
      const dur = ((b - a) % 1440 + 1440) % 1440;
      if (dur === 0) erro(c + ".fim", "início e fim iguais.");
      else if (pz != null && pz >= dur) erro(c + ".pausa_min", "as pausas são maiores que o turno.");
      t.duracao_min = dur;
    }
  });

  // ---- abastecimento (comum aos dois formatos)
  const ab = arq.abastecimento || { empilhadeiras: 0 };
  const nEmp = numero(ab, "empilhadeiras", "abastecimento.empilhadeiras", { min: 0, inteiro: true, nome: "Empilhadeiras" });
  if (nEmp > 0) {
    const e = ab.entrada || {};
    numero(e, "pecas_por_pilha", "abastecimento.entrada.pecas_por_pilha", { min: 1, inteiro: true, nome: "Peças por pilha" });
    numero(e, "magazines", "abastecimento.entrada.magazines", { min: 1, max: 4, inteiro: true, nome: "Magazines" });
    numero(e, "chegada_empilhadeira_min", "abastecimento.entrada.chegada_empilhadeira_min", { min: 0, nome: "Tempo para a empilhadeira chegar (min)" });
    numero(e, "troca_min", "abastecimento.entrada.troca_min", { min: 0, nome: "Tempo para trocar a pilha (min)" });
    if (ab.saida) {
      const s = ab.saida;
      numero(s, "pecas_por_rack", "abastecimento.saida.pecas_por_rack", { min: 1, inteiro: true, nome: "Peças por rack" });
      numero(s, "posicoes", "abastecimento.saida.posicoes", { min: 1, max: 4, inteiro: true, nome: "Posições de rack" });
      numero(s, "chegada_empilhadeira_min", "abastecimento.saida.chegada_empilhadeira_min", { min: 0, nome: "Tempo para a empilhadeira chegar (min)" });
      numero(s, "troca_min", "abastecimento.saida.troca_min", { min: 0, nome: "Tempo para trocar o rack (min)" });
    }
  }

  const usados = new Set();
  if (arq.formato === "simulador-linha/1") {
    // ---- estações soltas
    const E = Array.isArray(arq.estacoes) ? arq.estacoes : [];
    if (E.length < 2) erro("estacoes", "preencha pelo menos duas estações (alimentação e saída).");
    E.forEach((e, i) => {
      const c = "estacoes." + i;
      codigo(e, c, usados);
      if (!["alimentacao", "processo", "saida"].includes(e.tipo)) erro(c + ".tipo", "tipo: alimentação, processo ou saída.");
      tri(e, "ciclo_s", c + ".ciclo_s", "Ciclo (s)");
      numero(e, "paralelas", c + ".paralelas", { min: 1, inteiro: true, nome: "Máquinas em paralelo" });
      numero(e, "estoque_depois", c + ".estoque_depois", { min: 0, inteiro: true, nome: "Estoque depois" });
      falhas(e, c, "Falhas");
      numero(e, "refugo_pct", c + ".refugo_pct", { min: 0, max: 99.99, nome: "Refugo (%)" });
      e.ordem = i + 1;
    });
    if (E.length) {
      if (E[0].tipo !== "alimentacao") erro("estacoes.0.tipo", "a primeira estação precisa ser do tipo alimentação.");
      if (E[E.length - 1].tipo !== "saida") erro("estacoes." + (E.length - 1) + ".tipo", "a última estação precisa ser do tipo saída.");
      if (E.filter((e) => e.tipo === "alimentacao").length > 1 || E.filter((e) => e.tipo === "saida").length > 1) erro("estacoes", "só pode haver uma estação de alimentação e uma de saída.");
      if (ab.entrada) ab.entrada.estacao = E[0].id;
      if (ab.saida) ab.saida.estacao = E[E.length - 1].id;
    }
  } else {
    // ---- linha transfer
    const X = arq.transfer || {};
    codigo(X, "transfer", usados);
    for (const eixo of ["eixo_x", "eixo_y"]) {
      const c = "transfer." + eixo, nome = eixo === "eixo_x" ? "Eixo X" : "Eixo Y", o = X[eixo] || {};
      numero(o, "curso_mm", c + ".curso_mm", { maior: 0, nome: nome + " — curso (mm)" });
      numero(o, "vel_mm_s", c + ".vel_mm_s", { maior: 0, nome: nome + " — velocidade (mm/s)" });
      numero(o, "acel_mm_s2", c + ".acel_mm_s2", { maior: 0, nome: nome + " — aceleração (mm/s²)" });
    }
    numero(X, "confirmacao_s", "transfer.confirmacao_s", { min: 0, max: 2, nome: "Confirmação entre passos (s)" });
    falhas(X, "transfer", "Transfer");
    const P = Array.isArray(arq.prensas) ? arq.prensas : [];
    if (!P.length) erro("prensas", "preencha pelo menos uma prensa.");
    P.forEach((p, i) => {
      const c = "prensas." + i;
      codigo(p, c, usados);
      numero(p, "capacidade_t", c + ".capacidade_t", { maior: 0, nome: "Capacidade (t)" });
      numero(p, "spm_volante", c + ".spm_volante", { maior: 0, max: 200, nome: "Golpes por minuto do volante" });
      numero(p, "curso_mm", c + ".curso_mm", { maior: 0, nome: "Curso do martelo (mm)" });
      numero(p, "embreagem_s", c + ".embreagem_s", { min: 0, max: 2, nome: "Embreagem (s)" });
      numero(p, "freio_s", c + ".freio_s", { min: 0, max: 2, nome: "Freio (s)" });
      falhas(p, c, "Falhas");
      numero(p, "refugo_pct", c + ".refugo_pct", { min: 0, max: 99.99, nome: "Refugo (%)" });
      p.ordem = i + 1;
    });
    const ip = numero(arq.interpress, "quantidade", "interpress.quantidade", { min: 1, inteiro: true, nome: "Interpress" });
    if (ip != null && P.length && ip !== P.length + 1) avisos.push({ campo: "interpress.quantidade", txt: "com " + P.length + " prensas o normal é " + (P.length + 1) + " interpress (entrada, entre as prensas e saída). Confira." });
    const D = arq.destacker || {};
    codigo(D, "destacker", usados);
    tri(D, "pega_s", "destacker.pega_s", "Pega do blank (s)");
    numero(D, "troca_magazine_s", "destacker.troca_magazine_s", { min: 0, nome: "Troca de magazine A↔B (s)" });
    falhas(D, "destacker", "Destacker");
    if (ab.entrada) ab.entrada.estacao = D.id;
    const S = arq.saida || {};
    codigo(S, "saida", usados);
    numero(S, "esteira_s", "saida.esteira_s", { min: 0, nome: "Tempo na esteira (s)" });
    const op = S.operadora || {};
    tri(op, "tempo_peca_s", "saida.operadora.tempo_peca_s", "Tempo da operadora por peça (s)");
    numero(op, "acha_defeito_pct", "saida.operadora.acha_defeito_pct", { min: 0, max: 100, nome: "Peças com defeito que a operadora acha (%)" });
    tri(op, "parada_botoeira_min", "saida.operadora.parada_botoeira_min", "Parada pela botoeira (min)");
  }

  // ---- calculado (antes de simular)
  const disp = tempoDisponivelDia(T.filter((t) => t.duracao_min));
  const calculado = { tempo_disponivel_dia_min: disp, takt_s: disp && ehNum(L.demanda_pecas_dia) && L.demanda_pecas_dia > 0 ? +(disp * 60 / L.demanda_pecas_dia).toFixed(3) : null };
  if (arq.formato === "simulador-linha/1" && calculado.takt_s && Array.isArray(arq.estacoes))
    calculado.estacoes_mais_lentas_que_o_takt = arq.estacoes.filter((e) => e.tipo !== "alimentacao" && e.ciclo_s && e.paralelas && e.ciclo_s.mais_comum / e.paralelas > calculado.takt_s * (L.pecas_por_golpe || 1)).map((e) => e.id);
  return { erros, avisos, calculado };
}

// ---------------------------------------------------------------- mapa de sinais do CLP (etapa S5)
// Endereços: Modbus TCP HR/IR (registros), C/DI (bits) + número; SLMP D/W/R (palavras), M/X/Y/B/L (bits); X, Y, B e W em hexadecimal.
export const SINAIS_CONHECIDOS = ["situacao", "comp_parada", "angulo_transfer", "passo", "x_mm", "y_mm", "golpes", "pecas_saida", "botoeiras", "magazine_atual", "blanks_mag_A", "blanks_mag_B", "em_ciclo",
  "prensa_pms_1", "prensa_pms_2", "prensa_pms_3", "prensa_pms_4", "prensa_pms_5", "prensa_pms_6", "prensa_pms_7", "prensa_pms_8", "prensa_pms_9", "prensa_pms_10", "prensa_pms_11", "prensa_pms_12"];
export function enderecoValido(protocolo, tipo, end) {
  const e = String(end || "").trim().toUpperCase();
  if (protocolo === "modbus") { const m = /^(HR|IR|DI|C)(\d{1,5})$/.exec(e); if (!m || +m[2] > 65535) return false; return tipo === "bit" ? ["C", "DI"].includes(m[1]) : ["HR", "IR"].includes(m[1]); }
  const m = /^(D|W|R|M|X|Y|B|L)([0-9A-F]{1,6})$/.exec(e); if (!m) return false;
  if (["D", "R", "M", "L"].includes(m[1]) && !/^\d+$/.test(m[2])) return false;
  return tipo === "bit" ? ["M", "X", "Y", "B", "L"].includes(m[1]) : ["D", "W", "R"].includes(m[1]);
}
function conferirSinais(arq) {
  const erros = [], avisos = [], erro = (campo, txt) => erros.push({ campo, txt });
  const c = arq.conexao || {};
  if (!["modbus", "slmp"].includes(c.protocolo)) erro("conexao.protocolo", "protocolo: modbus (Modbus TCP) ou slmp (Mitsubishi).");
  if (!/^[A-Za-z0-9.\-]{1,253}$/.test(c.endereco_ip || "")) erro("conexao.endereco_ip", "endereço do CLP (ex.: 127.0.0.1 ou 192.168.0.10).");
  const num = (k, a, b, nome) => { const v = c[k]; if (typeof v !== "number" || !Number.isInteger(v) || v < a || v > b) erro("conexao." + k, nome + ": número inteiro de " + a + " a " + b + "."); };
  num("porta", 1, 65535, "Porta"); num("intervalo_ms", 20, 5000, "Intervalo de leitura (ms)"); num("tempo_max_ms", 100, 10000, "Tempo máximo de resposta (ms)");
  if (c.protocolo === "modbus") num("unidade", 0, 255, "Unidade (unit id)");
  const S = Array.isArray(arq.sinais) ? arq.sinais : [], ids = new Set();
  if (!S.length) erro("sinais", "acrescente pelo menos um sinal.");
  S.forEach((s, i) => {
    const k = "sinais." + i;
    if (!/^[a-z][a-z0-9_]*$/i.test(s.id || "")) erro(k + ".id", "código do sinal sem espaço (ex.: angulo_transfer)."); else if (ids.has(s.id)) erro(k + ".id", "o sinal " + s.id + " está repetido."); ids.add(s.id);
    if (!["registro", "registro32", "bit"].includes(s.tipo)) erro(k + ".tipo", "tipo: registro, registro32 (dois registros) ou bit.");
    if (s.endereco && !enderecoValido(c.protocolo, s.tipo === "bit" ? "bit" : "palavra", s.endereco)) erro(k + ".endereco", "endereço inválido para " + (c.protocolo === "slmp" ? "SLMP (ex.: D100, M10, X1F)" : "Modbus (ex.: HR0, IR5, C0, DI3)") + " e tipo " + s.tipo + ".");
    if (typeof s.escala !== "number" || !s.escala) erro(k + ".escala", "escala: número diferente de zero (ex.: 0,1 quando o CLP manda décimos).");
    if (s.id && !SINAIS_CONHECIDOS.includes(s.id)) avisos.push({ campo: k + ".id", txt: "o sinal " + s.id + " não é usado pela tela (fica só no registro)." });
  });
  if (!S.some((s) => s.id === "angulo_transfer" && s.endereco)) avisos.push({ campo: "sinais", txt: "sem o ângulo do transfer, o modo Espelho não consegue mover os eixos e as prensas." });
  return { erros, avisos, calculado: null };
}

// ---------------------------------------------------------------- apontamento de turnos reais (etapa E6 — validação)
// Fica na pasta privado/ (nunca vai para vídeo, demonstração ou pacote). Uma linha por turno + uma linha por parada.
export const MOTIVOS_PARADA = [["quebra", "quebra / manutenção"], ["botoeira", "botoeira (peça com defeito)"], ["faltou_blank", "faltou blank"], ["troca", "troca de ferramenta"], ["outra", "outra parada"]];
export const EQUIPAMENTOS = [["transfer", "Transfer"], ["destacker", "Destacker"], ...Array.from({ length: 12 }, (_, i) => ["prensa_" + (i + 1), "Prensa " + (i + 1)]), ["outro", "outro / linha toda"]];
function conferirApontamento(arq) {
  const erros = [], avisos = [], erro = (campo, txt) => erros.push({ campo, txt });
  const num = (o, k, campo, nome, { min = 0, max = null, inteiro = false, opcional = false } = {}) => {
    const v = o[k];
    if (v == null || v === "") { if (!opcional) erro(campo, nome + ": preencha."); return null; }
    if (typeof v !== "number" || !Number.isFinite(v)) { erro(campo, nome + " precisa ser um número."); return null; }
    if (inteiro && !Number.isInteger(v)) { erro(campo, nome + " precisa ser inteiro."); return null; }
    if (v < min) { erro(campo, nome + " precisa ser pelo menos " + min + "."); return null; }
    if (max != null && v > max) { erro(campo, nome + " pode ser no máximo " + max + "."); return null; }
    return v;
  };
  if (!/\.json$/.test(arq.linha || "")) erro("linha", "arquivo da linha comparada (ex.: privado/linha_real.json).");
  if (!["sim", "nao"].includes(arq.troca_inclui_esvaziar_encher)) erro("troca_inclui_esvaziar_encher", "responda sim ou não.");
  const T = Array.isArray(arq.turnos) ? arq.turnos : [], ids = new Map();
  if (!T.length) erro("turnos", "acrescente pelo menos um turno.");
  T.forEach((t, i) => {
    const c = "turnos." + i;
    if (!/^[A-Za-z0-9_\-]{1,20}$/.test(t.id || "")) erro(c + ".id", "código do turno sem espaço (ex.: T1)."); else if (ids.has(t.id)) erro(c + ".id", "o código " + t.id + " está repetido."); else ids.set(t.id, { t, parado: 0 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.data || "")) erro(c + ".data", "data no formato 2026-11-03.");
    num(t, "minutos_disponiveis", c + ".minutos_disponiveis", "Tempo trabalhado (min)", { min: 1, max: 1440 });
    num(t, "pecas_boas", c + ".pecas_boas", "Peças boas", { inteiro: true });
    num(t, "refugo", c + ".refugo", "Refugo", { inteiro: true });
    for (const k of ["comecou_cheia", "usar"]) if (!["sim", "nao"].includes(t[k])) erro(c + "." + k, "sim ou não.");
  });
  const P = Array.isArray(arq.paradas) ? arq.paradas : [];
  P.forEach((p, i) => {
    const c = "paradas." + i, dono = ids.get(p.turno);
    if (!dono) erro(c + ".turno", "código de turno que não existe na tabela de turnos (" + (p.turno || "vazio") + ").");
    if (!MOTIVOS_PARADA.some(([v]) => v === p.motivo)) erro(c + ".motivo", "escolha o motivo.");
    if (!EQUIPAMENTOS.some(([v]) => v === p.equipamento)) erro(c + ".equipamento", "escolha o equipamento.");
    const m = num(p, "min", c + ".min", "Minutos parado", { min: 0.01 });
    const ini = num(p, "inicio_min", c + ".inicio_min", "Começou aos (min do turno)", { opcional: true });
    if (dono && m && ini != null && ini + m > dono.t.minutos_disponiveis + 0.01) erro(c + ".min", "passa do fim do turno: lance só a parte deste turno (o resto vai no turno seguinte, começando aos 0 min).");
    if (dono && m) dono.parado += m;
  });
  for (const { t, parado } of ids.values()) {
    const i = T.indexOf(t);
    if (t.minutos_disponiveis > 0 && parado > t.minutos_disponiveis + 0.01) erro("turnos." + i + ".minutos_disponiveis", "as paradas (" + parado + " min) não cabem no tempo trabalhado.");
  }
  const usados = T.filter((t) => t.usar === "sim").length;
  if (T.length && usados < 5) avisos.push({ campo: "turnos", txt: "com menos de 5 turnos a comparação é fraca: o ideal é 10 ou mais (" + usados + " marcados para usar)." });
  return { erros, avisos, calculado: { turnos_usados: usados } };
}
