// Simulador de Linha — CENA da linha transfer num instante (etapa S6, 04/11/2026). Roda no Node e no navegador.
// Transforma o registro da simulação em posições de objetos, em METROS, para quem só mostra (Blender, Unreal):
// barras do transfer (X e Y), altura de cada martelo, giro dos volantes, cada peça, carro do destacker, pilhas e luzes.
// As medidas da cena são as mesmas da tela 3D (tela/transfer.js): passo = curso do X, altura de trabalho 0,95 m.
import { estadoNoCiclo, perfil } from "./sincronismo.js";

export const Y_TRAB = 0.95;

export function layoutCena(arq) {
  const P = arq.transfer.eixo_x.curso_mm / 1000, pos = [];
  let ip = arq.interpress.quantidade, pr = 0, i = 0, nIP = 0;
  while (ip > 0 || pr < arq.prensas.length) {
    if (ip > 0) { pos.push({ tipo: "interpress", id: "EST_Interpress_" + (++nIP), x: i++ * P }); ip--; }
    if (pr < arq.prensas.length) { const p = arq.prensas[pr]; pos.push({ tipo: "prensa", id: p.id, nome: p.nome, x: i++ * P, curso_m: p.curso_mm / 1000, spm: p.spm_volante }); pr++; }
  }
  const N = pos.length, xFim = N * P, x0 = xFim - P / 2, xe = x0 + 2.6, gx = -P - 1.9, nMag = arq.abastecimento?.entrada?.magazines || 2;
  return {
    P, Y_TRAB, N, posicoes: pos, xFim,
    transfer: { id: arq.transfer.id, x_acionamento: -P - 0.5, curso_y_m: arq.transfer.eixo_y.curso_mm / 1000, z_fechado: 0.165 + 0.045, comprimento: (N + 1) * P },
    destacker: { id: arq.destacker.id, x: gx, magazines: Array.from({ length: nMag }, (_, k) => ({ x: gx, z: (k === 0 ? -1 : 1) * 0.55, cheio: arq.abastecimento?.entrada?.pecas_por_pilha || 1 })) },
    saida: { id: arq.saida.id, esteira_x0: x0, esteira_x1: xe, mesa_x: xe + 0.6, saida_x: xFim, entrada_mesa_x: xe - 0.1 },
    peca: { comprimento: 0.42, espessura: 0.018, largura: 0.33 },
  };
}

export function prepararCena(arq, c, r) {
  const lay = layoutCena(arq), ev = r.registro.slice().sort((a, b) => a.t - b.t);
  const ciclos = ev.filter((e) => e.tipo === "ciclo"), linhaEv = ev.filter((e) => e.tipo === "ciclo" || e.tipo === "parada");
  const N = lay.N, posApos = []; let atual = new Int32Array(N);
  ciclos.forEach((e, k) => { const nova = new Int32Array(N); for (let i = N - 1; i > 0; i--) nova[i] = atual[i - 1]; nova[0] = e.entra || 0; posApos.push(nova); atual = nova; e.idx = k; });
  const tSaida = c.passos[1].fim_s - (arq.transfer.confirmacao_s || 0), pecas = new Map();
  for (const e of ciclos) if (e.sai) pecas.set(e.sai, { un: e.sai, sai: e.t + tSaida, chega: e.t + tSaida + (arq.saida.esteira_s || 0), ini: Infinity, fim: Infinity, ruim: false });
  for (const e of ev) if (e.tipo === "operadora") { const p = pecas.get(e.un); if (p) Object.assign(p, { chega: e.chega, ini: e.t, fim: e.fim, ruim: e.ruim }); }
  const saidas = [...pecas.values()].sort((a, b) => a.sai - b.sai);
  const pilha = arq.abastecimento?.entrada?.pecas_por_pilha || 0, n = lay.destacker.magazines.map(() => pilha); let magAt = 0; const mag = [{ t: 0, n: n.slice(), atual: 0 }];
  for (const e of ev) {
    if (e.tipo === "troca_magazine") magAt = e.mag; else if (e.tipo === "ciclo" && e.entra && n.length) { n[magAt]--; e.mag = magAt; } else if (e.tipo === "pilha_trocada") n[e.mag] = pilha; else continue;
    mag.push({ t: e.t, n: n.slice(), atual: magAt });
  }
  const tX = perfil(arq.transfer.eixo_x.curso_mm, arq.transfer.eixo_x.vel_mm_s, arq.transfer.eixo_x.acel_mm_s2).tempo_s;
  return { arq, c, lay, ciclos, linhaEv, posApos, saidas, mag, p2fim: c.passos[1].inicio_s + tX, comps: [arq.transfer.id, arq.destacker.id, ...arq.prensas.map((p) => p.id)] };
}

