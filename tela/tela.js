// Simulador de Linha — tela 3D (etapa E4, 03/11/2026).
// Roda o MESMO motor validado (motor/simulador.js) aqui no navegador e reproduz em 3D o registro de eventos do 1º dia.
// Nada aqui inventa resultado: cada máquina, peça, magazine, rack e empilhadeira se move pelo que o motor registrou.
// Modelos 3D simples feitos em código (genéricos). Na etapa E9 serão trocados pelos modelos do Blender.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { simular } from "../motor/simulador.js";

// ---------------------------------------------------------------- cores e nomes (iguais aos do relatório)
const COR = { produzindo: "#2a78d6", faltou_peca: "#eb6834", bloqueada: "#1baf7a", quebrada: "#eda100", troca_ferramenta: "#e87ba4" };
const NOME = { produzindo: "Produzindo", faltou_peca: "Faltou peça", bloqueada: "Bloqueada", quebrada: "Quebrada", troca_ferramenta: "Troca de ferramenta" };
const VELOCIDADES = [1, 5, 20, 60, 300];
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------------------------------------------------------------- cena
const canvas = $("cena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const cena = new THREE.Scene();
cena.background = new THREE.Color("#1a1c1f");
cena.fog = new THREE.Fog("#1a1c1f", 120, 260);
const pmrem = new THREE.PMREMGenerator(renderer);
cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
cena.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
const controles = new OrbitControls(camera, canvas);
controles.enableDamping = true;
controles.maxPolarAngle = Math.PI * 0.47;
controles.minDistance = 4;
controles.maxDistance = 220;

cena.add(new THREE.HemisphereLight("#e6ecf5", "#3b3631", 0.75));
const sol = new THREE.DirectionalLight("#ffffff", 1.7);
sol.castShadow = true;
sol.shadow.mapSize.set(4096, 2048);
sol.shadow.bias = -0.0004;
cena.add(sol, sol.target);

// materiais
const M = {
  piso: new THREE.MeshStandardMaterial({ color: "#4b4f54", roughness: 0.92, metalness: 0.0 }),
  corpo: new THREE.MeshStandardMaterial({ color: "#8b939b", roughness: 0.45, metalness: 0.55 }),
  escuro: new THREE.MeshStandardMaterial({ color: "#363b40", roughness: 0.6, metalness: 0.4 }),
  claro: new THREE.MeshStandardMaterial({ color: "#c7ccd1", roughness: 0.4, metalness: 0.5 }),
  amarelo: new THREE.MeshStandardMaterial({ color: "#e0ac00", roughness: 0.5, metalness: 0.2 }),
  chapa: new THREE.MeshStandardMaterial({ color: "#d3d9df", roughness: 0.28, metalness: 0.85 }),
  esteira: new THREE.MeshStandardMaterial({ color: "#26292c", roughness: 0.8, metalness: 0.1 }),
  pneu: new THREE.MeshStandardMaterial({ color: "#151617", roughness: 0.9 }),
  faixa: new THREE.MeshBasicMaterial({ color: "#c9a400" }),
  luzBranca: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.4 }),
  cacamba: new THREE.MeshStandardMaterial({ color: "#5b4636", roughness: 0.8, metalness: 0.2 }),
};
const geoChapa = new THREE.BoxGeometry(1.6, 0.05, 1.1);

function caixa(w, h, d, mat, x = 0, y = 0, z = 0, pai = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (pai) pai.add(m);
  return m;
}
function cilindro(r, h, mat, x = 0, y = 0, z = 0, pai = null, eixo = "y") {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat);
  if (eixo === "z") m.rotation.x = Math.PI / 2;
  if (eixo === "x") m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (pai) pai.add(m);
  return m;
}

// piso fixo
const piso = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), M.piso);
piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; cena.add(piso);
const grade = new THREE.GridHelper(400, 200, "#6a6e72", "#4f5256");
grade.position.y = 0.005; grade.material.transparent = true; grade.material.opacity = 0.35; cena.add(grade);

// ---------------------------------------------------------------- estado da tela
let arq = null, rDia = null, rTudo = null;
let linhaGrupo = null;
let maquinas = {};       // "EST_x/j" -> { estado, t0, dur, ... }
let estacoesV = [];      // por estação: { cfg, cx, ponto, slots(), rotulo, maqs[] }
let mags = [], racks = [], empilhadeiras = [], viagens = [];
let unidades = new Map(), poolUn = [];
let filas = {};          // id da estação -> [ids das unidades no estoque antes dela]
let ev = [], p = 0, T = 0, FIM = 1, k = 1;
let cont = { saidas: 0, refugo: 0, trocas: 0, emTroca: false };
let ultimoMag = 0, ultimoRack = 0;
let tocando = true, vel = 5, seguir = null, tween = null;
const pilhaCheia = () => (arq.abastecimento?.entrada?.pecas_por_pilha || 1);
const rackUn = () => Math.max(1, Math.floor((arq.abastecimento?.saida?.pecas_por_rack || 1) / k));

// ---------------------------------------------------------------- tipos visuais (genéricos, pela palavra no nome)
function tipoVisual(e) {
  const s = (e.nome + " " + e.id).toLowerCase();
  if (e.tipo === "alimentacao" || s.includes("destack")) return "destacker";
  if (s.includes("lavad")) return "lavadora";
  if (s.includes("centraliz")) return "mesa";
  if (s.includes("prensa")) return "prensa";
  if (e.tipo === "saida") return "fim";
  return "generica";
}
const LARGURA = { destacker: 6, lavadora: 6, mesa: 3.2, prensa: 5.4, fim: 6.5, generica: 4 };
const ALTURA_ROTULO = { destacker: 4.4, lavadora: 3.2, mesa: 2.2, prensa: 7.6, fim: 3.6, generica: 3.2 };
const Y_PECA = 1.16;

