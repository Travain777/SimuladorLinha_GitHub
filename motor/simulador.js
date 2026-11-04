// Simulador de Linha — motor de eventos discretos (etapa E2, 03/11/2026). Sem bibliotecas: roda no navegador e no Node.
// Lê o "arquivo da linha" (formato simulador-linha/1, gerado pela planilha) e simula a linha evento por evento.
//
// Como o motor enxerga a linha (está escrito também no docs/MOTOR.md):
// - A unidade que anda na linha é o GOLPE (um blank). Peças = golpes × peças por golpe.
// - Estações em série. Entre a estação i e a i+1 cabem `estoque_depois` golpes. Com 0, a de trás só solta quando a da frente pega
//   (bloqueio depois do ciclo — como prensas ligadas por transfer).
// - Ciclo sorteado em distribuição triangular (mínimo, mais comum, máximo).
// - Falhas pelo tempo TRABALHADO: tempo até a falha e tempo de reparo sorteados em distribuição exponencial com as médias MTBF e MTTR.
//   A peça que estava no ciclo continua depois do reparo.
// - Refugo: ao fim do ciclo, a peça é sorteada como ruim e sai da linha.
// - Troca de ferramenta: quando a 1ª estação solta o último golpe do lote, a linha esvazia; com a linha vazia, todas ficam paradas
//   `setup_min` e o lote seguinte começa.
// - Abastecimento: a 1ª estação consome pilhas de blanks dos magazines; a última enche racks. Cada troca pede uma empilhadeira
//   (fila por ordem de pedido); ela fica ocupada durante a chegada + a troca. Com 0 empilhadeiras, o abastecimento não é simulado.
// - Turnos e pausas: simula só o tempo disponível (turnos menos pausas), um dia depois do outro. Na pausa tudo para junto.

// ---------------------------------------------------------------- sorteio repetível (mesma semente = mesmo resultado)
export function criarSorteio(semente) {
  let a = (semente >>> 0) || 1;
  const u = () => {                                   // mulberry32
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    u,
    triangular(min, moda, max) {
      if (max <= min) return min;
      const x = u(), f = (moda - min) / (max - min);
      return x < f ? min + Math.sqrt(x * (max - min) * (moda - min)) : max - Math.sqrt((1 - x) * (max - min) * (max - moda));
    },
    exponencial(media) { return -media * Math.log(1 - u()); },
  };
}

// ---------------------------------------------------------------- fila de eventos (heap por tempo; empate = ordem de criação)
class Agenda {
  constructor() { this.h = []; this.n = 0; }
  marcar(t, tipo, dados) {
    const h = this.h, e = { t, k: this.n++, tipo, dados }; h.push(e);
    let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (menor(h[p], h[i])) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
    return e;
  }
  tirar() {
    const h = this.h; if (!h.length) return null;
    const topo = h[0], ult = h.pop();
    if (h.length) {
      h[0] = ult; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < h.length && menor(h[l], h[m])) m = l;
        if (r < h.length && menor(h[r], h[m])) m = r;
        if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m;
      }
    }
    return topo;
  }
}
const menor = (a, b) => a.t < b.t || (a.t === b.t && a.k < b.k);

export const ESTADOS = ["produzindo", "faltou_peca", "bloqueada", "quebrada", "troca_ferramenta"];