const ultimo = (l, t) => { let a = 0, b = l.length - 1, r = -1; while (a <= b) { const m = (a + b) >> 1; if (l[m].t <= t) { r = m; a = m + 1; } else b = m - 1; } return r; };

export function cenaEm(cn, t) {
  const { arq, c, lay } = cn, P = lay.P, i = ultimo(cn.linhaEv, t), e = cn.linhaEv[i];
  let cic = null, par = null, tRel = 0;
  if (e && e.tipo === "ciclo" && t < e.t + e.dur) { cic = e; tRel = t - e.t; } else if (e && e.tipo === "parada" && t < e.t + e.dur) par = e;
  const est = cic ? estadoNoCiclo(arq, c, Math.min(tRel, c.ciclo_s - 1e-6)) : { x_mm: 0, y_mm: 0, prensas: arq.prensas.map(() => ({ graus: 0, altura_mm: null })) };
  const martelos = arq.prensas.map((p, k) => ({ id: p.id, graus: est.prensas[k].graus || 0, altura_m: est.prensas[k].altura_mm == null ? p.curso_mm / 1000 : est.prensas[k].altura_mm / 1000 }));
  const parado = !!par || !cic;
  const volantes = arq.prensas.map((p) => ({ id: p.id, graus: parado && par?.motivo === "quebrada" && par.comp === p.id ? 0 : (t * p.spm_volante * 6) % 360 }));
  // peças na linha
  const pecas = [], Y = lay.Y_TRAB + 0.009;
  const jc = cic ? cic.idx : (() => { const j = ultimo(cn.ciclos, t); return j >= 0 ? cn.ciclos[j].idx : -1; })();
  const antes = cic && jc > 0 ? cn.posApos[jc - 1] : null, depois = jc >= 0 ? cn.posApos[jc] : null;
  if (cic && tRel < cn.p2fim) { const dx = tRel >= c.passos[1].inicio_s ? est.x_mm / 1000 : 0; if (antes) for (let k = 0; k < lay.N; k++) if (antes[k]) pecas.push({ id: antes[k], x: k * P + dx, y: Y, z: 0 }); }
  else if (depois) for (let k = 0; k < lay.N; k++) if (depois[k] && !(k === 0 && cic && cic.entra === depois[0])) pecas.push({ id: depois[k], x: k * P, y: Y, z: 0 });
  // destacker: blank novo saindo do magazine (passo 4)
  const me = cn.mag[Math.max(0, ultimo(cn.mag, t))], p4 = c.passos[3].inicio_s, d = lay.destacker;
  let carro = { x: d.x, y: 1.95, z: d.magazines[me.atual]?.z ?? 0 };
  if (cic && cic.entra && tRel >= p4 && cic.pega) {
    const a = Math.min(1, (tRel - p4) / cic.pega), s = a * a * (3 - 2 * a), mg = d.magazines[cic.mag ?? me.atual] || d.magazines[0];
    const de = { x: mg.x, y: 0.3 + 1.0 * ((me.n[cic.mag ?? 0] + 1) / mg.cheio) + 0.03, z: mg.z };
    const pc = { id: cic.entra, x: de.x + (0 - de.x) * s, y: de.y + (Y - de.y) * s + Math.sin(Math.PI * s) * 0.9, z: de.z * (1 - s) };
    pecas.push(pc); carro = { x: pc.x, y: Math.max(pc.y + 0.68, 1.2), z: pc.z };
  }
  // esteira, mesa e operadora
  const S = lay.saida; let naMesa = 0, j = -1;
  { let a = 0, b = cn.saidas.length - 1; while (a <= b) { const m = (a + b) >> 1; if (cn.saidas[m].sai <= t) { j = m; a = m + 1; } else b = m - 1; } }
  for (let q = j, vistos = 0; q >= 0 && vistos < 600; q--, vistos++) {
    const p = cn.saidas[q]; if (t >= p.fim) continue;
    if (t < p.chega) { const a = (t - p.sai) / Math.max(0.001, p.chega - p.sai); pecas.push({ id: p.un, x: S.saida_x + a * (S.entrada_mesa_x - S.saida_x), y: Y, z: 0 }); }
    else if (t < p.ini) { pecas.push({ id: p.un, x: S.mesa_x + 0.35 - (naMesa % 3) * 0.02, y: 0.88 + 0.02 * naMesa, z: 0.15 }); naMesa++; }
    else pecas.push({ id: p.un, x: S.mesa_x, y: 0.9, z: -0.2, ruim: p.ruim });
  }
  // situação (faixa e luzes)
  let situacao = "produzindo", comp = null;
  if (par) { situacao = { quebrada: "quebrada", botoeira: "botoeira", troca_ferramenta: "troca", faltou_blank: "faltou" }[par.motivo] || "parada"; comp = par.comp || null; }
  else if (cic && !cic.entra) situacao = "esvaziando"; else if (cic && !cic.sai) situacao = "enchendo";
  return {
    t, situacao, comp, passo: cic ? (est.passo || 0) : 0, grau_transfer: cic ? 360 * Math.min(1, tRel / Math.max(cic.dur, 1e-9)) : 0,
    barra: { x: est.x_mm / 1000, z: lay.transfer.z_fechado + lay.transfer.curso_y_m - est.y_mm / 1000 },
    martelos, volantes, pecas, carro, pilhas: me.n.map((x, k) => x / (d.magazines[k]?.cheio || 1)),
  };
}

