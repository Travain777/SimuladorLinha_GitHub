// Simulador de Linha — MOTOR DE SINCRONISMO da linha transfer (etapa S2, 04/11/2026). Roda no navegador e no Node.
// O CLP do transfer é o mestre (servo com encoder, ciclo de 360°). Sequência de um ciclo, como a linha real:
//   1. Y avança   — os fingers de todos os interpress encaixam nas peças
//   2. X avança   — a barra leva todas as peças uma estação para a frente
//   3. Y recua    — os fingers soltam e saem da ferramenta
//   4. ao mesmo tempo: X volta para zero ‖ as prensas golpeiam juntas (PMS 0° → PMI 180° → PMS) ‖ o destacker põe o próximo blank
//      → o ciclo seguinte só começa com X em zero, TODAS as prensas em PMS e o blank no interpress de entrada
// Cada passo termina com a confirmação (sinal de fim de movimento). O ciclo é CALCULADO, não sorteado.
//
// Movimento dos servos: perfil trapezoidal (acelera, anda na velocidade máxima, freia, com aceleração = frenagem).
//   Se o curso é curto e não dá para chegar na velocidade máxima, o perfil é triangular.
// Golpe da prensa mecânica: embreagem + uma volta do volante (60 / golpes por minuto) + freio.

const r3 = (x) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------- movimento de um eixo
export function perfil(curso_mm, vel_mm_s, acel_mm_s2) {
  const d = curso_mm, v = vel_mm_s, a = acel_mm_s2;
  const dAcel = v * v / a;                           // distância para acelerar E frear até v e de volta a zero
  if (d >= dAcel) {
    const ta = v / a, tc = (d - dAcel) / v, t = 2 * ta + tc;
    return { tipo: "trapezoidal", tempo_s: t, vel_pico_mm_s: v, t_acel_s: ta,
      pos: (s) => s <= 0 ? 0 : s >= t ? d : s < ta ? a * s * s / 2 : s < ta + tc ? a * ta * ta / 2 + v * (s - ta) : d - a * (t - s) * (t - s) / 2 };
  }
  const ta = Math.sqrt(d / a), t = 2 * ta;            // não chega na velocidade máxima
  return { tipo: "triangular", tempo_s: t, vel_pico_mm_s: a * ta, t_acel_s: ta,
    pos: (s) => s <= 0 ? 0 : s >= t ? d : s < ta ? a * s * s / 2 : d - a * (t - s) * (t - s) / 2 };
}

// ---------------------------------------------------------------- golpe de uma prensa mecânica
export function golpe(p) {
  const volta = 60 / p.spm_volante;
  return { embreagem_s: p.embreagem_s, volta_s: volta, freio_s: p.freio_s, tempo_s: p.embreagem_s + volta + p.freio_s };
}
// Ângulo do virabrequim no instante s do golpe (0° = PMS, 180° = PMI). Durante a embreagem fica em 0°; no freio, em 360°.
export function angulo(g, s) {
  if (s <= g.embreagem_s) return 0;
  if (s >= g.embreagem_s + g.volta_s) return 360;
  return 360 * (s - g.embreagem_s) / g.volta_s;
}
// Altura do martelo acima do PMI (mm) pelo ângulo. Aproximação de biela longa: curso/2 × (1 + cos θ).
export function alturaMartelo(curso_mm, graus) { return curso_mm / 2 * (1 + Math.cos(graus * Math.PI / 180)); }

