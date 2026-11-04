// Simulador de Linha — SIMULAÇÃO DA LINHA TRANSFER (etapa S3, 04/11/2026). Roda no navegador e no Node.
// Junta o motor de sincronismo (S2, o tempo de cada ciclo) com os acontecimentos da linha, ciclo a ciclo:
//  • 17 posições (interpress + prensas). Cada "X avança" leva todas as peças uma posição; a da última vai para a esteira.
//  • Destacker põe o blank no interpress de entrada no passo 4 (pega sorteada entre mín./mais comum/máx.).
//    Magazine vazio → passa para o outro (tempo de troca A↔B) e pede a empilhadeira; os dois vazios → a linha espera (faltou blank).
//  • Falhas do transfer, do destacker e de cada prensa (MTBF pelo tempo trabalhado, MTTR sorteado): QUALQUER uma para a linha toda.
//  • Lote: depois do último blank do lote a linha esvazia (sem blank novo), fica parada na troca e enche de novo (ciclos sem saída).
//  • Refugo: no golpe, cada prensa pode estragar a peça; a peça ruim segue na linha até a mesa.
//  • Esteira → mesa → operadora (tempo sorteado). A mesa NUNCA para a linha. Ao achar peça com defeito a operadora aperta a
//    botoeira e a linha para (tempo sorteado). Defeito que ela não acha = "defeito que passou".
//  • Só o tempo disponível (turnos − pausas) é simulado, um dia depois do outro.
//  • E6 (validação): opcoes.comecar_cheia (a linha já começa com peça em todas as posições) e
//    opcoes.reproducao = { paradas:[{motivo,comp,min,inicio_min}], trocas:[{inicio_min,setup_min}] } — REPRODUZ um turno real:
//    sem quebras sorteadas, sem refugo/botoeira sorteados e sem falta de blank sorteada; entram só as paradas e trocas
//    que aconteceram de verdade. O ciclo, o enchimento/esvaziamento e o destacker continuam do modelo (é isso que se prova).
import { criarSorteio } from "./simulador.js";
import { calcularCiclo, perfil, golpe } from "./sincronismo.js";

export const ESTADOS_LINHA = ["bom", "refugo", "ciclo_lento", "enchimento", "faltou_blank", "quebrada", "botoeira", "troca_ferramenta", "outras_paradas"];