function torreLuz(pai, x, y, z) {               // sinaleiro (andon) com a cor do estado
  cilindro(0.05, 0.6, M.escuro, x, y + 0.3, z, pai);
  const mat = new THREE.MeshStandardMaterial({ color: "#888", emissive: "#888", emissiveIntensity: 1.6, roughness: 0.3 });
  const lamp = cilindro(0.17, 0.42, mat, x, y + 0.81, z, pai);
  lamp.castShadow = false;
  return mat;
}

function construirMaquina(tipo, g, w, n) {
  // devolve partes animadas; o ponto da peça é sempre (0, Y_PECA, 0) no grupo da máquina, exceto no destacker
  const r = { tipo };
  if (tipo === "prensa") {
    caixa(4.4, 1.0, 3.2, M.corpo, 0, 0.5, 0, g);                 // mesa (base)
    caixa(3.4, 0.12, 2.5, M.escuro, 0, 1.06, 0, g);              // placa da ferramenta inferior
    for (const sx of [-1, 1]) caixa(0.75, 5.4, 2.8, M.corpo, sx * 1.85, 3.7, 0, g);   // colunas
    caixa(4.8, 1.4, 3.3, M.corpo, 0, 7.0, 0, g);                 // coroa
    caixa(0.4, 1.2, 0.4, M.escuro, -1.6, 7.9, 1.2, g);           // motor
    cilindro(0.55, 0.35, M.escuro, 1.2, 7.0, 1.82, g, "z");      // volante
    const martelo = new THREE.Group(); g.add(martelo);
    caixa(3.2, 0.9, 2.3, M.claro, 0, 0, 0, martelo);
    caixa(3.0, 0.32, 2.1, M.escuro, 0, -0.61, 0, martelo);       // ferramenta superior
    r.martelo = martelo; r.yCima = 3.6; r.yBaixo = 1.2 + 0.08 + 0.77;
    martelo.position.y = r.yCima;
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) caixa(0.08, 2.0, 0.08, M.amarelo, sx * 1.55, 2.0, sz * 1.75, g); // cortina de luz
    r.luz = torreLuz(g, 2.2, 7.7, 1.4);
  } else if (tipo === "destacker") {
    caixa(w - 0.4, 0.9, 1.5, M.esteira, 1.2, 0.6, 0, g);         // saída (esteira)
    caixa(w - 0.4, 0.15, 1.6, M.corpo, 1.2, 1.08, 0, g);
    for (const sz of [-1, 1]) {
      caixa(2.0, 0.3, 1.7, M.escuro, -1.3, 0.15, sz * 1.7, g);   // base do magazine
      for (const sx of [-1, 1]) caixa(0.08, 1.9, 0.08, M.amarelo, -1.3 + sx * 0.95, 0.95, sz * 1.7 + 0.8, g);
    }
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) caixa(0.22, 3.6, 0.22, M.corpo, -1.3 + sx * 1.6 + 1.0 * (sx > 0), 1.8, sz * 2.75, g);
    caixa(3.6, 0.3, 5.8, M.corpo, -0.5, 3.65, 0, g);             // pórtico
    const carro = new THREE.Group(); g.add(carro);
    caixa(0.6, 0.35, 0.6, M.claro, 0, 0, 0, carro);
    cilindro(0.06, 1.3, M.escuro, 0, -0.8, 0, carro);
    caixa(1.2, 0.08, 0.8, M.escuro, 0, -1.45, 0, carro);          // ventosas
    carro.position.set(-1.3, 3.3, 0);
    r.carro = carro;
    r.ponto = new THREE.Vector3(1.6, Y_PECA, 0);
    r.luz = torreLuz(g, 2.6, 1.15, -0.7);
  } else if (tipo === "lavadora") {
    caixa(w, 0.9, 1.6, M.esteira, 0, 0.6, 0, g);
    caixa(w, 0.12, 1.7, M.corpo, 0, 1.07, 0, g);
    caixa(w - 1.2, 0.5, 2.6, M.corpo, 0, 2.55, 0, g);            // túnel: teto
    for (const sz of [-1, 1]) caixa(w - 1.2, 1.9, 0.4, M.corpo, 0, 1.55, sz * 1.1, g);
    for (let i = 0; i < 4; i++) caixa(0.12, 0.12, 2.0, M.claro, -1.6 + i * 1.07, 2.2, 0, g);   // barras de bicos
    cilindro(0.5, 1.0, M.claro, -w / 2 + 0.9, 0.5, 1.6, g);       // tanque
    r.luz = torreLuz(g, w / 2 - 0.8, 2.8, 1.05);
  } else if (tipo === "mesa") {
    caixa(2.6, 1.0, 2.4, M.corpo, 0, 0.5, 0, g);
    caixa(2.6, 0.08, 2.4, M.escuro, 0, 1.06, 0, g);
    const emp = [];
    for (const [x, z] of [[-1.15, 0], [1.15, 0], [0, -1.0], [0, 1.0]]) emp.push(caixa(x ? 0.25 : 0.6, 0.18, z ? 0.25 : 0.6, M.amarelo, x, 1.19, z, g));
    r.empurradores = emp;
    r.luz = torreLuz(g, 1.1, 1.0, 1.05);
  } else if (tipo === "fim") {
    caixa(w, 0.9, 1.6, M.esteira, 0, 0.6, 0, g);
    caixa(w, 0.12, 1.7, M.corpo, 0, 1.07, 0, g);
    for (const sz of [-1, 1]) caixa(0.2, 2.6, 0.2, M.corpo, -0.8, 1.3, sz * 1.0, g);   // arco de inspeção
    caixa(0.3, 0.2, 2.2, M.corpo, -0.8, 2.6, 0, g);
    caixa(0.15, 0.06, 1.8, M.luzBranca, -0.8, 2.48, 0, g);
    caixa(1.0, 1.3, 0.6, M.escuro, -0.8, 0.65, 1.8, g);           // painel do inspetor
    r.luz = torreLuz(g, 1.6, 1.15, -0.85);
  } else {
    caixa(3.2, 2.0, 2.4, M.corpo, 0, 1.0, 0, g);
    caixa(3.2, 0.1, 1.5, M.escuro, 0, 1.08, 0, g);
    r.luz = torreLuz(g, 1.3, 2.0, 0.9);
  }
  // placa no chão com a cor do estado
  const mPlaca = new THREE.MeshBasicMaterial({ color: "#888", transparent: true, opacity: 0.33, depthWrite: false });
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, 4.2), mPlaca);
  placa.rotation.x = -Math.PI / 2; placa.position.y = 0.02; g.add(placa);
  r.placa = mPlaca;
  return r;
}