// ---------------------------------------------------------------- simulação
// opcoes: { horas } para simular outro tempo (testes); { registrar: true } guarda o registro de eventos (etapa E9)
export function simular(arquivo, opcoes = {}) {
  if (arquivo?.formato === "simulador-linha/2") throw new Error("este é um arquivo de LINHA TRANSFER (simulador-linha/2): ele é simulado pelo motor de sincronismo, que entra na etapa S2.");
  const L = arquivo.linha, est = arquivo.estacoes, ab = arquivo.abastecimento || { empilhadeiras: 0 };
  const k = L.pecas_por_golpe || 1;
  const dispDia = arquivo.calculado?.tempo_disponivel_dia_min ?? (arquivo.turnos || []).reduce((s, t) => s + t.duracao_min - t.pausa_min, 0);
  const FIM = opcoes.horas != null ? opcoes.horas * 3600 : (L.dias_simulados || 1) * dispDia * 60;
  const R = criarSorteio(L.semente ?? 1);
  const ag = new Agenda();
  const registro = opcoes.registrar ? [] : null;
  let agora = 0;
  const reg = (tipo, d) => { if (registro) registro.push({ t: +agora.toFixed(3), tipo, ...d }); };

  // estações e máquinas (servidores)
  const S = est.map((e, i) => ({
    i, cfg: e, fila: [], cap: i > 0 ? est[i - 1].estoque_depois : 0,            // fila = estoque ANTES desta estação
    maq: Array.from({ length: e.paralelas || 1 }, (_, j) => ({
      j, est: e.id, estado: "faltou_peca", desde: 0, unidade: null, resto: 0, ttf: e.falhas ? R.exponencial(e.falhas.mtbf_min * 60) : Infinity,
      ev: null, tempo: Object.fromEntries(ESTADOS.map((s) => [s, 0])),
    })),
    refugo: 0, feitas: 0,
  }));
  const ultima = S.length - 1;

  // lote e troca de ferramenta
  const loteUn = L.lote_pecas ? Math.max(1, Math.ceil(L.lote_pecas / k)) : Infinity;
  const setupS = (L.setup_min || 0) * 60;
  const lote = { soltas: 0, esvaziando: false, emSetup: false, trocas: 0, tempoTroca: 0, inicioTroca: 0 };
  let wip = 0, wipArea = 0, wipDesde = 0, saidas = 0, somaLead = 0, nUn = 0, totalSoltos = 0;
  const mudaWip = (d) => { wipArea += wip * (agora - wipDesde); wipDesde = agora; wip += d; };

  // abastecimento
  const comAbast = (ab.empilhadeiras || 0) > 0;
  const ent = comAbast ? ab.entrada : null, sai = comAbast ? ab.saida : null;
  const mags = comAbast ? Array.from({ length: ent.magazines }, () => ({ blanks: ent.pecas_por_pilha, pedido: false })) : null;
  let magAtual = 0;
  const rackUn = comAbast ? Math.max(1, Math.floor(sai.pecas_por_rack / k)) : Infinity;
  const racks = comAbast ? Array.from({ length: sai.posicoes }, () => ({ n: 0, pedido: false })) : null;
  let rackAtual = 0;
  const emp = { livres: ab.empilhadeiras || 0, fila: [], ocupadoArea: 0, pedidos: 0, esperaTotal: 0, esperaMax: 0, ocupadas: 0, desde: 0 };
  const mudaEmp = (d) => { emp.ocupadoArea += emp.ocupadas * (agora - emp.desde); emp.desde = agora; emp.ocupadas += d; };

  // ---------------- estados das máquinas
  const parada = () => lote.esvaziando || lote.emSetup;
  function estadoLivre(s) { return parada() ? "troca_ferramenta" : "faltou_peca"; }
  function setEstado(m, novo) {
    if (registro && novo !== m.estado) reg("estado", { est: m.est, maq: m.j, estado: novo });   // para a tela 3D (etapa E4)
    m.tempo[m.estado] += agora - m.desde; m.estado = novo; m.desde = agora;
  }
  function reetiquetarLivres() { for (const s of S) for (const m of s.maq) if (m.unidade === null && m.estado !== "quebrada") setEstado(m, estadoLivre(s)); }

  // ---------------- processar (com falhas pelo tempo trabalhado)
  function iniciarSegmento(s, m) {
    const seg = Math.min(m.resto, m.ttf);
    m.ttf -= seg; m.resto -= seg;
    // se o ciclo termina antes (ou junto) da falha: fim de ciclo; se a falha vem antes: falha no meio do ciclo
    m.ev = ag.marcar(agora + seg, m.resto > 1e-9 ? "falha" : "fim_ciclo", { s: s.i, m: m.j });
  }
  function comecar(s, m, unidade) {
    m.unidade = unidade; m.resto = R.triangular(s.cfg.ciclo_s.min, s.cfg.ciclo_s.mais_comum, s.cfg.ciclo_s.max);
    setEstado(m, "produzindo"); reg("inicio", { est: s.cfg.id, maq: m.j, un: unidade.id, dur: +m.resto.toFixed(3) });
    iniciarSegmento(s, m);
  }

  // ---------------- pegar trabalho
  function pegarUnidade(s) {
    if (s.i === 0) {
      if (parada() || lote.soltas >= loteUn) return null;
      if (comAbast) {
        let mg = mags[magAtual];
        if (mg.blanks <= 0) { const outro = mags.findIndex((x) => x.blanks > 0); if (outro < 0) return null; magAtual = outro; mg = mags[outro]; }
        mg.blanks--; reg("mag", { i: mags.indexOf(mg), n: mg.blanks });
        if (mg.blanks === 0) pedirEmpilhadeira({ tipo: "pilha", alvo: magAtual });
      }
      lote.soltas++; totalSoltos++; mudaWip(+1);
      const u = { id: ++nUn, entrou: agora };
      if (lote.soltas >= loteUn && Number.isFinite(loteUn)) { lote.esvaziando = true; reg("fim_lote", { lote: lote.trocas + 1 }); }
      return u;
    }
    if (s.fila.length) { const u = s.fila.shift(); reg("fila", { est: s.cfg.id, n: s.fila.length, un: u.id, sai: true }); return u; }
    // estoque zero: pega direto da máquina de trás que está bloqueada segurando a peça
    const tras = S[s.i - 1].maq.filter((m) => m.estado === "bloqueada").sort((a, b) => a.desde - b.desde)[0];
    if (tras) { const u = tras.unidade; tras.unidade = null; S[s.i - 1].feitas++; setEstado(tras, estadoLivre(S[s.i - 1])); return u; }
    return null;
  }

  // ---------------- soltar a peça pronta
  function soltar(s, m) {                // devolve true se conseguiu
    if (s.i === ultima) {
      if (comAbast) {
        let rk = racks[rackAtual];
        if (rk.n >= rackUn) { const outro = racks.findIndex((x) => x.n < rackUn && !x.pedido); if (outro < 0) return false; rackAtual = outro; rk = racks[outro]; }
        rk.n++; reg("rack", { i: racks.indexOf(rk), n: rk.n });
        if (rk.n >= rackUn) { rk.pedido = true; pedirEmpilhadeira({ tipo: "rack", alvo: rackAtual }); }
      }
      saidas++; somaLead += agora - m.unidade.entrou; mudaWip(-1); s.feitas++;
      reg("saida", { est: s.cfg.id, un: m.unidade.id });
      m.unidade = null; setEstado(m, estadoLivre(s)); return true;
    }
    const prox = S[s.i + 1];
    if (prox.fila.length < prox.cap) { prox.fila.push(m.unidade); reg("fila", { est: prox.cfg.id, n: prox.fila.length, un: m.unidade.id }); s.feitas++; m.unidade = null; setEstado(m, estadoLivre(s)); return true; }
    const livre = prox.maq.find((x) => x.unidade === null && x.estado !== "quebrada");
    if (livre && prox.fila.length === 0 && !(prox.i === 0)) { const u = m.unidade; m.unidade = null; s.feitas++; setEstado(m, estadoLivre(s)); comecar(prox, livre, u); return true; }
    return false;
  }

  // ---------------- empurra tudo o que dá para andar (de trás para a frente da linha, até parar de mudar)
  function propagar() {
    for (let volta = 0; volta < 1000; volta++) {
      let mudou = false;
      for (let i = ultima; i >= 0; i--) {
        const s = S[i];
        for (const m of s.maq) if (m.estado === "bloqueada" && soltar(s, m)) mudou = true;
        for (const m of s.maq) {
          if (m.unidade !== null || m.estado === "quebrada") continue;
          const u = pegarUnidade(s);
          if (u) { comecar(s, m, u); mudou = true; }
        }
      }
      if (!mudou) break;
    }
    if (lote.esvaziando && !lote.emSetup && wip === 0) {           // linha vazia: começa a troca de ferramenta
      lote.emSetup = true; lote.inicioTroca = agora; reetiquetarLivres();
      reg("troca_inicio", { lote: lote.trocas + 1 });
      ag.marcar(agora + setupS, "fim_troca", {});
    }
  }

  // ---------------- empilhadeiras
  function pedirEmpilhadeira(p) { p.quando = agora; emp.pedidos++; emp.fila.push(p); reg("pedido_empilhadeira", { pedido: p.tipo }); despachar(); }
  function despachar() {
    while (emp.livres > 0 && emp.fila.length) {
      const p = emp.fila.shift(); emp.livres--; mudaEmp(+1);
      const espera = agora - p.quando; emp.esperaTotal += espera; emp.esperaMax = Math.max(emp.esperaMax, espera);
      const c = p.tipo === "pilha" ? ent : sai;
      reg("empilhadeira", { pedido: p.tipo, alvo: p.alvo, ida_s: c.chegada_empilhadeira_min * 60, troca_s: c.troca_min * 60 });
      ag.marcar(agora + (c.chegada_empilhadeira_min + c.troca_min) * 60, "fim_empilhadeira", p);
    }
  }

  // ---------------- laço principal
  propagar();
  let ev;
  while ((ev = ag.tirar()) && ev.t <= FIM) {
    agora = ev.t;
    const d = ev.dados;
    if (ev.tipo === "fim_ciclo" || ev.tipo === "falha") {
      const s = S[d.s], m = s.maq[d.m];
      if (ev.tipo === "falha") {
        setEstado(m, "quebrada"); reg("falha", { est: s.cfg.id, maq: m.j });
        ag.marcar(agora + R.exponencial(s.cfg.falhas.mttr_min * 60), "reparo", d);
      } else {
        if (s.cfg.refugo_pct > 0 && R.u() * 100 < s.cfg.refugo_pct) {
          s.refugo++; mudaWip(-1); reg("refugo", { est: s.cfg.id, un: m.unidade.id }); m.unidade = null; setEstado(m, estadoLivre(s));
        } else if (!soltar(s, m)) setEstado(m, "bloqueada");
        if (s.cfg.falhas && m.ttf <= 1e-9) {            // a falha caiu junto com o fim do ciclo: quebra agora (com ou sem peça na mão)
          setEstado(m, "quebrada"); reg("falha", { est: s.cfg.id, maq: m.j });
          ag.marcar(agora + R.exponencial(s.cfg.falhas.mttr_min * 60), "reparo", d);
        }
      }
    } else if (ev.tipo === "reparo") {
      const s = S[d.s], m = s.maq[d.m];
      m.ttf = R.exponencial(s.cfg.falhas.mtbf_min * 60); reg("reparo", { est: s.cfg.id, maq: m.j });
      if (m.unidade && m.resto > 1e-9) { setEstado(m, "produzindo"); iniciarSegmento(s, m); }
      else if (m.unidade) { if (!soltar(s, m)) setEstado(m, "bloqueada"); }
      else setEstado(m, estadoLivre(s));
    } else if (ev.tipo === "fim_troca") {
      lote.tempoTroca += agora - lote.inicioTroca; lote.trocas++; lote.emSetup = false; lote.esvaziando = false; lote.soltas = 0;
      reg("troca_fim", { lote: lote.trocas }); reetiquetarLivres();
    } else if (ev.tipo === "fim_empilhadeira") {
      emp.livres++; mudaEmp(-1);
      if (d.tipo === "pilha") { mags[d.alvo].blanks = ent.pecas_por_pilha; reg("pilha_trocada", { magazine: d.alvo }); }
      else { racks[d.alvo].n = 0; racks[d.alvo].pedido = false; reg("rack_trocado", { posicao: d.alvo }); }
      despachar();
    }
    propagar();
  }
  agora = FIM;
  for (const s of S) for (const m of s.maq) setEstado(m, m.estado);
  mudaWip(0); mudaEmp(0);
  if (lote.emSetup) lote.tempoTroca += FIM - lote.inicioTroca;

  // ---------------- resultado
  const horas = FIM / 3600, dias = dispDia ? FIM / (dispDia * 60) : null;
  // OEE (etapa E3): disponibilidade × desempenho × qualidade. Ciclo ideal = ciclo mínimo da planilha.
  //   disponibilidade = (tempo planejado − quebrada − troca de ferramenta) ÷ tempo planejado
  //   desempenho      = golpes feitos (bons + refugo) × ciclo ideal ÷ tempo operando  (faltou peça, bloqueada e ciclo lento entram aqui)
  //   qualidade       = golpes bons ÷ golpes feitos
  const estacoes = S.map((s) => {
    const tot = s.maq.reduce((o, m) => { for (const e of ESTADOS) o[e] = (o[e] || 0) + m.tempo[e]; return o; }, {});
    const n = s.maq.length, plan = FIM * n, ideal = s.cfg.ciclo_s.min;
    const pct = Object.fromEntries(ESTADOS.map((e) => [e, 100 * tot[e] / plan]));
    const feitos = s.feitas + s.refugo, operando = plan - tot.quebrada - tot.troca_ferramenta;
    const A = operando / plan, P = operando > 0 ? feitos * ideal / operando : 0, Q = feitos ? s.feitas / feitos : 1;
    const perdas_min = {                          // somam o tempo planejado (por máquina, em minutos)
      bom: s.feitas * ideal / n / 60, refugo: s.refugo * ideal / n / 60,
      ciclo_lento: Math.max(0, tot.produzindo - feitos * ideal) / n / 60,
      faltou_peca: tot.faltou_peca / n / 60, bloqueada: tot.bloqueada / n / 60, quebrada: tot.quebrada / n / 60, troca_ferramenta: tot.troca_ferramenta / n / 60,
    };
    return { id: s.cfg.id, nome: s.cfg.nome, paralelas: n, feitas: s.feitas, refugo: s.refugo, pct, ciclo_ideal_s: ideal,
      oee: { disponibilidade: A, desempenho: P, qualidade: Q, oee: A * P * Q }, perdas_min };
  });
  const ativa = (e) => e.pct.produzindo + e.pct.quebrada;
  const gargalo = estacoes.slice().sort((a, b) => ativa(b) - ativa(a))[0];
  const boas = saidas * k;
  // OEE da linha = golpes bons na saída × ciclo ideal da linha (o da estação de ciclo mínimo mais lento) ÷ tempo planejado
  const cicloIdealLinha = Math.max(...S.map((s) => s.cfg.ciclo_s.min / s.maq.length));
  const g0 = estacoes.find((e) => e.id === (gargalo && gargalo.id));
  const oeeLinha = { oee: saidas * cicloIdealLinha / FIM, ciclo_ideal_s: cicloIdealLinha,
    qualidade: totalSoltos ? saidas / totalSoltos : 1, disponibilidade_gargalo: g0 ? g0.oee.disponibilidade : null };
  return {
    formato: "resultado-simulador-linha/1", linha: L.nome, segundos_simulados: FIM, horas_simuladas: horas, dias_simulados: dias,
    golpes_saida: saidas, pecas_boas: boas, pecas_por_hora: boas / horas, pecas_por_dia: dias ? boas / dias : null,
    ciclo_real_s: saidas ? FIM / boas : null, takt_s: arquivo.calculado?.takt_s ?? null,
    demanda_pecas_dia: L.demanda_pecas_dia ?? null,
    refugo_pecas: S.reduce((s, x) => s + x.refugo, 0) * k,
    estoque_medio_golpes: wipArea / FIM, tempo_medio_na_linha_s: saidas ? somaLead / saidas : null,
    trocas_ferramenta: lote.trocas, tempo_troca_ferramenta_s: lote.tempoTroca,
    empilhadeiras: comAbast ? { quantidade: ab.empilhadeiras, pedidos: emp.pedidos, uso_pct: 100 * emp.ocupadoArea / (FIM * ab.empilhadeiras),
      espera_media_min: emp.pedidos ? emp.esperaTotal / emp.pedidos / 60 : 0, espera_max_min: emp.esperaMax / 60 } : null,
    golpes_soltos: totalSoltos, oee_linha: oeeLinha,
    estacoes, gargalo: gargalo ? gargalo.id : null, registro,
  };
}