// ---------------------------------------------------------------- ciclo da linha
// opcoes.pega_s: tempo do destacker a usar (padrão: o "mais comum"); serve para ver o pior caso (máximo).
export function calcularCiclo(arq, opcoes = {}) {
  const X = arq.transfer, conf = X.confirmacao_s || 0;
  const px = perfil(X.eixo_x.curso_mm, X.eixo_x.vel_mm_s, X.eixo_x.acel_mm_s2);
  const py = perfil(X.eixo_y.curso_mm, X.eixo_y.vel_mm_s, X.eixo_y.acel_mm_s2);
  const golpes = arq.prensas.map((p) => ({ id: p.id, nome: p.nome, ...golpe(p) }));
  const lenta = golpes.reduce((a, b) => (b.tempo_s > a.tempo_s ? b : a));
  const empatadas = golpes.filter((g) => Math.abs(g.tempo_s - lenta.tempo_s) < 1e-9);       // prensas com o mesmo golpe da mais lenta
  const curto = (nome) => nome.split(" — ")[0];
  const nomeGolpe = empatadas.length > 1 ? "Golpe das prensas empatadas (" + empatadas.map((g) => curto(g.nome).replace("Prensa ", "P")).join(", ") + ")" : "Golpe da " + curto(lenta.nome) + " (a mais lenta)";
  const pega = opcoes.pega_s ?? arq.destacker.pega_s.mais_comum;

  // passo 4: os três ramos correm juntos; o mais demorado segura a linha
  const ramos = [
    { id: "x_volta", nome: "X volta para zero", tempo_s: px.tempo_s },
    { id: "golpe", nome: nomeGolpe, tempo_s: lenta.tempo_s, prensa: lenta.id, empatadas: empatadas.map((g) => g.id) },
    { id: "destacker", nome: "Destacker põe o blank", tempo_s: pega },
  ];
  const segura = ramos.reduce((a, b) => (b.tempo_s > a.tempo_s ? b : a));
  const passos = [
    { n: 1, id: "y_avanca", nome: "Y avança (fingers encaixam)", mov_s: py.tempo_s },
    { n: 2, id: "x_avanca", nome: "X avança (peças andam uma estação)", mov_s: px.tempo_s },
    { n: 3, id: "y_recua", nome: "Y recua (fingers soltam)", mov_s: py.tempo_s },
    { n: 4, id: "paralelo", nome: "X volta ‖ prensas golpeiam ‖ destacker", mov_s: segura.tempo_s, segura: segura.id },
  ];
  let t = 0;
  for (const p of passos) { p.inicio_s = t; p.confirmacao_s = conf; p.tempo_s = p.mov_s + conf; t += p.tempo_s; p.fim_s = t; }
  const ciclo = t;
  for (const p of passos) { p.grau_inicio = 360 * p.inicio_s / ciclo; p.grau_fim = 360 * p.fim_s / ciclo; p.pct = 100 * p.tempo_s / ciclo; }
  for (const r of ramos) r.folga_s = segura.tempo_s - r.tempo_s;

  // carta de tempos de um ciclo (cada barra = um recurso fazendo algo)
  const p4 = passos[3].inicio_s, carta = [];
  const barra = (recurso, tipo, rotulo, ini, dur) => carta.push({ recurso, tipo, rotulo, inicio_s: r3(ini), fim_s: r3(ini + dur), dur_s: r3(dur) });
  barra("Eixo Y (interpress)", "y", "avança", passos[0].inicio_s, py.tempo_s);
  barra("Eixo Y (interpress)", "y", "recua", passos[2].inicio_s, py.tempo_s);
  barra("Eixo X (barra)", "x", "avança", passos[1].inicio_s, px.tempo_s);
  barra("Eixo X (barra)", "x", "volta", p4, px.tempo_s);
  for (const g of golpes) {
    const rec = g.nome.split(" — ")[0];
    barra(rec, "emb", "embreagem", p4, g.embreagem_s);
    barra(rec, "desce", "desce 0° → 180°", p4 + g.embreagem_s, g.volta_s / 2);
    barra(rec, "sobe", "sobe 180° → 360°", p4 + g.embreagem_s + g.volta_s / 2, g.volta_s / 2);
    barra(rec, "freio", "freio (PMS)", p4 + g.embreagem_s + g.volta_s, g.freio_s);
  }
  barra("Destacker", "dest", "pega e põe o blank", p4, pega);
  for (const p of passos) barra("Confirmações", "conf", "confirma passo " + p.n, p.fim_s - conf, conf);

  // o que acontece se o que segura melhorar até o próximo limite (quanto se ganha e quem passa a segurar)
  const golpesOrd = [...golpes].sort((a, b) => b.tempo_s - a.tempo_s);
  const candidatos = ramos.filter((r) => r.id !== segura.id);
  const abaixo = golpesOrd.find((g) => g.tempo_s < lenta.tempo_s - 1e-9);                   // próxima prensa mais lenta (fora do empate)
  if (segura.id === "golpe" && abaixo) candidatos.push({ id: "golpe", nome: "Golpe da " + curto(abaixo.nome), tempo_s: abaixo.tempo_s, prensa: abaixo.id });
  const proximo = candidatos.reduce((a, b) => (b.tempo_s > a.tempo_s ? b : a), { tempo_s: 0 });
  const ganho_s = segura.tempo_s - proximo.tempo_s;

  // variação do destacker (sorteio triangular): em quantos ciclos ele atrasa a linha e o ciclo médio que isso dá
  const tri = arq.destacker.pega_s, outros = Math.max(px.tempo_s, lenta.tempo_s);
  const dest = variacaoTriangular(tri.min, tri.mais_comum, tri.max, outros);

  // enchimento: cada X avança anda uma posição; posições = interpress + prensas
  const posicoes = (arq.interpress?.quantidade || 0) + arq.prensas.length;
  return {
    ciclo_s: r3(ciclo), golpes_por_minuto: r3(60 / ciclo), pecas_por_minuto: r3(60 / ciclo * (arq.linha.pecas_por_golpe || 1)),
    pecas_por_hora: r3(3600 / ciclo * (arq.linha.pecas_por_golpe || 1)),
    segura: { id: segura.id, nome: segura.nome, tempo_s: r3(segura.tempo_s), prensa: segura.prensa || null, empatadas: segura.id === "golpe" ? segura.empatadas : [] },
    proximo: { id: proximo.id, nome: proximo.nome, tempo_s: r3(proximo.tempo_s), prensa: proximo.prensa || null },
    ganho_se_igualar_s: r3(ganho_s), ciclo_se_igualar_s: r3(ciclo - ganho_s), gpm_se_igualar: r3(60 / (ciclo - ganho_s)),
    eixo_x: { tipo: px.tipo, tempo_s: r3(px.tempo_s), vel_pico_mm_s: r3(px.vel_pico_mm_s) },
    eixo_y: { tipo: py.tipo, tempo_s: r3(py.tempo_s), vel_pico_mm_s: r3(py.vel_pico_mm_s) },
    passos: passos.map((p) => ({ ...p, inicio_s: r3(p.inicio_s), fim_s: r3(p.fim_s), tempo_s: r3(p.tempo_s), mov_s: r3(p.mov_s), grau_inicio: r3(p.grau_inicio), grau_fim: r3(p.grau_fim), pct: r3(p.pct) })),
    ramos: ramos.map((r) => ({ ...r, tempo_s: r3(r.tempo_s), folga_s: r3(r.folga_s) })),
    prensas: golpes.map((g) => ({ id: g.id, nome: g.nome, golpe_s: r3(g.tempo_s), volta_s: r3(g.volta_s), folga_s: r3(golpesOrd[0].tempo_s - g.tempo_s) })),
    carta,
    enchimento: { posicoes, ciclos: posicoes, tempo_s: r3(posicoes * ciclo) },
    destacker_variacao: { atrasa_pct: r3(100 * dest.prob), ciclo_medio_s: r3(ciclo - segura.tempo_s + dest.media),
      gpm_medio: r3(60 / (ciclo - segura.tempo_s + dest.media)), ciclo_pior_s: r3(ciclo - segura.tempo_s + Math.max(outros, tri.max)), limite_s: r3(outros) },
    takt_s: arq.calculado?.takt_s ?? null,
    confirmacoes_s: r3(4 * conf),
  };
}