function construirEsteira(pai, x0, x1) {         // estoque entre estações
  const L = x1 - x0; if (L <= 0.05) return;
  const cx = (x0 + x1) / 2;
  caixa(L, 0.1, 1.5, M.esteira, cx, 1.02, 0, pai);
  for (const sz of [-1, 1]) caixa(L, 0.18, 0.1, M.corpo, cx, 1.0, sz * 0.8, pai);
  for (let x = x0 + 0.3; x < x1; x += 1.6) for (const sz of [-1, 1]) caixa(0.1, 1.0, 0.1, M.escuro, x, 0.5, sz * 0.7, pai);
}

function construirEmpilhadeira() {
  const g = new THREE.Group();
  caixa(2.0, 0.9, 1.3, M.amarelo, 0, 0.75, 0, g);               // corpo
  caixa(0.7, 1.0, 1.3, M.escuro, -0.95, 0.9, 0, g);             // contrapeso
  for (const [x, z] of [[-0.85, 0.6], [-0.85, -0.6], [0.2, 0.6], [0.2, -0.6]]) {
    for (const sx of [-1]) caixa(0.07, 1.4, 0.07, M.escuro, x + 0.0 * sx, 1.9, z, g);
  }
  caixa(1.2, 0.07, 1.3, M.escuro, -0.32, 2.6, 0, g);            // proteção do operador
  caixa(0.5, 0.6, 0.5, M.escuro, -0.35, 1.45, 0, g);            // banco
  for (const [x, z, r] of [[0.65, 0.62, 0.32], [0.65, -0.62, 0.32], [-0.75, 0.6, 0.27], [-0.75, -0.6, 0.27]]) cilindro(r, 0.25, M.pneu, x, r, z, g, "z");
  for (const sz of [-1, 1]) caixa(0.1, 2.9, 0.12, M.escuro, 1.08, 1.55, sz * 0.35, g);   // torre
  const garfo = new THREE.Group(); g.add(garfo);
  caixa(0.08, 0.6, 1.0, M.escuro, 1.18, 0.3, 0, garfo);
  for (const sz of [-1, 1]) caixa(1.3, 0.06, 0.14, M.escuro, 1.85, 0.03, sz * 0.32, garfo);
  garfo.position.y = 0.12;
  const carga = new THREE.Group(); garfo.add(carga);
  const pilha = caixa(1.6, 0.9, 1.1, M.chapa, 1.9, 0.5, 0, carga);
  const rack = new THREE.Group(); carga.add(rack); construirRackModelo(rack, 1.9, 0.08);
  const placasRack = caixa(1.5, 0.7, 1.0, M.chapa, 1.9, 0.5, 0, rack);
  g.userData = { garfo, carga, pilha, rack, placasRack, ang: 0 };
  return g;
}
function construirRackModelo(pai, x, y) {
  caixa(2.0, 0.12, 1.5, M.amarelo, x, y, 0, pai);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caixa(0.08, 1.3, 0.08, M.amarelo, x + sx * 0.95, y + 0.65, sz * 0.7, pai);
}

