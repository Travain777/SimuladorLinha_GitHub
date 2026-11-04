// Simulador de Linha — LINHA TRANSFER em 3D (etapa S4, 04/11/2026).
// Roda a simulação da linha transfer (S3) aqui no navegador e reproduz o 1º dia em 3D, pelo movimento real:
//  • eixos X e Y pelo perfil dos servos e o martelo de cada prensa pelo ângulo (motor de sincronismo, S2);
//  • peças, paradas (quebra, botoeira, troca de ferramenta, faltou blank), magazines, empilhadeira e mesa pelo registro da simulação.
// Escala real, em metros. Modelos genéricos feitos em código (a Linha T é fictícia); os do Blender entram na S6.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { simularTransfer } from "../motor/simulador_transfer.js";
import { calcularCiclo, estadoNoCiclo, perfil } from "../motor/sincronismo.js";

const COR = { produzindo: "#2a78d6", faltou: "#eb6834", quebrada: "#eda100", troca: "#e87ba4", parada: "#5d5f63", botoeira: "#d93025" };
const LEGENDA = [["produzindo", "Produzindo"], ["quebrada", "Quebrada"], ["troca", "Troca de ferramenta"], ["faltou", "Faltou blank"], ["parada", "Parada (esperando a linha)"], ["botoeira", "Botoeira da operadora"]];
const VELOCIDADES = [0.25, 1, 5, 20, 60, 300];
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------------------------------------------------------------- cena
const canvas = $("cena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const cena = new THREE.Scene();
cena.background = new THREE.Color("#1a1c1f"); cena.fog = new THREE.Fog("#1a1c1f", 40, 90);
const pmrem = new THREE.PMREMGenerator(renderer);
cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; cena.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
const controles = new OrbitControls(camera, canvas);
controles.enableDamping = true; controles.maxPolarAngle = Math.PI * 0.48; controles.minDistance = 0.8; controles.maxDistance = 60;
cena.add(new THREE.HemisphereLight("#e6ecf5", "#3b3631", 0.75));
const sol = new THREE.DirectionalLight("#ffffff", 1.7);
sol.castShadow = true; sol.shadow.mapSize.set(4096, 2048); sol.shadow.bias = -0.0003; cena.add(sol, sol.target);

const M = {
  piso: new THREE.MeshStandardMaterial({ color: "#4b4f54", roughness: 0.92 }),
  corpo: new THREE.MeshStandardMaterial({ color: "#8b939b", roughness: 0.45, metalness: 0.55 }),
  escuro: new THREE.MeshStandardMaterial({ color: "#363b40", roughness: 0.6, metalness: 0.4 }),
  claro: new THREE.MeshStandardMaterial({ color: "#c7ccd1", roughness: 0.4, metalness: 0.5 }),
  amarelo: new THREE.MeshStandardMaterial({ color: "#e0ac00", roughness: 0.5, metalness: 0.2 }),
  chapa: new THREE.MeshStandardMaterial({ color: "#d3d9df", roughness: 0.28, metalness: 0.85 }),
  ruim: new THREE.MeshStandardMaterial({ color: "#d93025", roughness: 0.4, metalness: 0.3 }),
  esteira: new THREE.MeshStandardMaterial({ color: "#26292c", roughness: 0.8, metalness: 0.1 }),
  barra: new THREE.MeshStandardMaterial({ color: "#b8bec4", roughness: 0.3, metalness: 0.8 }),
  pneu: new THREE.MeshStandardMaterial({ color: "#151617", roughness: 0.9 }),
  caixaPapel: new THREE.MeshStandardMaterial({ color: "#a47c52", roughness: 0.9 }),
  pele: new THREE.MeshStandardMaterial({ color: "#3f6fb0", roughness: 0.7 }),
  faixa: new THREE.MeshBasicMaterial({ color: "#c9a400" }),
};
function caixa(w, h, d, mat, x = 0, y = 0, z = 0, pai = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (pai) pai.add(m); return m;
}
function cilindro(r, h, mat, x = 0, y = 0, z = 0, pai = null, eixo = "y") {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mat);
  if (eixo === "z") m.rotation.x = Math.PI / 2; if (eixo === "x") m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (pai) pai.add(m); return m;
}
function lampada(pai, x, y, z, r = 0.06) {
  cilindro(0.012, 0.25, M.escuro, x, y + 0.125, z, pai);
  const mat = new THREE.MeshStandardMaterial({ color: "#888", emissive: "#888", emissiveIntensity: 1.6 });
  const l = cilindro(r, r * 2.2, mat, x, y + 0.25 + r * 1.1, z, pai); l.castShadow = false; return mat;
}
const piso = new THREE.Mesh(new THREE.PlaneGeometry(200, 80), M.piso); piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; cena.add(piso);
const grade = new THREE.GridHelper(200, 200, "#6a6e72", "#555a5e"); grade.position.y = 0.002; grade.material.transparent = true; grade.material.opacity = 0.3; cena.add(grade);

// ---------------------------------------------------------------- estado
let arq, c, rDia, rTudo, grupo = null, P = 0.65, Y_TRAB = 0.95;
let layout = [], prensasV = [], barras = [], interpressV = [], dest = null, mags = [], mesaV = null, empilhadeira = null, luzes = {};
let ciclos = [], paradas = [], linhaEv = [], posApos = [], saidasCum = [], botoeiraT = [], pecas = new Map(), saidasOrd = [], magEv = [], viagens = [];
let T = 0, FIM = 1, tocando = true, vel = 1, seguir = null, tween = null, rotulos = [];
const pool = []; const meshPeca = new Map();
const geoPeca = new THREE.BoxGeometry(0.42, 0.018, 0.33);