// Para T triangular (a, c = mais comum, b) e um tempo fixo g: probabilidade de T > g e média de max(g, T) (conta exata).
export function variacaoTriangular(a, c, b, g) {
  const F = (x) => x <= a ? 0 : x >= b ? 1 : x <= c ? (x - a) ** 2 / ((b - a) * (c - a || 1e-12)) : 1 - (b - x) ** 2 / ((b - a) * (b - c || 1e-12));
  if (b <= a) return { prob: a > g ? 1 : 0, media: Math.max(g, a) };
  // média de max(g, T) = g·F(g) + ∫ t f(t) dt de g até b (integração numérica fina; a conta fechada está no teste)
  const n = 4000, ini = Math.max(g, a); let integral = 0;
  if (ini < b) { const h = (b - ini) / n; for (let i = 0; i < n; i++) { const t0 = ini + i * h, t1 = t0 + h; integral += (t0 + t1) / 2 * (F(t1) - F(t0)); } }
  return { prob: 1 - F(g), media: g * F(g) + integral };
}

// ---------------------------------------------------------------- estado da linha num instante do ciclo (para a tela 3D, etapa S4)
export function estadoNoCiclo(arq, c, s) {
  const X = arq.transfer, t = ((s % c.ciclo_s) + c.ciclo_s) % c.ciclo_s;
  const px = perfil(X.eixo_x.curso_mm, X.eixo_x.vel_mm_s, X.eixo_x.acel_mm_s2), py = perfil(X.eixo_y.curso_mm, X.eixo_y.vel_mm_s, X.eixo_y.acel_mm_s2);
  const [p1, p2, p3, p4] = c.passos;
  const y = t < p1.inicio_s + py.tempo_s ? py.pos(t - p1.inicio_s) : t < p3.inicio_s ? X.eixo_y.curso_mm : t < p4.inicio_s ? X.eixo_y.curso_mm - py.pos(t - p3.inicio_s) : 0;
  const x = t < p2.inicio_s ? 0 : t < p3.inicio_s ? px.pos(t - p2.inicio_s) : t < p4.inicio_s ? X.eixo_x.curso_mm : X.eixo_x.curso_mm - px.pos(t - p4.inicio_s);
  const prensas = arq.prensas.map((p) => { const g = golpe(p), a = t >= p4.inicio_s ? angulo(g, t - p4.inicio_s) : 0; return { id: p.id, graus: a, altura_mm: alturaMartelo(p.curso_mm, a) }; });
  return { t, grau_transfer: 360 * t / c.ciclo_s, x_mm: x, y_mm: y, prensas, passo: c.passos.find((p) => t >= p.inicio_s && t < p.fim_s)?.n || 4 };
}