// ---------------------------------------------------------------- montar a linha a partir do arquivo
function montar() {
  if (linhaGrupo) { cena.remove(linhaGrupo); linhaGrupo.traverse((o) => { if (o.geometry && o.geometry !== geoChapa) o.geometry.dispose(); }); }
  for (const e of estacoesV) e.rotulo.remove();
  linhaGrupo = new THREE.Group(); cena.add(linhaGrupo);
  maquinas = {}; estacoesV = []; mags = []; racks = []; empilhadeiras = []; unidades.clear(); poolUn = [];
  const est = arq.estacoes;
  // posições ao longo do X
  let x = 0;
  const pos = est.map((e, i) => {
    const tipo = tipoVisual(e), w = LARGURA[tipo];
    const p0 = { tipo, x0: x, cx: x + w / 2, w };
    x += w;
    if (i < est.length - 1) { const cap = e.estoque_depois || 0; const gap = cap > 0 ? 1.0 + cap * 1.3 + 0.5 : 1.4; p0.g0 = x; p0.g1 = x + gap; x += gap; }
    return p0;
  });
  const deslocar = -x / 2;
  linhaGrupo.position.x = deslocar;
  const comAbast = (arq.abastecimento?.empilhadeiras || 0) > 0;

  est.forEach((e, i) => {
    const P = pos[i], par = e.paralelas || 1, maqs = [];
    for (let j = 0; j < par; j++) {
      const g = new THREE.Group();
      const z = (j - (par - 1) / 2) * 4.6;
      g.position.set(P.cx, 0, z); linhaGrupo.add(g);
      const r = construirMaquina(P.tipo, g, P.w, j);
      const ponto = (r.ponto ? r.ponto.clone() : new THREE.Vector3(0, Y_PECA, 0)).add(g.position);
      const m = { ...r, g, ponto, estado: "faltou_peca", t0: 0, dur: 1 };
      maquinas[e.id + "/" + j] = m; maqs.push(m);
      pintar(m);
    }
    if (P.g0 != null) {
      construirEsteira(linhaGrupo, P.g0, P.g1);
    }
    if (e.refugo_pct > 0) {                                        // caçamba de refugo
      const c = new THREE.Group(); c.position.set(P.cx + (P.tipo === "prensa" ? 0 : 0.6), 0, 3.0 + ((par - 1) / 2) * 4.6); linhaGrupo.add(c);
      caixa(1.6, 0.7, 1.2, M.cacamba, 0, 0.35, 0, c);
      P.cacamba = new THREE.Vector3(c.position.x, 0.6, c.position.z);
    }
    const rot = document.createElement("div"); rot.className = "rotulo"; $("rotulos").appendChild(rot);
    estacoesV.push({ cfg: e, i, P, maqs, rotulo: rot, ancora: new THREE.Vector3(P.cx, ALTURA_ROTULO[P.tipo], 0), ultimoTexto: "" });
    filas[e.id] = [];
  });

  if (comAbast) {
    const ab = arq.abastecimento, d0 = estacoesV.find((s) => s.cfg.id === ab.entrada.estacao) || estacoesV[0];
    const n = ab.entrada.magazines;
    for (let i = 0; i < n; i++) {
      const z = n === 1 ? 0 : (i === 0 ? -1.7 : 1.7) + (i > 1 ? (i - 1) * 3.4 : 0);
      const x0 = d0.P.cx - 1.3;
      const pilha = caixa(1.6, 1, 1.1, M.chapa, x0, 0, z, linhaGrupo);
      mags.push({ n: ab.entrada.pecas_por_pilha, mesh: pilha, x: x0, z, alvo: new THREE.Vector3(x0 - 1.9, 0, z), dir: 1 });
    }
    const dF = estacoesV.find((s) => s.cfg.id === ab.saida.estacao) || estacoesV[estacoesV.length - 1];
    const nr = ab.saida.posicoes;
    for (let i = 0; i < nr; i++) {
      const z = nr === 1 ? 0 : (i === 0 ? -1.9 : 1.9) + (i > 1 ? (i - 1) * 3.8 : 0);
      const x0 = dF.P.x0 + dF.P.w + 1.6;
      const g = new THREE.Group(); g.position.set(x0, 0, z); linhaGrupo.add(g); construirRackModelo(g, 0, 0.06);
      const pl = caixa(1.5, 1, 1.0, M.chapa, 0, 0, 0, g);
      racks.push({ n: 0, g, mesh: pl, x: x0, z, alvo: new THREE.Vector3(x0 + 1.9, 0, z), dir: -1 });
    }
    for (let i = 0; i < ab.empilhadeiras; i++) {
      const f = construirEmpilhadeira(); linhaGrupo.add(f);
      f.userData.parada = new THREE.Vector3(-deslocar - 4 + i * 4.5, 0, 12);
      f.position.copy(f.userData.parada); f.rotation.y = Math.PI / 2;
      empilhadeiras.push(f);
    }
  }
  // faixas amarelas do corredor
  const L = x + 16;
  for (const z of [-5.2, 6.0, 9.2, 15.0]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.12), M.faixa); f.rotation.x = -Math.PI / 2; f.position.set(-deslocar, 0.012, z); linhaGrupo.add(f); }
  // sol cobrindo a linha toda
  sol.position.set(-x * 0.25, 40, 28); sol.target.position.set(0, 0, 0);
  const c = sol.shadow.camera; c.left = -x / 2 - 12; c.right = x / 2 + 12; c.top = 22; c.bottom = -22; c.near = 1; c.far = 120; c.updateProjectionMatrix();
  atualizarPilhasRacks();
}

// posição de cada lugar do estoque (k = 0 é o mais perto da estação da frente)
function slot(idEst, kk) {
  const s = estacoesV.find((e) => e.cfg.id === idEst); const ant = estacoesV[s.i - 1];
  return new THREE.Vector3(ant.P.g1 - 0.85 - kk * 1.3, Y_PECA - 0.08, 0);
}
function pintar(m) {
  const c = COR[m.estado] || "#888";
  m.luz.color.set(c); m.luz.emissive.set(c); m.placa.color.set(c);
}