// ---------------------------------------------------------------- montar a linha (escala real)
function montar() {
  if (grupo) { cena.remove(grupo); }
  for (const r of rotulos) r.el.remove(); rotulos = [];
  grupo = new THREE.Group(); cena.add(grupo);
  prensasV = []; interpressV = []; mags = []; luzes = {}; pool.length = 0; meshPeca.clear();
  P = arq.transfer.eixo_x.curso_mm / 1000;
  // posições: interpress e prensas alternados (igual à simulação)
  layout = []; { let ip = arq.interpress.quantidade, pr = 0; while (ip > 0 || pr < arq.prensas.length) { if (ip > 0) { layout.push({ tipo: "interpress" }); ip--; } if (pr < arq.prensas.length) { layout.push({ tipo: "prensa", prensa: arq.prensas[pr], idx: pr }); pr++; } } }
  const N = layout.length, xFim = N * P;
  layout.forEach((l, i) => {
    const x = i * P;
    if (l.tipo === "interpress") {
      const g = new THREE.Group(); g.position.x = x; grupo.add(g);
      caixa(0.36, 0.05, 0.36, M.escuro, 0, Y_TRAB - 0.035, 0, g);           // ninho
      caixa(0.12, Y_TRAB - 0.06, 0.12, M.corpo, 0, (Y_TRAB - 0.06) / 2, 0, g); // coluna
      caixa(0.14, 0.14, 0.14, M.escuro, 0, 0.42, 0.16, g); caixa(0.14, 0.03, 0.02, M.amarelo, 0, 0.5, 0.235, g);   // servo do Y
      interpressV.push(g);
    } else {
      const p = l.prensa, g = new THREE.Group(); g.position.x = x; grupo.add(g);
      const curso = p.curso_mm / 1000, topoAbertura = Y_TRAB + 0.12 + curso + 0.5;
      caixa(0.8, Y_TRAB - 0.08, 1.4, M.corpo, 0, (Y_TRAB - 0.08) / 2, 0, g);                 // mesa (base)
      caixa(0.6, 0.06, 0.5, M.escuro, 0, Y_TRAB - 0.05, 0, g);                                // ferramenta de baixo
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) caixa(0.14, topoAbertura - Y_TRAB + 0.1, 0.2, M.corpo, sx * 0.33, (Y_TRAB + topoAbertura) / 2, sz * 0.55, g);  // 4 colunas: janela aberta na frente e nos lados (o transfer passa)
      caixa(0.8, 0.6, 1.42, M.corpo, 0, topoAbertura + 0.3, 0, g);                            // coroa
      cilindro(0.32, 0.12, M.escuro, 0, topoAbertura + 0.3, -0.78, g, "z");                  // volante
      const martelo = new THREE.Group(); g.add(martelo);
      caixa(0.7, 0.32, 0.6, M.claro, 0, 0.16 + 0.07, 0, martelo);
      caixa(0.6, 0.07, 0.5, M.escuro, 0, 0.035, 0, martelo);                                 // ferramenta de cima
      const yPMI = Y_TRAB + 0.012;                                                            // ferramenta fecha na peça
      martelo.position.y = yPMI + curso;
      for (const sx of [-1, 1]) caixa(0.03, 0.9, 0.03, M.amarelo, sx * 0.38, Y_TRAB + 0.4, 0.72, g);   // cortina de luz
      const luz = lampada(g, 0.3, topoAbertura + 0.6, 0.55);
      const nome = p.nome.split(" — ")[0];
      prensasV.push({ g, martelo, yPMI, curso, luz, id: p.id, x }); luzes[p.id] = luz;
      novoRotulo(nome.replace("Prensa ", "P"), new THREE.Vector3(x, topoAbertura + 1.0, 0), p.id);
    }
  });
  // barras do transfer (duas, uma de cada lado) com os fingers em cada posição
  barras = [];
  const comprimento = (N + 1) * P;
  for (const sz of [-1, 1]) {
    const b = new THREE.Group(); grupo.add(b);
    caixa(comprimento, 0.04, 0.03, M.barra, comprimento / 2 - P, 0, 0, b);
    for (let i = 0; i < N; i++) caixa(0.08, 0.02, 0.05, M.escuro, i * P, 0, -sz * 0.03, b);   // finger
    b.userData.lado = sz; barras.push(b);
  }
  // acionamento do X (cremalheira) e do Y no começo da linha
  caixa(0.5, 0.5, 1.1, M.escuro, -P - 0.5, Y_TRAB - 0.25, 0, grupo);
  luzes.transfer = lampada(grupo, -P - 0.5, Y_TRAB, 0.35);
  novoRotulo("Transfer (CLP mestre)", new THREE.Vector3(-P - 0.5, Y_TRAB + 1.0, 0), arq.transfer.id);
  // destacker com magazines A e B
  const gx = -P - 1.9;
  dest = new THREE.Group(); dest.position.x = gx; grupo.add(dest);
  for (const sz of [-1, 1]) { caixa(0.6, 0.3, 0.5, M.escuro, 0, 0.15, sz * 0.55, dest); for (const sx of [-1, 1]) caixa(0.025, 1.1, 0.025, M.amarelo, sx * 0.28, 0.85, sz * 0.55 + 0.26, dest); }
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) caixa(0.08, 2.1, 0.08, M.corpo, sx * 0.4 + (sx > 0 ? 1.3 : 0), 1.05, sz * 0.95, dest);
  caixa(2.4, 0.12, 2.0, M.corpo, 0.65, 2.1, 0, dest);
  const carro = new THREE.Group(); dest.add(carro); caixa(0.22, 0.14, 0.22, M.claro, 0, 0, 0, carro); cilindro(0.02, 0.6, M.escuro, 0, -0.35, 0, carro); caixa(0.4, 0.03, 0.3, M.escuro, 0, -0.66, 0, carro);
  carro.position.set(0, 1.95, 0); dest.userData.carro = carro;
  luzes.destacker = lampada(dest, 0.5, 2.16, 0.8);
  novoRotulo("Destacker", new THREE.Vector3(gx, 2.6, 0), arq.destacker.id);
  const pilha = arq.abastecimento?.entrada?.pecas_por_pilha || 1;
  for (let i = 0; i < (arq.abastecimento?.entrada?.magazines || 2); i++) {
    const z = (i === 0 ? -1 : 1) * 0.55, m = caixa(0.42, 1, 0.33, M.chapa, gx, 0.3, z, grupo);
    mags.push({ mesh: m, x: gx, z, cheio: pilha });
  }
  // saída: esteira, mesa, operadora e caixas
  const x0 = xFim - P / 2, xe = x0 + 2.6;
  caixa(2.6, 0.06, 0.5, M.esteira, x0 + 1.3, Y_TRAB - 0.03, 0, grupo);
  for (let x = x0 + 0.2; x < xe; x += 0.8) for (const sz of [-1, 1]) caixa(0.04, Y_TRAB - 0.06, 0.04, M.escuro, x, (Y_TRAB - 0.06) / 2, sz * 0.22, grupo);
  mesaV = { x: xe + 0.6, z: 0 };
  caixa(1.2, 0.05, 0.9, M.claro, mesaV.x, 0.85, 0, grupo); for (const sx of [-1, 1]) for (const sz of [-1, 1]) caixa(0.04, 0.83, 0.04, M.escuro, mesaV.x + sx * 0.55, 0.415, sz * 0.4, grupo);
  const pessoa = new THREE.Group(); pessoa.position.set(mesaV.x, 0, -0.75); grupo.add(pessoa);
  cilindro(0.17, 0.9, M.pele, 0, 0.95, 0, pessoa); const cab = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), M.claro); cab.position.y = 1.55; cab.castShadow = true; pessoa.add(cab);
  cilindro(0.06, 0.8, M.escuro, -0.06, 0.4, 0, pessoa); cilindro(0.06, 0.8, M.escuro, 0.06, 0.4, 0, pessoa);
  for (let i = 0; i < 3; i++) caixa(0.5, 0.35, 0.4, M.caixaPapel, mesaV.x - 0.5 + i * 0.55, 0.175, 0.9, grupo);
  const cacamba = caixa(0.5, 0.45, 0.4, M.ruim, mesaV.x + 0.9, 0.225, 0.75, grupo); cacamba.material = M.ruim;
  luzes.mesa = lampada(grupo, mesaV.x + 0.55, 0.87, -0.35, 0.05);
  novoRotulo("Mesa e operadora", new THREE.Vector3(mesaV.x, 2.0, 0), arq.saida.id);
  mesaV.saidaX = xFim; mesaV.entradaX = xe - 0.1;
  // empilhadeira
  empilhadeira = construirEmpilhadeira(); grupo.add(empilhadeira);
  empilhadeira.userData.parada = new THREE.Vector3(gx - 6, 0, 4); empilhadeira.position.copy(empilhadeira.userData.parada);
  // faixas do corredor e sol
  for (const z of [-1.6, 2.2, 3.2, 5.6]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(xe + 14, 0.08), M.faixa); f.rotation.x = -Math.PI / 2; f.position.set((gx - 8 + xe + 4) / 2, 0.004, z); grupo.add(f); }
  const meio = (gx + mesaV.x) / 2; sol.position.set(meio - 4, 16, 9); sol.target.position.set(meio, 0, 0);
  const sc = sol.shadow.camera; sc.left = -(mesaV.x - gx) / 2 - 8; sc.right = (mesaV.x - gx) / 2 + 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 50; sc.updateProjectionMatrix();
  grupo.userData.meio = meio; grupo.userData.comprimento = mesaV.x - gx + 2;
}
function construirEmpilhadeira() {
  const g = new THREE.Group(), s = 0.55;                      // tamanho real aproximado (≈ 2,4 m de comprimento)
  caixa(2.0 * s, 0.9 * s, 1.3 * s, M.amarelo, 0, 0.75 * s, 0, g); caixa(0.7 * s, 1.0 * s, 1.3 * s, M.escuro, -0.95 * s, 0.9 * s, 0, g);
  for (const [x, z] of [[-0.85, 0.6], [-0.85, -0.6], [0.2, 0.6], [0.2, -0.6]]) caixa(0.07 * s, 1.4 * s, 0.07 * s, M.escuro, x * s, 1.9 * s, z * s, g);
  caixa(1.2 * s, 0.07 * s, 1.3 * s, M.escuro, -0.32 * s, 2.6 * s, 0, g);
  for (const [x, z, r] of [[0.65, 0.62, 0.32], [0.65, -0.62, 0.32], [-0.75, 0.6, 0.27], [-0.75, -0.6, 0.27]]) cilindro(r * s, 0.25 * s, M.pneu, x * s, r * s, z * s, g, "z");
  for (const sz of [-1, 1]) caixa(0.1 * s, 2.9 * s, 0.12 * s, M.escuro, 1.08 * s, 1.55 * s, sz * 0.35 * s, g);
  const garfo = new THREE.Group(); g.add(garfo);
  for (const sz of [-1, 1]) caixa(1.3 * s, 0.06 * s, 0.14 * s, M.escuro, 1.85 * s, 0.03 * s, sz * 0.32 * s, garfo);
  const carga = caixa(0.42, 0.5, 0.33, M.chapa, 1.85 * s, 0.3, 0, garfo);
  garfo.position.y = 0.06; g.userData = { garfo, carga, ang: 0 };
  return g;
}
function novoRotulo(txt, ancora, id) {
  const el = document.createElement("div"); el.className = "rotulo"; el.innerHTML = "<b></b><span></span>"; el.firstChild.textContent = txt;
  $("rotulos").appendChild(el); rotulos.push({ el, ancora, id, ultimo: "" });
}

