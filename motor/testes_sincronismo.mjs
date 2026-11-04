// Simulador de Linha — testes do motor de sincronismo (etapa S2): cada caso é comparado com a conta feita à mão.
// Uso: node motor/testes_sincronismo.mjs
import { readFileSync } from "node:fs";
import { perfil, golpe, angulo, alturaMartelo, calcularCiclo, estadoNoCiclo } from "./sincronismo.js";

const base = JSON.parse(readFileSync(new URL("../modelos/linha_T_transfer_FICTICIA.json", import.meta.url), "utf8"));
const copia = (f) => { const a = structuredClone(base); f(a); return a; };
const casos = [];
function caso(nome, conta, esperado, obtido, tol = 0.0005) {
  const dif = Math.abs(obtido - esperado);
  casos.push({ nome, conta, esperado, obtido, ok: dif <= tol, dif, tol });
}
function sim(nome, conta, cond) { casos.push({ nome, conta, esperado: 1, obtido: cond ? 1 : 0, ok: !!cond, dif: cond ? 0 : 1, tol: 0, logico: true }); }

// 1) eixo X chega na velocidade máxima (perfil trapezoidal)
caso("1. Eixo X: 650 mm, 1500 mm/s, 6000 mm/s²", "650/1500 + 1500/6000 = 0,4333 + 0,25", 650 / 1500 + 1500 / 6000, perfil(650, 1500, 6000).tempo_s);
// 2) curso curto: não chega na velocidade (perfil triangular)
caso("2. Curso curto: 40 mm, 600 mm/s, 6000 mm/s²", "v²/a = 60 mm > 40 → 2·√(40/6000)", 2 * Math.sqrt(40 / 6000), perfil(40, 600, 6000).tempo_s);
// 3) no meio do tempo o eixo está no meio do curso (perfil simétrico) e no fim está no curso todo
{ const p = perfil(650, 1500, 6000); caso("3. Meio do movimento = meio do curso", "pos(t/2) = 650/2", 325, p.pos(p.tempo_s / 2), 1e-9);
  caso("3b. Fim do movimento = curso todo", "pos(t) = 650", 650, p.pos(p.tempo_s), 1e-9); }
// 4) golpe da prensa mecânica
caso("4. Golpe: 32 gpm, embreagem 0,08 s, freio 0,12 s", "0,08 + 60/32 + 0,12 = 2,075 s", 2.075, golpe({ spm_volante: 32, embreagem_s: 0.08, freio_s: 0.12 }).tempo_s);
// 5) ângulo e martelo: no meio da volta está no PMI (180°, altura 0); no começo no PMS (altura = curso)
{ const g = golpe({ spm_volante: 30, embreagem_s: 0.1, freio_s: 0.1 });
  caso("5. Meio da volta = PMI 180°", "0,1 + (60/30)/2 = 1,1 s → 180°", 180, angulo(g, 1.1), 1e-9);
  caso("5b. Martelo no PMI", "altura = 0 mm", 0, alturaMartelo(200, 180), 1e-9);
  caso("5c. Martelo no PMS", "altura = curso = 200 mm", 200, alturaMartelo(200, 0), 1e-9); }
// 6) ciclo da linha T
{ const c = calcularCiclo(base), tx = 650 / 1500 + 1500 / 6000, ty = 80 / 600 + 600 / 6000;
  const esp = (ty + 0.03) + (tx + 0.03) + (ty + 0.03) + (2.075 + 0.03);
  caso("6. Ciclo da Linha T", "(Y+0,03) + (X+0,03) + (Y+0,03) + (golpe P1 2,075+0,03)", esp, c.ciclo_s);
  caso("6b. Golpes por minuto", "60 ÷ ciclo", 60 / esp, c.golpes_por_minuto, 0.002);
  sim("6c. Quem segura é o golpe da Prensa 1 (32 gpm, a mais lenta)", "golpe 2,075 > destacker 1,8 > X volta 0,683", c.segura.id === "golpe" && c.segura.prensa === "EST_Prensa_1");
  caso("6d. Os passos somam o ciclo", "soma dos 4 passos = ciclo", c.ciclo_s, c.passos.reduce((s, p) => s + p.tempo_s, 0), 0.002);
  caso("6e. 360° do transfer = um ciclo", "último passo termina em 360°", 360, c.passos[3].grau_fim, 1e-6);
  caso("6f. Enchimento: 9 interpress + 8 prensas", "17 posições × ciclo", 17 * esp, c.enchimento.tempo_s, 0.01); }
// 7) se a Prensa 1 for a 35 gpm como as outras, o destacker passa a segurar? Não: golpe 35 gpm = 1,914 s > destacker 1,8 s
{ const c = calcularCiclo(copia((a) => { a.prensas[0].spm_volante = 35; }));
  const tx = 650 / 1500 + 1500 / 6000, ty = 80 / 600 + 600 / 6000, esp = 2 * ty + tx + (0.08 + 60 / 35 + 0.12) + 4 * 0.03;
  caso("7. Prensa 1 a 35 gpm", "golpe 0,08 + 60/35 + 0,12 = 1,914 s", esp, c.ciclo_s);
  sim("7b. Ainda é o golpe que segura (1,914 s > destacker 1,8 s)", "golpe > destacker", c.segura.id === "golpe"); }