// ---------------------------------------------------------------- peças (golpes) em movimento
function pegarPeca(id, de) {
  let u = unidades.get(id);
  if (!u) {
    const mesh = poolUn.pop() || (() => { const m = new THREE.Mesh(geoChapa, M.chapa); m.castShadow = true; linhaGrupo.add(m); return m; })();
    mesh.visible = true;
    u = { mesh, de: de.clone(), para: de.clone(), t0: T, t1: T, some: Infinity, arco: 0 };
    unidades.set(id, u);
  }
  return u;
}
function posicaoPeca(u, t, alvo) {
  const a = u.t1 > u.t0 ? Math.min(1, Math.max(0, (t - u.t0) / (u.t1 - u.t0))) : 1;
  const s = a * a * (3 - 2 * a);
  alvo.lerpVectors(u.de, u.para, s);
  alvo.y += Math.sin(Math.PI * s) * u.arco;
  return alvo;
}
const tmp = new THREE.Vector3();
function mover(u, para, t, dur, arco = 0.35) {
  posicaoPeca(u, t, tmp); u.de.copy(tmp); u.para.copy(para); u.t0 = t; u.t1 = t + dur; u.arco = arco;
}

// ---------------------------------------------------------------- aplicar um evento do registro
function aplicar(e) {
  const t = e.t;
  switch (e.tipo) {
    case "estado": { const m = maquinas[e.est + "/" + e.maq]; if (m) { m.estado = e.estado; m.mudou = true; } break; }
    case "inicio": {
      const m = maquinas[e.est + "/" + e.maq]; if (!m) break;
      m.t0 = t; m.dur = e.dur; m.un = e.un;
      const prim = estacoesV[0].cfg.id === e.est;
      let de = m.ponto;
      if (prim && mags.length) { const mg = mags[ultimoMag]; de = new THREE.Vector3(mg.x, 0.38 + 1.3 * mg.n / pilhaCheia(), mg.z); }
      const u = pegarPeca(e.un, de);
      mover(u, m.ponto, t, Math.min(0.35 * e.dur, 1.6), prim ? 0.9 : 0.35);
      break;
    }
    case "fila": {
      const q = filas[e.est] || (filas[e.est] = []);
      if (e.sai) {
        const ix = q.indexOf(e.un); if (ix >= 0) q.splice(ix, 1);
        q.forEach((id, kk) => { const u = unidades.get(id); if (u) mover(u, slot(e.est, kk), t, 0.7, 0); });
      } else {
        q.push(e.un); const u = unidades.get(e.un);
        if (u) mover(u, slot(e.est, q.length - 1), t, 0.9, 0.2);
      }
      break;
    }
    case "mag": if (mags[e.i]) { mags[e.i].n = e.n; ultimoMag = e.i; } break;
    case "pilha_trocada": if (mags[e.magazine]) mags[e.magazine].n = pilhaCheia(); break;
    case "rack": if (racks[e.i]) { racks[e.i].n = e.n; ultimoRack = e.i; } break;
    case "rack_trocado": if (racks[e.posicao]) racks[e.posicao].n = 0; break;
    case "saida": {
      cont.saidas++;
      const u = unidades.get(e.un); if (!u) break;
      if (racks.length) { const rk = racks[ultimoRack]; mover(u, new THREE.Vector3(rk.x, 0.2 + 1.1 * rk.n / rackUn(), rk.z), t, 1.2, 0.8); }
      else mover(u, tmp.set(u.para.x + 4, u.para.y, 0).clone(), t, 1.5, 0);
      u.some = u.t1; break;
    }
    case "refugo": {
      cont.refugo++;
      const u = unidades.get(e.un); if (!u) break;
      const s = estacoesV.find((x) => x.cfg.id === e.est);
      const alvo = s?.P.cacamba || new THREE.Vector3(u.para.x, 0.3, 3);
      mover(u, alvo, t, 1.0, 0.6); u.some = u.t1; break;
    }
    case "troca_inicio": cont.emTroca = true; break;
    case "troca_fim": cont.emTroca = false; cont.trocas++; break;
  }
}

function reiniciarReproducao() {
  for (const u of unidades.values()) { u.mesh.visible = false; poolUn.push(u.mesh); }
  unidades.clear();
  for (const m of Object.values(maquinas)) { m.estado = "faltou_peca"; m.t0 = 0; m.dur = 1; m.mudou = true; }
  for (const id in filas) filas[id] = [];
  for (const mg of mags) mg.n = pilhaCheia();
  for (const rk of racks) rk.n = 0;
  cont = { saidas: 0, refugo: 0, trocas: 0, emTroca: false };
  ultimoMag = 0; ultimoRack = 0; p = 0; T = 0;
}
function irPara(t) {
  t = Math.max(0, Math.min(FIM, t));
  if (t < T) reiniciarReproducao();
  T = t;
  while (p < ev.length && ev[p].t <= T) aplicar(ev[p++]);
}