// ---------------------------------------------------------------- preparar a reprodução a partir do registro
function preparar() {
  const ev = rDia.registro.slice().sort((a, b) => a.t - b.t);
  ciclos = ev.filter((e) => e.tipo === "ciclo"); paradas = ev.filter((e) => e.tipo === "parada");
  linhaEv = ev.filter((e) => e.tipo === "ciclo" || e.tipo === "parada");
  // posições depois de cada ciclo (para pular para qualquer instante)
  const N = layout.length; posApos = []; saidasCum = []; let atual = new Int32Array(N), s = 0;
  for (const e of ciclos) {
    const nova = new Int32Array(N); for (let i = N - 1; i > 0; i--) nova[i] = atual[i - 1]; nova[0] = e.entra || 0;
    if (e.sai) s++; posApos.push(nova); saidasCum.push(s); atual = nova; e.idx = posApos.length - 1;
  }
  botoeiraT = ev.filter((e) => e.tipo === "botoeira").map((e) => e.t);
  // cada peça depois da linha: sai → esteira → mesa → operadora
  const tSaida = c.passos[1].fim_s - (arq.transfer.confirmacao_s || 0);
  pecas = new Map();
  for (const e of ciclos) if (e.sai) pecas.set(e.sai, { un: e.sai, sai: e.t + tSaida, chega: Infinity, ini: Infinity, fim: Infinity, ruim: false });
  for (const e of ev) if (e.tipo === "operadora") { const p = pecas.get(e.un); if (p) { p.chega = e.chega; p.ini = e.t; p.fim = e.fim; p.ruim = e.ruim; } }
  for (const p of pecas.values()) if (!Number.isFinite(p.chega)) p.chega = p.sai + (arq.saida.esteira_s || 0);
  saidasOrd = [...pecas.values()].sort((a, b) => a.sai - b.sai);
  // magazines: quantos blanks em cada instante
  const pilha = arq.abastecimento?.entrada?.pecas_por_pilha || 0; let magAt = 0; const n = mags.map(() => pilha);
  magEv = [{ t: 0, n: n.slice(), atual: 0 }];
  for (const e of ev) {
    if (e.tipo === "troca_magazine") magAt = e.mag;
    else if (e.tipo === "ciclo" && e.entra && mags.length) { n[magAt]--; e.mag = magAt; }
    else if (e.tipo === "pilha_trocada") n[e.mag] = pilha;
    else continue;
    magEv.push({ t: e.t, n: n.slice(), atual: magAt });
  }
  // viagens da empilhadeira
  const ent = arq.abastecimento?.entrada;
  viagens = ev.filter((e) => e.tipo === "pedido_empilhadeira").map((e) => ({ mag: e.mag, chega: e.fim - (ent ? ent.troca_min * 60 : 0), fim: e.fim }));
}
const ultimoAte = (lista, t) => { let a = 0, b = lista.length - 1, r = -1; while (a <= b) { const m = (a + b) >> 1; if (lista[m].t <= t) { r = m; a = m + 1; } else b = m - 1; } return r; };