// 8) destacker lento passa a segurar a linha
{ const c = calcularCiclo(copia((a) => { a.destacker.pega_s = { min: 2.2, mais_comum: 2.5, max: 3 }; }));
  sim("8. Destacker de 2,5 s segura a linha", "2,5 s > golpe 2,075 s", c.segura.id === "destacker");
  caso("8b. Folga do golpe da Prensa 1", "2,5 − 2,075 = 0,425 s", 0.425, c.ramos.find((r) => r.id === "golpe").folga_s); }
// 9) eixo X lento: o X conta duas vezes (avança e volta) e a volta segura o passo 4
{ const c = calcularCiclo(copia((a) => { a.transfer.eixo_x.vel_mm_s = 300; }));
  const tx = 650 / 300 + 300 / 6000, ty = 80 / 600 + 600 / 6000;
  caso("9. Eixo X a 300 mm/s", "Y + X + Y + X(volta segura) + 4 confirmações", 2 * ty + 2 * tx + 0.12, c.ciclo_s);
  sim("9b. Quem segura é o X voltando", "X 2,217 s > golpe 2,075 s", c.segura.id === "x_volta"); }
// 10) sem confirmação: só os movimentos
{ const c = calcularCiclo(copia((a) => { a.transfer.confirmacao_s = 0; }));
  const tx = 650 / 1500 + 1500 / 6000, ty = 80 / 600 + 600 / 6000;
  caso("10. Confirmação 0 s", "Y + X + Y + golpe", 2 * ty + tx + 2.075, c.ciclo_s); }
// 11) ganho se o que segura melhorar até o próximo limite: a Prensa 1 golpeando como a Prensa 2
{ const c = calcularCiclo(base);
  caso("11. Ganho se a P1 golpear como a P2 (a próxima mais lenta)", "2,075 − 1,914 = 0,161 s", 2.075 - (0.08 + 60 / 35 + 0.12), c.ganho_se_igualar_s, 0.001);
  sim("11b. Depois quem segura é o golpe da Prensa 2", "1,914 s > destacker 1,8 s", c.proximo.prensa === "EST_Prensa_2"); }
// 13) variação do destacker (triangular 1,6 / 1,8 / 2,4) contra o golpe de 2,075 s
{ const c = calcularCiclo(base), a = 1.6, m = 1.8, b = 2.4, g = 2.075, K = (b - a) * (b - m);
  caso("13. Ciclos em que o destacker atrasa a linha", "(2,4 − 2,075)² ÷ (0,8 × 0,6) = 22,0%", 100 * (b - g) ** 2 / K, c.destacker_variacao.atrasa_pct, 0.01);
  const P = (b - g) ** 2 / K, cauda = (2 / K) * ((b * b * b / 2 - b ** 3 / 3) - (b * g * g / 2 - g ** 3 / 3));
  const media = g * (1 - P) + cauda;                                 // média de max(golpe, pega), conta fechada
  caso("13b. Ciclo médio com a variação do destacker", "ciclo − 2,075 + média de max(2,075; pega)", 3.345 - g + media, c.destacker_variacao.ciclo_medio_s, 0.001);
  caso("13c. Pior caso (destacker no máximo)", "ciclo − 2,075 + 2,4", 3.345 - g + b, c.destacker_variacao.ciclo_pior_s, 0.001); }
// 12) posição dos eixos ao longo do ciclo
{ const c = calcularCiclo(base);
  const meioX = c.passos[1].inicio_s + perfil(650, 1500, 6000).tempo_s / 2;
  caso("12. No meio do X avança, a barra está em 325 mm", "metade do passo", 325, estadoNoCiclo(base, c, meioX).x_mm, 1e-6);
  caso("12b. No passo 3 os fingers estão encaixados (Y = 80 mm no início)", "Y = curso", 80, estadoNoCiclo(base, c, c.passos[2].inicio_s).y_mm, 1e-6);
  const pmi = c.passos[3].inicio_s + 0.08 + (60 / 32) / 2;
  caso("12c. Prensa 1 no PMI no meio da volta", "180°", 180, estadoNoCiclo(base, c, pmi).prensas[0].graus, 1e-6); }

// 14) todas as prensas iguais (35 gpm): empate — para ganhar é preciso melhorar as 8; o próximo limite é o destacker
{ const c = calcularCiclo(copia((a) => { a.prensas[0].spm_volante = 35; }));
  sim("14. Empate das 8 prensas", "8 prensas com golpe 1,914 s", c.segura.empatadas.length === 8);
  caso("14b. Próximo limite = destacker", "1,914 − 1,8 = 0,114 s", (0.08 + 60 / 35 + 0.12) - 1.8, c.ganho_se_igualar_s, 0.001); }

let ok = 0;
console.log("\nTESTES DO MOTOR DE SINCRONISMO — conta à mão × motor\n");
const f = (x) => (Math.abs(x) >= 100 ? x.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : x.toFixed(4).replace(".", ","));
for (const c of casos) {
  if (c.ok) ok++;
  console.log((c.ok ? "OK    " : "FALHOU") + "  " + c.nome);
  console.log("        conta: " + c.conta + (c.logico ? "" : "  →  esperado " + f(c.esperado) + " · motor " + f(c.obtido) + " · diferença " + f(c.dif)));
}
console.log("\n" + ok + " de " + casos.length + " casos certos.");
process.exit(ok === casos.length ? 0 : 1);