// ---------------------------------------------------------------- viagens da empilhadeira (calculadas do registro)
const VIAGEM_S = 25;   // tempo de rodar no corredor (só visual); o resto da "chegada" ela está a caminho, fora da linha
function prepararViagens() {
  viagens = empilhadeiras.map(() => []);
  const livre = empilhadeiras.map(() => -Infinity);
  for (const e of ev) {
    if (e.tipo !== "empilhadeira") continue;
    let f = livre.findIndex((x) => x <= e.t + 1e-6); if (f < 0) f = 0;
    const lugar = e.pedido === "pilha" ? mags[e.alvo] : racks[e.alvo]; if (!lugar) continue;
    const ini = e.t, chega = e.t + e.ida_s, fim = chega + e.troca_s;
    viagens[f].push({ ini, chega, fim, tipo: e.pedido, lugar });
    livre[f] = fim;
  }
}
function caminho(f, lugar) {
  const P0 = f.userData.parada, A = lugar.alvo, ax = A.x + lugar.dir * -3.2;
  return [P0.clone(), new THREE.Vector3(ax, 0, P0.z), new THREE.Vector3(ax, 0, A.z), A.clone()];
}
function pontoNoCaminho(pts, s, saida) {
  const seg = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); tot += d; }
  let alvo = s * tot;
  for (let i = 0; i < seg.length; i++) {
    if (alvo <= seg[i] || i === seg.length - 1) {
      const a = seg[i] ? Math.min(1, alvo / seg[i]) : 1;
      saida.pos.lerpVectors(pts[i], pts[i + 1], a);
      saida.dir.subVectors(pts[i + 1], pts[i]).normalize();
      return saida;
    }
    alvo -= seg[i];
  }
  return saida;
}
const tmpCam = { pos: new THREE.Vector3(), dir: new THREE.Vector3() };
function atualizarEmpilhadeiras(t) {
  empilhadeiras.forEach((f, i) => {
    const lista = viagens[i] || []; const ud = f.userData;
    let v = null; for (let a = 0, b = lista.length - 1; a <= b;) { const m = (a + b) >> 1; if (lista[m].ini <= t) { v = lista[m]; a = m + 1; } else b = m - 1; }
    let pos = ud.parada, dir = new THREE.Vector3(1, 0, 0), altura = 0.12, carga = null, fase = "parada";
    if (v) {
      const pts = caminho(f, v.lugar), sai = v.chega - Math.min(VIAGEM_S, v.chega - v.ini);
      if (t < sai) { fase = "parada"; carga = v.tipo === "pilha" ? "pilha" : null; }
      else if (t < v.chega) { const r = pontoNoCaminho(pts, (t - sai) / (v.chega - sai), tmpCam); pos = r.pos.clone(); dir = r.dir.clone(); carga = v.tipo === "pilha" ? "pilha" : null; fase = "indo"; }
      else if (t < v.fim) { pos = pts[3]; dir = new THREE.Vector3(-v.lugar.dir * -1, 0, 0); const a = (t - v.chega) / (v.fim - v.chega); altura = 0.12 + Math.sin(Math.PI * a) * 0.5; carga = v.tipo === "pilha" && a < 0.9 ? "pilha" : null; fase = "trocando"; }
      else if (t < v.fim + VIAGEM_S) { const r = pontoNoCaminho([...pts].reverse(), (t - v.fim) / VIAGEM_S, tmpCam); pos = r.pos.clone(); dir = r.dir.clone(); if (r.pos.distanceTo(pts[3]) < 3.3) dir.negate(); carga = v.tipo === "rack" ? "rack" : null; fase = "voltando"; }
    }
    f.position.copy(pos);
    const ang = Math.atan2(-dir.z, dir.x);
    let d = ang - ud.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); ud.ang += d * (Math.abs(d) > 2.5 ? 1 : 0.18);
    f.rotation.y = ud.ang;
    ud.garfo.position.y = altura;
    ud.pilha.visible = carga === "pilha"; ud.rack.visible = carga === "rack";
    ud.fase = fase;
  });
}
function atualizarPilhasRacks() {
  for (const mg of mags) { const h = 0.05 + 1.3 * mg.n / pilhaCheia(); mg.mesh.scale.y = h; mg.mesh.position.y = 0.3 + h / 2; }
  for (const rk of racks) { const h = 0.02 + 1.1 * rk.n / rackUn(); rk.mesh.scale.y = h; rk.mesh.position.y = 0.12 + h / 2; rk.mesh.visible = rk.n > 0; }
}

// ---------------------------------------------------------------- partes animadas das máquinas
function animarMaquinas(t) {
  for (const m of Object.values(maquinas)) {
    if (m.mudou) { pintar(m); m.mudou = false; }
    const ph = m.estado === "produzindo" ? Math.min(1, Math.max(0, (t - m.t0) / m.dur)) : (m.estado === "bloqueada" ? 1 : 0);
    if (m.martelo) {
      const desce = m.estado === "produzindo" ? Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (ph - 0.35) / 0.4)))) : 0;
      m.martelo.position.y = m.yCima - (m.yCima - m.yBaixo) * desce;
    }
    if (m.carro) {
      const a = m.estado === "produzindo" ? Math.min(1, ph / 0.4) : 0, s = a * a * (3 - 2 * a);
      const zMag = mags[ultimoMag]?.z ?? 0;
      m.carro.position.set(-1.3 + 2.9 * s, 3.3, zMag * (1 - s));
    }
    if (m.empurradores) {
      const a = m.estado === "produzindo" ? Math.sin(Math.PI * Math.min(1, ph / 0.7)) : 0;
      m.empurradores[0].position.x = -1.15 + 0.3 * a; m.empurradores[1].position.x = 1.15 - 0.3 * a;
      m.empurradores[2].position.z = -1.0 + 0.3 * a; m.empurradores[3].position.z = 1.0 - 0.3 * a;
    }
  }
}