// ---------------------------------------------------------------- desenhar o instante T
const tmp = new THREE.Vector3();
function pecaMesh(un, ruim) {
  let m = meshPeca.get(un);
  if (!m) { m = pool.pop() || (() => { const x = new THREE.Mesh(geoPeca, M.chapa); x.castShadow = true; grupo.add(x); return x; })(); meshPeca.set(un, m); }
  m.material = ruim ? M.ruim : M.chapa; m.visible = true; m.userData.usada = true; return m;
}
function desenhar(t) {
  for (const m of meshPeca.values()) m.userData.usada = false;
  const i = ultimoAte(linhaEv, t), e = linhaEv[i];
  let modo = "parada", tRel = 0, cic = null, par = null;
  if (e && e.tipo === "ciclo" && t < e.t + e.dur) { modo = "ciclo"; cic = e; tRel = t - e.t; }
  else if (e && e.tipo === "parada" && t < e.t + e.dur) { modo = "parada"; par = e; }
  // estado dos eixos e prensas
  const est = modo === "ciclo" ? estadoNoCiclo(arq, c, Math.min(tRel, c.ciclo_s - 1e-6)) : { x_mm: 0, y_mm: 0, prensas: arq.prensas.map(() => ({ graus: 0, altura_mm: null })), passo: 0, grau_transfer: 0 };
  const zFechado = 0.165 + 0.045, curY = arq.transfer.eixo_y.curso_mm / 1000;
  for (const b of barras) { b.position.set(est.x_mm / 1000, Y_TRAB + 0.02, b.userData.lado * (zFechado + curY - est.y_mm / 1000)); }
  prensasV.forEach((p, k) => { const h = est.prensas[k].altura_mm; p.martelo.position.y = p.yPMI + (h == null ? p.curso : h / 1000); });
  // peças na linha
  const ic = cic ? cic.idx : (() => { let j = ultimoAte(ciclos, t); return j >= 0 ? ciclos[j].idx : -1; })();
  const antes = cic ? (ic > 0 ? posApos[ic - 1] : null) : null, depois = ic >= 0 ? posApos[ic] : null;
  const p2ini = c.passos[1].inicio_s, p2fim = p2ini + perfil(arq.transfer.eixo_x.curso_mm, arq.transfer.eixo_x.vel_mm_s, arq.transfer.eixo_x.acel_mm_s2).tempo_s, p4ini = c.passos[3].inicio_s;
  const N = layout.length;
  if (cic && tRel < p2fim) {                               // antes do X terminar de avançar: peças nas posições antigas (andando com o X)
    const dx = tRel >= p2ini ? est.x_mm / 1000 : 0;
    if (antes) for (let k = 0; k < N; k++) if (antes[k]) { const m = pecaMesh(antes[k]); m.position.set(k * P + dx, Y_TRAB + 0.009, 0); }
  } else if (depois) {
    for (let k = 0; k < N; k++) if (depois[k]) {
      if (k === 0 && cic && cic.entra === depois[0]) continue;      // o blank novo é desenhado pelo destacker
      const m = pecaMesh(depois[k]); m.position.set(k * P, Y_TRAB + 0.009, 0);
    }
  }
  // destacker: pega no magazine e põe no interpress de entrada (passo 4)
  const carro = dest.userData.carro, gx = dest.position.x;
  const im = ultimoAte(magEv, t), me = magEv[Math.max(0, im)];
  mags.forEach((m, k) => { const h = 0.02 + 1.0 * (me.n[k] / m.cheio); m.mesh.scale.y = Math.max(0.001, h); m.mesh.position.y = 0.3 + h / 2; });
  if (cic && cic.entra && tRel >= p4ini && cic.pega) {
    const a = Math.min(1, (tRel - p4ini) / cic.pega), s = a * a * (3 - 2 * a), mg = mags[cic.mag ?? me.atual] || mags[0];
    const de = new THREE.Vector3(mg.x, 0.3 + 1.0 * (me.n[cic.mag ?? 0] + 1) / mg.cheio + 0.03, mg.z), para = new THREE.Vector3(0, Y_TRAB + 0.009, 0);
    const m = pecaMesh(cic.entra); m.position.lerpVectors(de, para, s); m.position.y += Math.sin(Math.PI * s) * 0.9;
    carro.position.set(m.position.x - gx, Math.max(m.position.y + 0.68, 1.2), m.position.z);
  } else carro.position.set(0, 1.95, mags[me.atual]?.z ?? 0);
  // depois da linha: esteira, mesa e operadora
  let naMesa = 0;
  let j = (() => { let a = 0, b = saidasOrd.length - 1, r = -1; while (a <= b) { const m = (a + b) >> 1; if (saidasOrd[m].sai <= t) { r = m; a = m + 1; } else b = m - 1; } return r; })();
  for (let q = j, vistos = 0; q >= 0 && vistos < 600; q--, vistos++) {
    const p = saidasOrd[q]; if (t >= p.fim) continue;
    let pos;
    if (t < p.chega) { const a = (t - p.sai) / Math.max(0.001, p.chega - p.sai); pos = tmp.set(mesaV.saidaX + a * (mesaV.entradaX - mesaV.saidaX), Y_TRAB + 0.009, 0); }
    else if (t < p.ini) { pos = tmp.set(mesaV.x + 0.35 - (naMesa % 3) * 0.02, 0.88 + 0.02 * naMesa, 0.15); naMesa++; }
    else pos = tmp.set(mesaV.x, 0.9, -0.2);
    const m = pecaMesh(p.un, p.ruim && t >= p.ini); m.position.copy(pos);
  }
  for (const [un, m] of meshPeca) if (!m.userData.usada) { m.visible = false; pool.push(m); meshPeca.delete(un); }
  // empilhadeira
  desenharEmpilhadeira(t);
  // luzes e faixa
  let faixa = "PRODUZINDO", corFaixa = COR.produzindo, todas = "produzindo", especial = {};
  if (par) {
    const falta = fmt((par.t + par.dur - t) / 60, 1) + " min";
    if (par.motivo === "quebrada") { const nome = nomeDe(par.comp); faixa = "QUEBRA: " + nome + " — volta em " + falta; corFaixa = COR.quebrada; todas = "parada"; especial[chave(par.comp)] = "quebrada"; }
    else if (par.motivo === "botoeira") { faixa = "BOTOEIRA — a operadora achou peça com defeito · volta em " + falta; corFaixa = COR.botoeira; todas = "parada"; especial.mesa = "botoeira"; }
    else if (par.motivo === "troca_ferramenta") { faixa = "TROCA DE FERRAMENTA — volta em " + falta; corFaixa = COR.troca; todas = "troca"; }
    else if (par.motivo === "faltou_blank") { faixa = "FALTOU BLANK — esperando a empilhadeira · " + falta; corFaixa = COR.faltou; todas = "parada"; especial.destacker = "faltou"; }
  } else if (cic && !cic.entra) { faixa = "ESVAZIANDO PARA A TROCA DE FERRAMENTA"; corFaixa = COR.troca; }
  else if (cic && !cic.sai) { faixa = "ENCHENDO A LINHA (" + layout.length + " posições)"; }
  for (const [k, mat] of Object.entries(luzes)) { const s = especial[k] || (k === "mesa" ? "produzindo" : todas); const cor = COR[s]; mat.color.set(cor); mat.emissive.set(cor); mat.emissiveIntensity = s === "botoeira" ? 1.2 + Math.sin(performance.now() / 120) : 1.6; }
  const fx = $("faixa"); if (fx.textContent !== faixa) fx.textContent = faixa; fx.style.background = corFaixa; fx.style.color = corFaixa === COR.quebrada ? "#111" : "#fff";
  estadoAtual = { modo, cic, par, tRel, est, naMesa, ic, especial, todas };
}
let estadoAtual = {};
const chave = (id) => (id === arq.transfer.id ? "transfer" : id === arq.destacker.id ? "destacker" : id);
const nomeDe = (id) => (arq.prensas.find((p) => p.id === id)?.nome.split(" — ")[0]) || (id === arq.transfer.id ? "Transfer" : id === arq.destacker.id ? "Destacker" : id);
function desenharEmpilhadeira(t) {
  const f = empilhadeira, ud = f.userData, parada = ud.parada, IDA = 20;
  let v = null; for (let a = 0, b = viagens.length - 1; a <= b;) { const m = (a + b) >> 1; if (viagens[m].chega - IDA <= t) { v = viagens[m]; a = m + 1; } else b = m - 1; }
  let pos = parada.clone(), dir = new THREE.Vector3(1, 0, 0), carga = false, alt = 0.06;
  if (v && t < v.fim + IDA) {
    const mg = mags[v.mag] || mags[0], alvo = new THREE.Vector3(mg.x - 0.95, 0, mg.z), meioP = new THREE.Vector3(mg.x - 3, 0, parada.z), meio2 = new THREE.Vector3(mg.x - 3, 0, mg.z);
    const caminho = [parada, meioP, meio2, alvo];
    if (t < v.chega) { const r = noCaminho(caminho, (t - (v.chega - IDA)) / IDA); pos = r.p; dir = r.d; carga = true; }
    else if (t < v.fim) { pos = alvo; dir.set(1, 0, 0); const a = (t - v.chega) / (v.fim - v.chega); alt = 0.06 + Math.sin(Math.PI * a) * 0.35; carga = a < 0.8; }
    else { const r = noCaminho([...caminho].reverse(), (t - v.fim) / IDA); pos = r.p; dir = r.d; if (r.p.distanceTo(alvo) < 2.2) dir.negate(); }
  }
  f.position.copy(pos);
  const ang = Math.atan2(-dir.z, dir.x); let d = ang - ud.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); ud.ang += d * (Math.abs(d) > 2.5 ? 1 : 0.2); f.rotation.y = ud.ang;
  ud.garfo.position.y = alt; ud.carga.visible = carga;
}
function noCaminho(pts, s) {
  s = Math.max(0, Math.min(1, s)); const seg = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); tot += d; }
  let alvo = s * tot;
  for (let i = 0; i < seg.length; i++) { if (alvo <= seg[i] || i === seg.length - 1) { const a = seg[i] ? Math.min(1, alvo / seg[i]) : 1; return { p: new THREE.Vector3().lerpVectors(pts[i], pts[i + 1], a), d: new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize() }; } alvo -= seg[i]; }
  return { p: pts[pts.length - 1].clone(), d: new THREE.Vector3(1, 0, 0) };
}