// ---------------------------------------------------------------- cena a partir do que o CLP disse (ao vivo, etapa S6)
// v = leitura da ponte (mapa de sinais da S5). Sem posição dos eixos, usa o ângulo do transfer e o sincronismo.
const SIT = ["produzindo", "quebrada", "botoeira", "troca", "faltou", "enchendo", "esvaziando"];
export function cenaDoCLP(arq, c, lay, v, t = Date.now() / 1000) {
  const sit = SIT[v.situacao] || "parada", produz = [0, 5, 6].includes(v.situacao);
  const emCiclo = v.em_ciclo != null ? !!v.em_ciclo : produz, ang = v.angulo_transfer ?? 0;
  const est = emCiclo ? estadoNoCiclo(arq, c, Math.min(ang / 360 * c.ciclo_s, c.ciclo_s - 1e-6)) : { x_mm: 0, y_mm: 0, prensas: arq.prensas.map(() => ({ graus: 0, altura_mm: null })) };
  if (v.x_mm != null) est.x_mm = v.x_mm; if (v.y_mm != null) est.y_mm = v.y_mm;
  const comps = [arq.transfer.id, arq.destacker.id, ...arq.prensas.map((p) => p.id)];
  return {
    t, situacao: sit, comp: v.situacao === 1 && v.comp_parada ? comps[v.comp_parada - 1] || null : null, passo: v.passo || 0, grau_transfer: ang,
    barra: { x: est.x_mm / 1000, z: lay.transfer.z_fechado + lay.transfer.curso_y_m - est.y_mm / 1000 },
    martelos: arq.prensas.map((p, k) => ({ id: p.id, graus: est.prensas[k].graus || 0, altura_m: est.prensas[k].altura_mm == null ? p.curso_mm / 1000 : est.prensas[k].altura_mm / 1000 })),
    volantes: arq.prensas.map((p) => ({ id: p.id, graus: (t * p.spm_volante * 6) % 360 })),
    pilhas: [v.blanks_mag_A, v.blanks_mag_B].map((n, k) => (n == null ? 1 : n / (lay.destacker.magazines[k]?.cheio || 1))),
    golpes: v.golpes ?? null, pecas_saida: v.pecas_saida ?? null,
  };
}