export function simularTransfer(arq, opcoes = {}) {
  if (arq.formato !== "simulador-linha/2") throw new Error("simularTransfer: o arquivo precisa ser simulador-linha/2 (linha transfer).");
  const L = arq.linha, k = L.pecas_por_golpe || 1, R = criarSorteio(L.semente ?? 1);
  const dispDia = arq.calculado?.tempo_disponivel_dia_min ?? (arq.turnos || []).reduce((s, t) => s + t.duracao_min - t.pausa_min, 0);
  const FIM = opcoes.horas != null ? opcoes.horas * 3600 : (L.dias_simulados || 1) * dispDia * 60;
  const registro = opcoes.registrar ? [] : null;
  const reg = (t, tipo, d) => { if (registro) registro.push({ t: +t.toFixed(3), tipo, ...d }); };
  const RP = opcoes.reproducao || null;                       // reprodução de um turno real (E6)
  const fixas = RP ? espalhar(RP.paradas || [], FIM).map((p) => ({ ...p, estado: { quebrada: "quebrada", botoeira: "botoeira", faltou_blank: "faltou_blank" }[p.motivo] || "outras_paradas" })) : [];
  const trocasFixas = RP ? espalhar((RP.trocas || []).map((x) => ({ ...x, min: x.setup_min })), FIM) : [];

  // ---- tempos fixos do ciclo (motor de sincronismo)
  const X = arq.transfer, conf = X.confirmacao_s || 0;
  const tX = perfil(X.eixo_x.curso_mm, X.eixo_x.vel_mm_s, X.eixo_x.acel_mm_s2).tempo_s;
  const tY = perfil(X.eixo_y.curso_mm, X.eixo_y.vel_mm_s, X.eixo_y.acel_mm_s2).tempo_s;
  const tGolpe = Math.max(...arq.prensas.map((p) => golpe(p).tempo_s));
  const D = arq.destacker, pega = D.pega_s;
  const cicloDe = (destacker_s) => 2 * tY + tX + Math.max(tX, tGolpe, destacker_s) + 4 * conf;
  const cicloIdeal = cicloDe(pega.min);                       // melhor ciclo possível (destacker no mínimo) — base do OEE
  const tSaidaNoCiclo = tY + conf + tX;                       // instante, dentro do ciclo, em que a peça sai da última posição
  const s2 = calcularCiclo(arq);

  // ---- posições: interpress e prensas alternados, começando e terminando por interpress
  const nIP = arq.interpress?.quantidade || 0, nP = arq.prensas.length, layout = [];
  { let ip = nIP, pr = 0; while (ip > 0 || pr < nP) { if (ip > 0) { layout.push({ tipo: "interpress" }); ip--; } if (pr < nP) { layout.push({ tipo: "prensa", prensa: arq.prensas[pr] }); pr++; } } }
  const pos = layout.map(() => null);

  // ---- componentes que quebram (param a linha toda)
  const comps = [
    { id: X.id, nome: X.nome || "Transfer", falhas: X.falhas },
    { id: D.id, nome: D.nome || "Destacker", falhas: D.falhas },
    ...arq.prensas.map((p) => ({ id: p.id, nome: p.nome, falhas: p.falhas })),
  ].map((c) => ({ ...c, ttf: c.falhas && !RP ? R.exponencial(c.falhas.mtbf_min * 60) : Infinity, n: 0, min: 0 }));

  // ---- lote, magazines, empilhadeira
  const loteUn = L.lote_pecas && !RP ? Math.max(1, Math.ceil(L.lote_pecas / k)) : Infinity;
  let setupS = (L.setup_min || 0) * 60;
  const lote = { soltas: 0, esvaziando: false, trocas: 0 };
  const ab = arq.abastecimento || { empilhadeiras: 0 }, comAbast = (ab.empilhadeiras || 0) > 0 && ab.entrada;
  const mags = comAbast ? Array.from({ length: ab.entrada.magazines }, () => ({ n: ab.entrada.pecas_por_pilha, pedido: false })) : null;
  let magAtual = 0, trocasMag = 0;
  const empLivre = comAbast ? Array.from({ length: ab.empilhadeiras }, () => 0) : [];
  let empOcupado = 0, empPedidos = 0, empEspera = 0;
  const reposicoes = [];                                       // { at, mag }
  function pedirEmpilhadeira(t, mag) {
    const i = empLivre.indexOf(Math.min(...empLivre)), ini = Math.max(t, empLivre[i]);
    const dur = (ab.entrada.chegada_empilhadeira_min + ab.entrada.troca_min) * 60;
    empLivre[i] = ini + dur; empOcupado += dur; empPedidos++; empEspera += ini - t;
    reposicoes.push({ at: ini + dur, mag }); mags[mag].pedido = true;
    reg(t, "pedido_empilhadeira", { mag, inicio: +ini.toFixed(3), fim: +(ini + dur).toFixed(3) });
  }
  function aplicarReposicoes(t) {
    for (let i = reposicoes.length - 1; i >= 0; i--) if (reposicoes[i].at <= t + 1e-9) {
      const m = reposicoes[i].mag; mags[m].n = ab.entrada.pecas_por_pilha; mags[m].pedido = false; reg(reposicoes[i].at, "pilha_trocada", { mag: m }); reposicoes.splice(i, 1);
    }
  }

  // ---- esteira, mesa e operadora
  const S = arq.saida, op = S.operadora;
  const filaMesa = [];                                         // { chega, ruim }
  let opLivre = 0, opOcupada = 0, mesaMax = 0, empacotadas = 0, refugoAchado = 0, defeitosPassaram = 0, esperaMesa = 0;
  const botoeiras = [];                                        // instantes em que a operadora apertou
  function operadoraAte(t) {
    while (filaMesa.length) {
      const p = filaMesa[0], ini = Math.max(p.chega, opLivre);
      if (ini > t) break;
      filaMesa.shift();
      const dur = R.triangular(op.tempo_peca_s.min, op.tempo_peca_s.mais_comum, op.tempo_peca_s.max);
      opLivre = ini + dur; opOcupada += dur; esperaMesa += ini - p.chega;
      if (registro) reg(ini, "operadora", { un: p.un, chega: +p.chega.toFixed(3), fim: +opLivre.toFixed(3), ruim: p.ruim });   // para a tela 3D (S4)
      if (p.ruim && R.u() * 100 < op.acha_defeito_pct) { refugoAchado++; if (!RP) { botoeiras.push(opLivre); reg(opLivre, "botoeira", { un: p.un }); } }
      else if (p.ruim) defeitosPassaram++;
      else empacotadas++;
    }
  }

  // ---- contas do tempo (somam o tempo planejado)
  const tempo = Object.fromEntries(ESTADOS_LINHA.map((e) => [e, 0]));
  let t = 0, ciclos = 0, saidas = 0, ruinsSaidas = 0, nUn = 0, destAtrasou = 0, paradasBotoeira = 0;
  const conta = (estado, dur) => { const d = Math.min(dur, FIM - t); tempo[estado] += Math.max(0, d); t += Math.max(0, d); return d >= dur - 1e-12; };
  if (opcoes.comecar_cheia) for (let i = 0; i < pos.length; i++) pos[i] = { un: ++nUn, ruim: false };
  const outras = [];                                           // paradas reproduzidas (motivo "outra")

  while (t < FIM - 1e-9) {
    if (comAbast) aplicarReposicoes(t);
    operadoraAte(t);
    // botoeira apertada (até agora): a linha para
    if (botoeiras.length && botoeiras[0] <= t + 1e-9) {
      botoeiras.shift(); paradasBotoeira++;
      const dur = R.triangular(op.parada_botoeira_min.min, op.parada_botoeira_min.mais_comum, op.parada_botoeira_min.max) * 60;
      reg(t, "parada", { motivo: "botoeira", dur: +dur.toFixed(3) });
      conta("botoeira", dur); continue;
    }
    // reprodução: parada real que já chegou a hora (para a linha do jeito que está)
    if (fixas.length && fixas[0].inicio_s <= t + 1e-9) {
      const p = fixas.shift(), dur = p.min * 60;
      reg(t, "parada", { motivo: p.estado === "outras_paradas" ? "outra" : p.motivo, comp: p.comp || undefined, dur: +dur.toFixed(3) });
      const ini = t; conta(p.estado, dur);
      if (p.estado === "quebrada") { const c = comps.find((x) => x.id === p.comp); if (c) { c.n++; c.min += (t - ini) / 60; } }
      else if (p.estado === "botoeira") paradasBotoeira++; else if (p.estado === "outras_paradas") outras.push({ comp: p.comp || null, min: (t - ini) / 60 });
      continue;
    }
    // reprodução: hora de uma troca real → a linha para de pôr blank, esvazia e troca
    if (trocasFixas.length && !lote.esvaziando && trocasFixas[0].inicio_s <= t + 1e-9) {
      const x = trocasFixas.shift(); setupS = x.min * 60; lote.esvaziando = true; reg(t, "fim_lote", { lote: lote.trocas + 1 });
    }
    // lote terminou e a linha já esvaziou: troca de ferramenta
    if (lote.esvaziando && pos.every((x) => x === null)) {
      reg(t, "parada", { motivo: "troca_ferramenta", dur: setupS }); conta("troca_ferramenta", setupS);
      lote.esvaziando = false; lote.soltas = 0; lote.trocas++; continue;
    }
    // o destacker põe blank neste ciclo?
    const alimentar = !lote.esvaziando;
    let extraDest = 0;
    if (alimentar && comAbast) {
      if (mags[magAtual].n <= 0) {
        const outro = mags.findIndex((m) => m.n > 0);
        if (outro < 0) {                                        // os dois vazios: espera a empilhadeira
          const prox = Math.min(...reposicoes.map((r) => r.at));
          if (RP) { for (const r of reposicoes) r.at = t; aplicarReposicoes(t); continue; }   // reprodução: falta de blank só a real
          if (!Number.isFinite(prox)) { conta("faltou_blank", FIM - t); break; }
          reg(t, "parada", { motivo: "faltou_blank", dur: +(prox - t).toFixed(3) });
          conta("faltou_blank", prox - t); continue;
        }
        magAtual = outro; extraDest = D.troca_magazine_s || 0; trocasMag++; reg(t, "troca_magazine", { mag: outro });
      }
    }
    // ---- um ciclo
    const pegaS = alimentar ? R.triangular(pega.min, pega.mais_comum, pega.max) + extraDest : 0;
    if (alimentar && pegaS > Math.max(tX, tGolpe)) destAtrasou++;
    const dur = cicloDe(pegaS);
    const t0 = t;
    // X avança: tudo anda uma posição; a da última vai para a esteira
    const sai = pos[pos.length - 1];
    for (let i = pos.length - 1; i > 0; i--) pos[i] = pos[i - 1];
    pos[0] = null;
    // golpe das prensas (passo 4): cada prensa pode estragar a peça que está nela
    if (!RP) layout.forEach((l, i) => { if (l.tipo === "prensa" && pos[i] && !pos[i].ruim && l.prensa.refugo_pct > 0 && R.u() * 100 < l.prensa.refugo_pct) { pos[i].ruim = true; pos[i].onde = l.prensa.id; } });
    // destacker põe o blank no interpress de entrada
    if (alimentar) {
      pos[0] = { un: ++nUn, ruim: false };
      if (comAbast) { mags[magAtual].n--; if (mags[magAtual].n === 0 && !mags[magAtual].pedido) pedirEmpilhadeira(t0 + dur, magAtual); }
      lote.soltas++; if (lote.soltas >= loteUn) { lote.esvaziando = true; reg(t0, "fim_lote", { lote: lote.trocas + 1 }); }
    }
    reg(t0, "ciclo", { dur: +dur.toFixed(3), pega: alimentar ? +pegaS.toFixed(3) : null, sai: sai ? sai.un : null, entra: alimentar ? nUn : null, ...(sai && sai.ruim ? { ruim: true } : {}) });
    // tempo do ciclo: com peça saindo = ideal (bom ou refugo) + o que passou do ideal; sem peça saindo = enchimento
    const completo = t0 + dur <= FIM + 1e-9;
    if (sai && completo) {
      saidas++; if (sai.ruim) ruinsSaidas++;
      filaMesa.push({ chega: t0 + tSaidaNoCiclo + (S.esteira_s || 0), ruim: sai.ruim, un: sai.un });
      mesaMax = Math.max(mesaMax, filaMesa.filter((p) => p.chega <= t0 + tSaidaNoCiclo + (S.esteira_s || 0)).length);
      conta(sai.ruim ? "refugo" : "bom", cicloIdeal); conta("ciclo_lento", dur - cicloIdeal);
    } else conta("enchimento", dur);
    if (!completo) break;
    ciclos++;
    // falhas pelo tempo trabalhado: quem chegar a zero quebra (no fim deste ciclo) e para a linha toda
    for (const c of comps) c.ttf -= dur;
    for (;;) {
      const c = comps.reduce((a, b) => (b.ttf < a.ttf ? b : a));
      if (!(c.ttf <= 0) || t >= FIM) break;
      const rep = R.exponencial(c.falhas.mttr_min * 60);
      c.n++; const ini = t; conta("quebrada", rep); c.min += (t - ini) / 60;
      reg(ini, "parada", { motivo: "quebrada", comp: c.id, dur: +rep.toFixed(3) });
      c.ttf = R.exponencial(c.falhas.mtbf_min * 60);
    }
  }
  operadoraAte(FIM);

  // ---- resultado
  const horas = FIM / 3600, dias = FIM / (dispDia * 60 || 1);
  const boasLinha = saidas - ruinsSaidas;                      // peças realmente boas que saíram das prensas
  const parado = tempo.faltou_blank + tempo.quebrada + tempo.botoeira + tempo.troca_ferramenta + tempo.outras_paradas, rodando = FIM - parado;
  const A = rodando / FIM, P = rodando > 0 ? saidas * cicloIdeal / rodando : 0, Q = saidas ? boasLinha / saidas : 1;
  const min = (s) => s / 60;
  return {
    formato: "resultado-transfer/1", linha: L.nome, segundos_simulados: FIM, horas_simuladas: horas, dias_simulados: dias,
    ciclo_nominal_s: s2.ciclo_s, ciclo_ideal_s: +cicloIdeal.toFixed(4), ciclos, ciclo_medio_s: ciclos ? (FIM - parado - 0) / ciclos : null,
    golpes_saida: saidas, pecas_boas: boasLinha * k, pecas_por_dia: boasLinha * k / dias, pecas_por_hora: boasLinha * k / horas,
    pecas_entregues: (saidas - refugoAchado) * k, refugo_achado: refugoAchado * k, defeitos_passaram: defeitosPassaram * k, pecas_ruins_saida: ruinsSaidas * k,
    ritmo_real_s: boasLinha ? FIM / boasLinha / k : null, takt_s: arq.calculado?.takt_s ?? null, demanda_pecas_dia: L.demanda_pecas_dia,
    oee: { disponibilidade: A, desempenho: P, qualidade: Q, oee: A * P * Q, oee_direto: boasLinha * cicloIdeal / FIM },
    perdas_min: Object.fromEntries(Object.entries(tempo).map(([e, s]) => [e, min(s)])),
    quebras: comps.filter((c) => c.falhas || c.n).map((c) => ({ id: c.id, nome: c.nome, falhas: c.n, min: c.min })),
    botoeira: { paradas: paradasBotoeira, min: min(tempo.botoeira) },
    trocas_ferramenta: lote.trocas, troca_min: min(tempo.troca_ferramenta), enchimento_min: min(tempo.enchimento),
    destacker: { atrasou_pct: ciclos ? 100 * destAtrasou / ciclos : 0, trocas_magazine: trocasMag, faltou_blank_min: min(tempo.faltou_blank) },
    empilhadeira: comAbast ? { quantidade: ab.empilhadeiras, pedidos: empPedidos, uso_pct: 100 * Math.min(empOcupado, FIM * ab.empilhadeiras) / (FIM * ab.empilhadeiras), espera_media_min: empPedidos ? min(empEspera / empPedidos) : 0 } : null,
    operadora: { ocupacao_pct: 100 * opOcupada / FIM, mesa_max: mesaMax, mesa_fim: filaMesa.length, espera_media_s: (empacotadas + refugoAchado + defeitosPassaram) ? esperaMesa / (empacotadas + refugoAchado + defeitosPassaram) : 0, empacotadas: empacotadas * k },
    posicoes: layout.length, sincronismo: s2, registro, reproducao: RP ? { outras, paradas_nao_couberam: fixas.length, trocas_nao_couberam: trocasFixas.length } : undefined,
  };
}

// paradas de um turno real: com hora (inicio_min) ficam na hora; sem hora, espalhadas por igual no turno, na ordem dada
function espalhar(lista, FIM) {
  const semHora = lista.filter((p) => p.inicio_min == null), n = semHora.length;
  let k = 0;
  return lista.map((p) => ({ ...p, inicio_s: p.inicio_min != null ? p.inicio_min * 60 : ((k++ + 0.5) / n) * FIM * (1 - 0) }))
    .sort((a, b) => a.inicio_s - b.inicio_s);
}