// ---------------------------------------------------------------- carta de tempos com cursor e mostrador de 360°
const NOMES_PASSO = ["Y avança", "X avança", "Y recua", "X volta ‖ golpe ‖ destacker"], CORES_PASSO = ["#2a78d6", "#eb6834", "#2a78d6", "#1baf7a"];
function montarCarta() {
  const svg = $("cartaSvg"); let h = ""; let x = 8; const W = 220;
  c.passos.forEach((p, i) => { const w = W * p.tempo_s / c.ciclo_s; h += `<rect x="${x.toFixed(1)}" y="20" width="${Math.max(1, w - 2).toFixed(1)}" height="14" rx="3" fill="${CORES_PASSO[i]}"><title>${NOMES_PASSO[i]}: ${fmt(p.tempo_s, 3)} s</title></rect><text x="${(x + w / 2).toFixed(1)}" y="48" text-anchor="middle">${i + 1}</text>`; x += w; });
  h += `<line id="cursor" x1="8" x2="8" y1="14" y2="40" stroke="#f2b705" stroke-width="2"/><text id="txtPasso" x="8" y="66"></text><text id="txtTempo" x="8" y="84" fill="#b9b8b1"></text>`;
  h += `<circle cx="282" cy="46" r="30" fill="none" stroke="#5d5f63" stroke-width="6"/>`;
  let g0 = 0; c.passos.forEach((p, i) => { const g1 = p.grau_fim; h += `<path d="${arco(282, 46, 30, g0, g1)}" fill="none" stroke="${CORES_PASSO[i]}" stroke-width="6"/>`; g0 = g1; });
  h += `<line id="agulha" x1="282" y1="46" x2="282" y2="18" stroke="#f2b705" stroke-width="2.5"/><text id="txtGraus" x="282" y="50" text-anchor="middle" font-weight="bold">0°</text>`;
  svg.innerHTML = h;
}
function arco(cx, cy, r, a0, a1) { const p = (a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; }
function atualizarCarta() {
  const s = estadoAtual; if (!s.est) return;
  let frac = 0, txt = "linha parada", graus = 0;
  if (s.modo === "ciclo") {
    const p4 = c.passos[3].inicio_s, ext = s.cic.dur - c.ciclo_s;                  // ciclo mais longo (destacker): o passo 4 estica
    const tn = s.tRel < p4 ? s.tRel : p4 + (s.tRel - p4) * (c.ciclo_s - p4) / (c.ciclo_s - p4 + ext);
    frac = Math.min(1, tn / c.ciclo_s); graus = 360 * frac;
    const passo = c.passos.find((p) => tn >= p.inicio_s && tn < p.fim_s) || c.passos[3];
    txt = "Passo " + passo.n + " · " + NOMES_PASSO[passo.n - 1];
    $("txtTempo").textContent = fmt(s.tRel, 2) + " s de " + fmt(s.cic.dur, 2) + " s" + (ext > 0.001 ? " (destacker +" + fmt(ext, 2) + " s)" : "");
  } else $("txtTempo").textContent = "";
  const x = 8 + 220 * frac; $("cursor").setAttribute("x1", x); $("cursor").setAttribute("x2", x);
  $("txtPasso").textContent = txt; $("txtGraus").textContent = fmt(graus, 0) + "°";
  const r = graus * Math.PI / 180; $("agulha").setAttribute("x2", (282 + 28 * Math.sin(r)).toFixed(1)); $("agulha").setAttribute("y2", (46 - 28 * Math.cos(r)).toFixed(1));
}

// ---------------------------------------------------------------- rótulos e painel
const proj = new THREE.Vector3();
function atualizarRotulos() {
  const w = canvas.clientWidth, h = canvas.clientHeight, seg = c?.segura?.prensa;
  for (const r of rotulos) {
    proj.copy(r.ancora).add(grupo.position).project(camera);
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05; r.el.style.display = vis ? "" : "none"; if (!vis) continue;
    r.el.style.left = ((proj.x + 1) / 2 * w).toFixed(1) + "px"; r.el.style.top = ((1 - proj.y) / 2 * h).toFixed(1) + "px";
    const k = chave(r.id), s = r.id === arq.saida.id ? (estadoAtual.especial?.mesa || "produzindo") : (estadoAtual.especial?.[k] || estadoAtual.todas || "produzindo");
    const tx = { produzindo: "Produzindo", quebrada: "Quebrada", troca: "Troca de ferramenta", faltou: "Faltou blank", parada: "Parada", botoeira: "Botoeira!" }[s];
    if (r.ultimo !== tx) { r.ultimo = tx; r.el.lastChild.textContent = tx; r.el.style.borderLeftColor = COR[s]; r.el.classList.toggle("garg", r.id === seg); }
  }
}
function textoTempo(seg) { const m = Math.floor(seg / 60); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min"; }
let ultimoPainel = 0;
function atualizarPainel(agora) {
  if (agora - ultimoPainel < 100) return; ultimoPainel = agora;
  const ic = estadoAtual.ic ?? -1;
  $("nCiclos").textContent = fmt(ic + 1); $("nSaidas").textContent = fmt(ic >= 0 ? saidasCum[ic] * (arq.linha.pecas_por_golpe || 1) : 0);
  $("nBot").textContent = fmt(botoeiraT.filter((x) => x <= T).length); $("nMesa").textContent = fmt(estadoAtual.naMesa || 0);
  $("relogio").textContent = "Dia 1 · " + textoTempo(T) + " de " + textoTempo(FIM);
  $("tempo").value = Math.round(T / FIM * 1000);
  atualizarCarta();
}
function preencherResultado() {
  const r = rTudo, L = arq.linha, ok = r.pecas_por_dia >= L.demanda_pecas_dia;
  $("rDia").textContent = fmt(r.pecas_por_dia); $("rDia").className = ok ? "sim" : "nao";
  $("rDem").textContent = fmt(L.demanda_pecas_dia) + " (" + fmt(100 * r.pecas_por_dia / L.demanda_pecas_dia, 1) + "%)";
  $("rRitmo").textContent = fmt(r.ritmo_real_s, 2) + " × " + fmt(r.takt_s, 2) + " s"; $("rRitmo").className = r.ritmo_real_s <= r.takt_s ? "sim" : "nao";
  $("rOee").textContent = fmt(100 * r.oee.oee, 1) + "%";
  $("rCiclo").textContent = fmt(c.ciclo_s, 3) + " s · " + fmt(c.golpes_por_minuto, 2) + " gpm";
  $("rSegura").textContent = c.segura.id === "golpe" ? nomeDe(c.segura.prensa) : c.segura.id === "destacker" ? "Destacker" : "Eixo X";
}

// ---------------------------------------------------------------- câmera
function irCamera(pos, alvo, seg = 0.9) { tween = { de: camera.position.clone(), deA: controles.target.clone(), para: pos, paraA: alvo, t0: performance.now(), dur: seg * 1000 }; }
function marcar(id) { for (const b of ["cGeral", "cGarg", "cDest", "cMesa", "cEmp"]) $(b).setAttribute("aria-pressed", String(b === id)); }
function camGeral() {                                           // enquadra a linha inteira, do destacker à mesa
  seguir = null; const L = grupo.userData.comprimento, mx = grupo.userData.meio;
  const hfov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect), dist = (L / 2) / Math.tan(hfov / 2) * 1.08;
  const dir = new THREE.Vector3(-0.12, 0.62, 0.78).normalize(), alvo = new THREE.Vector3(mx, 0.8, 0.4);
  irCamera(alvo.clone().add(dir.multiplyScalar(dist)), alvo); marcar("cGeral");
}
function camGargalo() { seguir = null; const p = prensasV.find((x) => x.id === c.segura.prensa) || prensasV[0]; irCamera(new THREE.Vector3(p.x + 1.9, 1.75, 4.3), new THREE.Vector3(p.x + 0.3, 1.05, 0)); marcar("cGarg"); }
function camDest() { seguir = null; const x = dest.position.x; irCamera(new THREE.Vector3(x + 2.4, 2.6, 4.4), new THREE.Vector3(x + 1.0, 0.9, 0)); marcar("cDest"); }
function camMesa() { seguir = null; irCamera(new THREE.Vector3(mesaV.x + 1.2, 2.3, 3.8), new THREE.Vector3(mesaV.x - 1.0, 0.8, 0)); marcar("cMesa"); }
function camEmp() { const wp = empilhadeira.getWorldPosition(new THREE.Vector3()); seguir = { ultimo: wp.clone() }; irCamera(wp.clone().add(new THREE.Vector3(-3.5, 3, 4.5)), wp.clone().setY(0.6)); marcar("cEmp"); }

// ---------------------------------------------------------------- AO VIVO (etapa S5): Espelho do CLP e Comparação real × modelo
// A ponte (servidor local) lê o CLP — SÓ LEITURA — e manda as leituras por /api/ao-vivo. A tela desenha o que o CLP diz.
let modoTela = "simulado", fonte = null, amostras = [], esteiraVivo = [], ultimasPecas = null, compV = null, avisoVivo = "", nVivo = 0;
const SIT_FAIXA = [["PRODUZINDO", "produzindo"], ["QUEBRA", "quebrada"], ["BOTOEIRA — a operadora achou peça com defeito", "botoeira"], ["TROCA DE FERRAMENTA", "troca"], ["FALTOU BLANK — esperando a empilhadeira", "faltou"], ["ENCHENDO A LINHA", "produzindo"], ["ESVAZIANDO PARA A TROCA DE FERRAMENTA", "troca"]];
const PRODUZ = new Set([0, 5, 6]);
function nomeComp(n) { if (!n) return ""; if (n === 1) return "Transfer"; if (n === 2) return "Destacker"; const p = arq.prensas[n - 3]; return p ? p.nome.split(" — ")[0] : "máquina " + n; }
function chaveComp(n) { return n === 1 ? "transfer" : n === 2 ? "destacker" : arq.prensas[n - 3]?.id; }
async function listarMapas() {
  const l = (await (await fetch("/api/lista")).json()).filter((f) => f.formato === "simulador-sinais/1"), sel = $("mapa"); sel.innerHTML = "";
  for (const f of l) { const o = document.createElement("option"); o.value = f.arquivo; o.textContent = f.nome; sel.appendChild(o); }
  const q = new URLSearchParams(location.search).get("mapa"); if (q) sel.value = q;
  if (!l.length) statusVivo("Nenhum mapa de sinais na pasta modelos. Crie um nos formulários.", "erro");
}
function statusVivo(txt, cls = "") { const e = $("statusVivo"); e.textContent = txt; e.className = "sub " + cls; }
function escolherModo(m) {
  modoTela = m; for (const [id, k] of [["mSim", "simulado"], ["mEsp", "espelho"], ["mComp", "comparacao"]]) $(id).setAttribute("aria-pressed", String(k === m));
  $("ligacao").hidden = m === "simulado"; $("comparacao").hidden = m !== "comparacao";
  $("tituloAgora").textContent = m === "simulado" ? "Agora (reprodução do dia 1)" : "Agora (CLP ao vivo)";
  for (const id of ["bTocar", "tempo"]) $(id).disabled = m !== "simulado"; for (const b of vbox.children) b.disabled = m !== "simulado";
  if (m === "simulado") statusVivo(""); else if (!fonte) statusVivo("Escolha o mapa de sinais e clique em Ligar. Para testar sem máquina: ABRIR_CLP_DE_MENTIRA.bat.");
}
async function ligar() {
  if (fonte) { fonte.close(); fonte = null; await fetch("/api/ao-vivo/parar", { method: "POST" }); $("bLigar").textContent = "Ligar"; statusVivo("Desligado."); return; }
  const r = await fetch("/api/ao-vivo/iniciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapa: $("mapa").value }) });
  const j = await r.json().catch(() => ({ ok: false, erro: "resposta inválida" }));
  if (!j.ok) { statusVivo("Não liguei: " + j.erro, "erro"); return; }
  amostras = []; compV = null; esteiraVivo = []; ultimasPecas = null;
  fonte = new EventSource("/api/ao-vivo"); $("bLigar").textContent = "Desligar";
  fonte.onmessage = (e) => receber(JSON.parse(e.data));
  statusVivo("Ligando… o registro vai para " + j.gravacao);
}
function receber(m) {
  if (!m.ok) { statusVivo("Sem resposta do CLP: " + m.erro + " (tentando de novo)", "erro"); avisoVivo = "SEM SINAL DO CLP"; return; }
  avisoVivo = ""; m.recebido = Date.now(); amostras.push(m); if (amostras.length > 4) amostras.shift();
  statusVivo("Ao vivo · leitura em " + m.ms + " ms · " + new Date(m.t).toLocaleTimeString("pt-BR"), "ok");
  const v = m.v;
  if (ultimasPecas != null && v.pecas_saida > ultimasPecas) for (let i = 0; i < Math.min(5, v.pecas_saida - ultimasPecas); i++) esteiraVivo.push({ t0: Date.now() + i * 50, id: ++nVivo });
  ultimasPecas = v.pecas_saida;
  // comparação: acumula o tempo real por situação e os golpes em produção
  if (!compV) compV = { ini: m, ant: m, prodS: 0, golpesProd: 0, parado: [0, 0, 0, 0, 0, 0, 0] };
  else {
    const a = compV.ant, dt = (m.t - a.t) / 1000, dg = v.golpes - a.v.golpes;
    if (dt > 0 && dt < 10) {
      compV.parado[a.v.situacao] = (compV.parado[a.v.situacao] || 0) + dt;
      if (PRODUZ.has(a.v.situacao)) { compV.prodS += dt; if (dg > 0 && dg < 100) compV.golpesProd += dg; }
      // ciclo medido de golpe a golpe (sem a sobra do começo): tempo em produção entre o 1º e o último golpe visto
      if (dg > 0 && dg < 100) { if (compV.marca == null) compV.marca = { prod: compV.prodS, golpes: v.golpes }; compV.ultMarca = { prod: compV.prodS, golpes: v.golpes }; }
    }
    if (dg < 0) compV.ini = m;                                         // contador zerou no CLP: recomeça a comparação
    compV.ant = m;
  }
}
function desenharAoVivo() {
  for (const m of meshPeca.values()) m.userData.usada = false;
  const a = amostras[amostras.length - 1], b = amostras[amostras.length - 2];
  if (!a) { const fx = $("faixa"); fx.textContent = fonte ? "ESPERANDO O CLP…" : "MODO AO VIVO — clique em Ligar"; fx.style.background = COR.parada; fx.style.color = "#fff"; estadoAtual = {}; return; }
  // mostra um intervalo de leitura atrás, interpolando entre as duas últimas leituras (movimento suave)
  const v = a.v, intervalo = b ? Math.max(20, a.recebido - b.recebido) : 100, f = b ? Math.min(1, (Date.now() - a.recebido) / intervalo) : 1;
  let ang = v.angulo_transfer ?? 0, xm = v.x_mm, ym = v.y_mm;
  if (b && b.v.situacao === v.situacao) {
    let d = ang - (b.v.angulo_transfer ?? 0); if (d < -180) d += 360; ang = ((b.v.angulo_transfer ?? 0) + f * d + 360) % 360;
    if (xm != null && b.v.x_mm != null) xm = b.v.x_mm + f * (xm - b.v.x_mm); if (ym != null && b.v.y_mm != null) ym = b.v.y_mm + f * (ym - b.v.y_mm);
  }
  const emCiclo = v.em_ciclo != null ? !!v.em_ciclo : PRODUZ.has(v.situacao);
  const tRel = ang / 360 * c.ciclo_s;
  const est = emCiclo ? estadoNoCiclo(arq, c, Math.min(tRel, c.ciclo_s - 1e-6)) : { x_mm: 0, y_mm: 0, passo: 0, prensas: arq.prensas.map(() => ({ altura_mm: null })) };
  if (xm != null) est.x_mm = xm; if (ym != null) est.y_mm = ym;
  const zFechado = 0.165 + 0.045, curY = arq.transfer.eixo_y.curso_mm / 1000;
  for (const br of barras) br.position.set(est.x_mm / 1000, Y_TRAB + 0.02, br.userData.lado * (zFechado + curY - est.y_mm / 1000));
  prensasV.forEach((p, k) => { const h = est.prensas[k].altura_mm; p.martelo.position.y = p.yPMI + (h == null ? p.curso : h / 1000); });
  // peças: a linha cheia (o CLP não diz peça por peça); andam com o X no passo 2
  if (v.situacao !== 3) { const passo = v.passo || est.passo, dx = passo === 2 ? est.x_mm / 1000 : 0; for (let k = 0; k < layout.length; k++) { const m = pecaMesh("L" + k); m.position.set(k * P + dx, Y_TRAB + 0.009, 0); } }
  mags.forEach((m, k) => { const n = k === 0 ? v.blanks_mag_A : v.blanks_mag_B; if (n == null) return; const h = 0.02 + 1.0 * (n / m.cheio); m.mesh.scale.y = Math.max(0.001, h); m.mesh.position.y = 0.3 + h / 2; });
  const p4 = c.passos[3].inicio_s, carro = dest.userData.carro, mg = mags[v.magazine_atual ?? 0] || mags[0];
  if (emCiclo && tRel >= p4 && mg) { const s2 = Math.min(1, (tRel - p4) / arq.destacker.pega_s.mais_comum), e = s2 * s2 * (3 - 2 * s2); carro.position.set(mg.x + e * (0 - mg.x) - dest.position.x, 1.95 - Math.sin(Math.PI * e) * 0.3, mg.z * (1 - e)); }
  else carro.position.set(0, 1.95, mg?.z ?? 0);
  // peças que saíram (pelo contador do CLP): esteira e mesa
  const est_s = (arq.saida.esteira_s || 0) * 1000, op_s = arq.saida.operadora.tempo_peca_s.mais_comum * 1000, agora = Date.now();
  esteiraVivo = esteiraVivo.filter((p) => agora - p.t0 < est_s + op_s);
  let naMesa = 0;
  esteiraVivo.forEach((p) => { const d = agora - p.t0, m = pecaMesh("E" + p.id); if (d < est_s) m.position.set(mesaV.saidaX + (d / est_s) * (mesaV.entradaX - mesaV.saidaX), Y_TRAB + 0.009, 0); else { m.position.set(mesaV.x, 0.9, -0.2 + 0.03 * naMesa); naMesa++; } });
  for (const [un, m] of meshPeca) if (!m.userData.usada) { m.visible = false; pool.push(m); meshPeca.delete(un); }
  desenharEmpilhadeira(-1e9);
  // faixa e luzes pela situação do CLP
  const [txt, st] = SIT_FAIXA[v.situacao] || ["SITUAÇÃO " + v.situacao, "parada"];
  let faixa = avisoVivo || (v.situacao === 1 ? "QUEBRA: " + nomeComp(v.comp_parada) : txt) + " · AO VIVO", todas = PRODUZ.has(v.situacao) ? "produzindo" : v.situacao === 3 ? "troca" : "parada", especial = {};
  if (v.situacao === 1 && v.comp_parada) especial[chave(chaveComp(v.comp_parada))] = "quebrada";
  if (v.situacao === 2) especial.mesa = "botoeira"; if (v.situacao === 4) especial.destacker = "faltou";
  arq.prensas.forEach((p, i) => { if (v["prensa_pms_" + (i + 1)] === 0 && PRODUZ.has(v.situacao) && !especial[p.id]) especial[p.id] = "produzindo"; });
  for (const [k, mat] of Object.entries(luzes)) { const s3 = especial[k] || (k === "mesa" ? "produzindo" : todas), cor = COR[s3]; mat.color.set(cor); mat.emissive.set(cor); mat.emissiveIntensity = s3 === "botoeira" ? 1.2 + Math.sin(performance.now() / 120) : 1.6; }
  const fx = $("faixa"), corF = avisoVivo ? COR.parada : COR[st] || COR.produzindo; if (fx.textContent !== faixa) fx.textContent = faixa; fx.style.background = corF; fx.style.color = corF === COR.quebrada ? "#111" : "#fff";
  estadoAtual = { modo: emCiclo ? "vivo" : "parada", est, tRel, especial, todas, naMesa, vivo: { ang, ext: 0 } };
}
let ultimoPainelVivo = 0;
function atualizarPainelVivo(agora) {
  if (agora - ultimoPainelVivo < 200) return; ultimoPainelVivo = agora;
  const a = amostras[amostras.length - 1], k = arq.linha.pecas_por_golpe || 1;
  if (a) { $("nCiclos").textContent = fmt(a.v.golpes ?? 0); $("nSaidas").textContent = fmt((a.v.pecas_saida ?? 0) * k); $("nBot").textContent = fmt(a.v.botoeiras ?? 0); $("nMesa").textContent = fmt(estadoAtual.naMesa || 0); }
  $("relogio").textContent = a ? "AO VIVO · " + new Date(a.t).toLocaleTimeString("pt-BR") : "AO VIVO · sem leitura";
  // carta e mostrador pelo ângulo do CLP
  const ang = estadoAtual.vivo?.ang ?? 0, frac = ang / 360, x = 8 + 220 * frac;
  if ($("cursor")) { $("cursor").setAttribute("x1", x); $("cursor").setAttribute("x2", x); $("txtGraus").textContent = fmt(ang, 0) + "°"; const r = ang * Math.PI / 180; $("agulha").setAttribute("x2", (282 + 28 * Math.sin(r)).toFixed(1)); $("agulha").setAttribute("y2", (46 - 28 * Math.cos(r)).toFixed(1));
    const ps = a?.v.passo || 0; $("txtPasso").textContent = ps ? "Passo " + ps + " · " + NOMES_PASSO[ps - 1] + " (CLP)" : "linha parada (CLP)"; $("txtTempo").textContent = "ângulo do encoder do transfer"; }
  if (modoTela === "comparacao") desenharComparacao();
}
function desenharComparacao() {
  const box = $("compCorpo");
  if (!compV || compV.ant === compV.ini) { box.textContent = "Esperando leituras do CLP…"; return; }
  const obsS = (compV.ant.t - compV.ini.t) / 1000, horas = obsS / 3600;
  const nG = compV.marca && compV.ultMarca ? compV.ultMarca.golpes - compV.marca.golpes : 0;
  const cicloReal = nG > 0 ? (compV.ultMarca.prod - compV.marca.prod) / nG : null, cicloMod = c.destacker_variacao.ciclo_medio_s;
  const dCiclo = cicloReal ? 100 * (cicloReal - cicloMod) / cicloMod : null;
  const pecasReal = (compV.ant.v.pecas_saida - compV.ini.v.pecas_saida) / Math.max(horas, 1e-9), pecasMod = rTudo.golpes_saida / rTudo.horas_simuladas;
  const tot = rTudo.segundos_simulados / 60, pm = rTudo.perdas_min, pct = (x) => 100 * x / Math.max(obsS, 1e-9);
  const linhas = [
    ["Ciclo médio em produção (s)", cicloReal, cicloMod, 3, dCiclo],
    ["Golpes por minuto em produção", cicloReal ? 60 / cicloReal : null, 60 / cicloMod, 2, cicloReal ? -100 * (cicloReal - cicloMod) / cicloReal : null],
    ["Peças por hora (com as paradas)", pecasReal, pecasMod, 0, 100 * (pecasReal - pecasMod) / pecasMod],
    ["Parado por quebra (% do tempo)", pct(compV.parado[1]), 100 * pm.quebrada / tot, 1, null],
    ["Parado pela botoeira (%)", pct(compV.parado[2]), 100 * pm.botoeira / tot, 1, null],
    ["Troca de ferramenta (%)", pct(compV.parado[3]), 100 * pm.troca_ferramenta / tot, 1, null],
    ["Faltou blank (%)", pct(compV.parado[4]), 100 * pm.faltou_blank / tot, 1, null],
  ];
  let h = "<table><tr><th></th><th>Real (CLP)</th><th>Modelo</th><th>Desvio</th></tr>";
  for (const [n, r, m, d, dv] of linhas) h += `<tr><td>${n}</td><td>${r == null ? "—" : fmt(r, d)}</td><td>${fmt(m, d)}</td><td>${dv == null ? (r == null ? "" : (r - m >= 0 ? "+" : "−") + fmt(Math.abs(r - m), 1) + " p.p.") : (dv >= 0 ? "+" : "−") + fmt(Math.abs(dv), 1) + "%"}</td></tr>`;
  h += "</table>";
  if (dCiclo != null && nG >= 20) {
    const ok = Math.abs(dCiclo) <= 5;
    h += `<div class="ver ${ok ? "bom" : "ruim"}">${ok ? "O ritmo real bate com o modelo (desvio de " + fmt(dCiclo, 1) + "%, dentro da meta de 5%)." : "O real está " + fmt(Math.abs(dCiclo), 1) + "% " + (dCiclo > 0 ? "mais lento" : "mais rápido") + " que o modelo — investigar (meta: até 5%)."}</div>`;
  }
  h += `<div class="sub">Observado: ${textoTempo(obsS)} ${String(Math.floor(obsS % 60)).padStart(2, "0")} s · ${fmt(compV.golpesProd)} golpes em produção.${horas < 1 ? " Paradas e peças/hora só valem com pelo menos 1 hora de observação." : ""}</div>`;
  box.innerHTML = h;
}
$("mSim").onclick = () => escolherModo("simulado"); $("mEsp").onclick = () => escolherModo("espelho"); $("mComp").onclick = () => escolherModo("comparacao");
$("bLigar").onclick = ligar; $("bZerarComp").onclick = () => { compV = null; };

// ---------------------------------------------------------------- laço
let ultimoQuadro = performance.now();
function quadro(agora) {
  const dt = Math.min(0.1, (agora - ultimoQuadro) / 1000); ultimoQuadro = agora;
  if (rDia && modoTela === "simulado") {
    if (tocando) { T = Math.min(FIM, T + dt * vel); if (T >= FIM) { tocando = false; botaoTocar(); } }
    desenhar(T); atualizarPainel(agora);
  } else if (rDia) { desenharAoVivo(); atualizarPainelVivo(agora); }
  if (tween) { const a = Math.min(1, (agora - tween.t0) / tween.dur), s = a * a * (3 - 2 * a); camera.position.lerpVectors(tween.de, tween.para, s); controles.target.lerpVectors(tween.deA, tween.paraA, s); if (a >= 1) tween = null; }
  else if (seguir) { const wp = empilhadeira.getWorldPosition(new THREE.Vector3()), d = wp.clone().sub(seguir.ultimo); camera.position.add(d); controles.target.add(d); seguir.ultimo.copy(wp); }
  controles.update(); renderer.render(cena, camera); if (grupo && c) atualizarRotulos();
  requestAnimationFrame(quadro);
}
function redimensionar() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener("resize", redimensionar);

// ---------------------------------------------------------------- controles
function botaoTocar() { $("bTocar").textContent = tocando ? "⏸ Pausar" : "▶ Tocar"; }
$("bTocar").onclick = () => { if (!tocando && T >= FIM) T = 0; tocando = !tocando; botaoTocar(); };
window.addEventListener("keydown", (e) => { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); $("bTocar").click(); } });
const vbox = $("velocidades");
for (const v of VELOCIDADES) { const b = document.createElement("button"); b.textContent = (v < 1 ? String(v).replace(".", ",") : v) + "×"; b.dataset.v = v; b.setAttribute("aria-pressed", String(v === vel)); b.onclick = () => { vel = v; for (const x of vbox.children) x.setAttribute("aria-pressed", String(x === b)); }; vbox.appendChild(b); }
$("tempo").oninput = (e) => { T = e.target.value / 1000 * FIM; };
$("cGeral").onclick = camGeral; $("cGarg").onclick = camGargalo; $("cDest").onclick = camDest; $("cMesa").onclick = camMesa; $("cEmp").onclick = camEmp;
controles.addEventListener("start", () => { tween = null; });
$("arquivo").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { carregar(JSON.parse(await f.text())); } catch (err) { aviso("Não consegui ler este arquivo: " + err.message); } };
function aviso(t) { const a = $("aviso"); a.hidden = !t; a.textContent = t || ""; }
const leg = $("legenda"); for (const [k, nome] of LEGENDA) { const d = document.createElement("span"); d.innerHTML = "<i></i>"; d.firstChild.style.background = COR[k]; d.append(nome); leg.appendChild(d); }