// ---------------------------------------------------------------- rótulos e painel
const proj = new THREE.Vector3();
function atualizarRotulos() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const garg = rTudo?.gargalo;
  for (const s of estacoesV) {
    proj.copy(s.ancora); proj.x += linhaGrupo.position.x; proj.project(camera);
    const visivel = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
    s.rotulo.style.display = visivel ? "" : "none";
    if (!visivel) continue;
    s.rotulo.style.left = ((proj.x + 1) / 2 * w).toFixed(1) + "px";
    s.rotulo.style.top = ((1 - proj.y) / 2 * h).toFixed(1) + "px";
    const estados = s.maqs.map((m) => m.estado);
    const nome = s.cfg.nome.split(" (")[0];
    const txt = nome + "|" + estados.join(",") + "|" + (garg === s.cfg.id);
    if (txt !== s.ultimoTexto) {
      s.ultimoTexto = txt;
      s.rotulo.innerHTML = "<b></b><span></span>";
      s.rotulo.firstChild.textContent = nome;
      s.rotulo.lastChild.textContent = estados.length > 1 ? estados.map((x) => NOME[x]).join(" · ") : NOME[estados[0]];
      s.rotulo.style.borderLeftColor = COR[estados[0]];
      s.rotulo.classList.toggle("garg", garg === s.cfg.id);
    }
  }
}
function textoTempo(seg) { const m = Math.floor(seg / 60); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min"; }
let ultimoPainel = 0;
function atualizarPainel(agoraReal) {
  if (agoraReal - ultimoPainel < 120) return; ultimoPainel = agoraReal;
  $("nBoas").textContent = fmt(cont.saidas * k);
  $("nRefugo").textContent = fmt(cont.refugo * k);
  $("nRitmo").textContent = cont.saidas > 5 ? fmt(T / cont.saidas, 2) + " s/golpe" : "—";
  $("relogio").textContent = "Dia 1 · " + textoTempo(T) + " de " + textoTempo(FIM) + (cont.emTroca ? " · troca de ferramenta" : (Object.values(maquinas).some((m) => m.estado === "troca_ferramenta") ? " · esvaziando para a troca" : ""));
  $("tempo").value = Math.round(T / FIM * 1000);
}
function preencherResultado() {
  const r = rTudo, L = arq.linha;
  const okDem = r.pecas_por_dia >= L.demanda_pecas_dia, okTakt = r.takt_s == null || r.ciclo_real_s <= r.takt_s;
  $("rDia").textContent = fmt(r.pecas_por_dia); $("rDia").className = okDem ? "sim" : "nao";
  $("rDem").textContent = fmt(L.demanda_pecas_dia) + " (" + fmt(100 * r.pecas_por_dia / L.demanda_pecas_dia, 1) + "%)";
  $("rRitmo").textContent = fmt(r.ciclo_real_s, 2) + " s × " + (r.takt_s ? fmt(r.takt_s, 2) + " s" : "—"); $("rRitmo").className = okTakt ? "sim" : "nao";
  $("rOee").textContent = fmt(100 * r.oee_linha.oee, 1) + "%";
  const g = arq.estacoes.find((e) => e.id === r.gargalo);
  $("rGarg").textContent = g ? g.nome.split(" (")[0].split(" — ")[0] : "—";
}

// ---------------------------------------------------------------- câmera
let comprimento = 60;
function irCamera(pos, alvo, seg = 0.9) { tween = { de: camera.position.clone(), deA: controles.target.clone(), para: pos, paraA: alvo, t0: performance.now(), dur: seg * 1000 }; }
function camGeral() { seguir = null; const d = Math.max(30, comprimento * 0.78) * Math.pow(Math.max(1, 1.3 / camera.aspect), 0.75); irCamera(new THREE.Vector3(-comprimento * 0.08, d * 0.62, d * 0.92), new THREE.Vector3(0, 1.5, 3)); marcar("cGeral"); }
function camGargalo() {
  seguir = null; const s = estacoesV.find((e) => e.cfg.id === rTudo?.gargalo) || estacoesV[0];
  const x = s.P.cx + linhaGrupo.position.x; irCamera(new THREE.Vector3(x + 7, 9.5, 19), new THREE.Vector3(x - 1.5, 2.4, 0)); marcar("cGarg");
}
function camEmpilhadeira() {
  if (!empilhadeiras.length) return;
  const f = empilhadeiras[0], wp = f.getWorldPosition(new THREE.Vector3());
  seguir = { f, ultimo: wp.clone() };
  irCamera(wp.clone().add(new THREE.Vector3(-9, 8, 11)), wp.clone().setY(1)); marcar("cEmp");
}
function marcar(id) { for (const b of ["cGeral", "cGarg", "cEmp"]) $(b).setAttribute("aria-pressed", String(b === id)); }

// ---------------------------------------------------------------- laço de desenho
let ultimoQuadro = performance.now();
function quadro(agoraReal) {
  const dt = Math.min(0.1, (agoraReal - ultimoQuadro) / 1000); ultimoQuadro = agoraReal;
  if (arq && ev.length) {
    if (tocando) { irPara(T + dt * vel); if (T >= FIM) { tocando = false; botaoTocar(); } }
    animarMaquinas(T);
    for (const [id, u] of unidades) {
      if (T >= u.some) { u.mesh.visible = false; poolUn.push(u.mesh); unidades.delete(id); continue; }
      posicaoPeca(u, T, u.mesh.position);
    }
    atualizarPilhasRacks();
    atualizarEmpilhadeiras(T);
    atualizarPainel(agoraReal);
  }
  if (tween) {
    const a = Math.min(1, (agoraReal - tween.t0) / tween.dur), s = a * a * (3 - 2 * a);
    camera.position.lerpVectors(tween.de, tween.para, s); controles.target.lerpVectors(tween.deA, tween.paraA, s);
    if (a >= 1) tween = null;
  } else if (seguir) {
    const wp = seguir.f.getWorldPosition(new THREE.Vector3()); const d = wp.clone().sub(seguir.ultimo);
    camera.position.add(d); controles.target.add(d); seguir.ultimo.copy(wp);
  }
  controles.update();
  renderer.render(cena, camera);
  if (linhaGrupo) atualizarRotulos();
  requestAnimationFrame(quadro);
}

function redimensionar() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener("resize", redimensionar);

// ---------------------------------------------------------------- controles da tela
function botaoTocar() { $("bTocar").textContent = tocando ? "⏸ Pausar" : "▶ Tocar"; }
$("bTocar").onclick = () => { if (!tocando && T >= FIM) irPara(0); tocando = !tocando; botaoTocar(); };
window.addEventListener("keydown", (e) => { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); $("bTocar").click(); } });
const vbox = $("velocidades");
for (const v of VELOCIDADES) {
  const b = document.createElement("button"); b.textContent = v + "×"; b.setAttribute("aria-pressed", String(v === vel));
  b.onclick = () => { vel = v; for (const x of vbox.children) x.setAttribute("aria-pressed", String(x === b)); };
  vbox.appendChild(b);
}
$("tempo").oninput = (e) => irPara(e.target.value / 1000 * FIM);
$("cGeral").onclick = camGeral; $("cGarg").onclick = camGargalo; $("cEmp").onclick = camEmpilhadeira;
controles.addEventListener("start", () => { tween = null; });
$("arquivo").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { carregar(JSON.parse(await f.text())); } catch (err) { aviso("Não consegui ler este arquivo: " + err.message); }
};
function aviso(txt) { const a = $("aviso"); a.hidden = !txt; a.textContent = txt || ""; }
const leg = $("legenda");
for (const s of Object.keys(COR)) { const d = document.createElement("span"); d.innerHTML = "<i></i>"; d.firstChild.style.background = COR[s]; d.append(NOME[s]); leg.appendChild(d); }