// ---------------------------------------------------------------- carregar
function carregar(a) {
  if (a.formato === "simulador-linha/1") { location.href = "index.html" + location.search; return; }
  if (a.formato !== "simulador-linha/2") throw new Error("o arquivo não é de linha transfer (simulador-linha/2)");
  arq = a; aviso("Simulando a linha…");
  $("titulo").textContent = a.linha.nome.replace(/\s*\(FICT[ÍI]CIA\)\s*/i, " ");
  if (/FICT/i.test(a.linha.nome)) { const s = document.createElement("span"); s.className = "selo"; s.textContent = "FICTÍCIA"; $("titulo").appendChild(s); }
  const disp = a.calculado?.tempo_disponivel_dia_min ?? 480;
  $("subtitulo").textContent = (a.linha.produto || "") + " · transfer (CLP mestre) · " + a.prensas.length + " prensas · reprodução do 1º dia · resultados de " + (a.linha.dias_simulados || 1) + " dias";
  montar();
  setTimeout(() => {
    c = calcularCiclo(a);
    rDia = simularTransfer(a, { horas: disp / 60, registrar: true }); FIM = rDia.segundos_simulados;
    rTudo = simularTransfer(a);
    preparar(); montarCarta(); preencherResultado(); listarMapas().catch(() => {});
    const q = new URLSearchParams(location.search);
    T = q.get("t") ? +q.get("t") : 0;
    if (q.get("vel")) { vel = +q.get("vel"); for (const x of vbox.children) x.setAttribute("aria-pressed", String(+x.dataset.v === vel)); }
    if (q.get("pausado")) { tocando = false; botaoTocar(); }
    const cam = q.get("cam"); ({ gargalo: camGargalo, destacker: camDest, mesa: camMesa, empilhadeira: camEmp }[cam] || camGeral)();
    if (q.get("modo") === "espelho" || q.get("modo") === "comparacao") escolherModo(q.get("modo"));
    aviso(""); window.telaPronta = true;
  }, 30);
}
window.telaVivo = { ligar: async (mapa) => { await listarMapas(); if (mapa) $("mapa").value = mapa; await ligar(); }, comp: () => compV };
window.tela = { irPara: (t) => { T = t; }, pausar: () => { tocando = false; botaoTocar(); }, tocar: () => { tocando = true; botaoTocar(); }, camGeral, camGargalo, camDest, camMesa, camEmp, estado: () => ({ T, FIM, modo: estadoAtual.modo }) };

redimensionar(); camera.position.set(0, 8, 14); controles.target.set(5, 1, 0); requestAnimationFrame(quadro);
const linhaURL = new URLSearchParams(location.search).get("linha") || "../modelos/linha_T_transfer_FICTICIA.json";
fetch(linhaURL).then((r) => { if (!r.ok) throw new Error("arquivo não encontrado: " + linhaURL); return r.json(); }).then(carregar)
  .catch((err) => aviso("Não consegui abrir a linha. " + err.message + " — use o botão “Abrir outra linha…”."));