// ---------------------------------------------------------------- carregar uma linha
function carregar(a) {
  if (a.formato === "simulador-linha/2") { location.href = "transfer.html" + location.search; return; }   // linha transfer: tela própria (S4)
  if (a.formato !== "simulador-linha/1") throw new Error("o arquivo não é do formato simulador-linha/1");
  arq = a; k = a.linha.pecas_por_golpe || 1;
  aviso("Simulando a linha…");
  $("titulo").textContent = a.linha.nome.replace(/\s*\(FICT[ÍI]CIA\)\s*/i, " ");
  if (/FICT/i.test(a.linha.nome)) { const s = document.createElement("span"); s.className = "selo"; s.textContent = "FICTÍCIA"; $("titulo").appendChild(s); }
  const dispDia = a.calculado?.tempo_disponivel_dia_min ?? 480;
  $("subtitulo").textContent = (a.linha.produto || "") + " · reprodução do 1º dia (" + textoTempo(dispDia * 60) + " de produção) · resultados de " + (a.linha.dias_simulados || 1) + " dias simulados";
  montar();
  comprimento = estacoesV.length ? estacoesV[estacoesV.length - 1].P.x0 + estacoesV[estacoesV.length - 1].P.w + 6 : 60;
  setTimeout(() => {
    rDia = simular(a, { horas: dispDia / 60, registrar: true });
    ev = rDia.registro; FIM = rDia.segundos_simulados;
    rTudo = simular(a);
    preencherResultado(); prepararViagens();
    reiniciarReproducao();
    const q = new URLSearchParams(location.search);
    if (q.get("t")) irPara(+q.get("t"));
    if (q.get("vel")) { vel = +q.get("vel"); for (const x of vbox.children) x.setAttribute("aria-pressed", String(x.textContent === vel + "×")); }
    if (q.get("pausado")) { tocando = false; botaoTocar(); }
    const cam = q.get("cam");
    if (cam === "gargalo") camGargalo(); else if (cam === "empilhadeira") camEmpilhadeira(); else camGeral();
    aviso("");
    window.telaPronta = true;
  }, 30);
}

// ganchos para gravar vídeo / tirar foto (etapa E7)
window.tela = { irPara: (t) => irPara(t), pausar: () => { tocando = false; botaoTocar(); }, tocar: () => { tocando = true; botaoTocar(); }, camGeral, camGargalo, camEmpilhadeira, estado: () => ({ T, FIM, cont }) };

redimensionar();
const pos0 = new THREE.Vector3(-10, 30, 50); camera.position.copy(pos0); controles.target.set(0, 1, 0);
requestAnimationFrame(quadro);
const linhaURL = new URLSearchParams(location.search).get("linha") || "../modelos/linha_A_prensas_FICTICIA.json";
fetch(linhaURL).then((r) => { if (!r.ok) throw new Error("arquivo não encontrado: " + linhaURL); return r.json(); })
  .then(carregar)
  .catch((err) => aviso("Não consegui abrir a linha. " + err.message + " — use o botão “Abrir outra linha…”."));
