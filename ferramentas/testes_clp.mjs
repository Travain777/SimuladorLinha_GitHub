// Simulador de Linha — testes da comunicação com o CLP (etapa S5). Uso: node ferramentas/testes_clp.mjs
// Confere: leitura Modbus TCP e SLMP ida e volta, endereços em hexadecimal, registro de 32 bits e escala, e que NÃO há escrita.
import fs from "node:fs";
import { ClienteModbus, servidorModbus } from "./clp/modbus.mjs";
import { ClienteSLMP, servidorSLMP, endereco as endSLMP } from "./clp/slmp.mjs";
import { blocosDeLeitura, lerSinais, memoriaVazia, gravarNaMemoria, valoresDoEstado, criarCliente } from "./clp/sinais.mjs";
import { simularTransfer } from "../motor/simulador_transfer.js";
import { calcularCiclo } from "../motor/sincronismo.js";
import { prepararReproducao, estadoEm } from "../motor/reproducao_transfer.js";
import { conferir } from "../motor/formato.js";

const casos = []; const caso = (nome, ok, det = "") => casos.push({ nome, ok: !!ok, det });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1) Modbus: registros e bits
{ const tab = { HR: [], IR: [], C: [], DI: [] }; for (let i = 0; i < 50; i++) { tab.HR[i] = i * 1000 + 7; tab.IR[i] = 65535 - i; tab.C[i] = i % 3 === 0 ? 1 : 0; tab.DI[i] = i % 2; }
  const srv = await servidorModbus(tab, 5120), c = new ClienteModbus({ host: "127.0.0.1", porta: 5120 }); await c.conectar();
  caso("1. Modbus: holding registers (função 3)", eq(await c.ler(3, 10, 5), [10007, 11007, 12007, 13007, 14007]));
  caso("1b. Modbus: input registers (função 4)", eq(await c.ler(4, 0, 3), [65535, 65534, 65533]));
  caso("1c. Modbus: coils (função 1), 20 bits", eq(await c.ler(1, 0, 20), Array.from({ length: 20 }, (_, i) => (i % 3 === 0 ? 1 : 0))));
  caso("1d. Modbus: entradas discretas (função 2)", eq(await c.ler(2, 3, 4), [1, 0, 1, 0]));
  let recusou = 0; for (const fc of [5, 6, 15, 16]) { try { await c.ler(fc, 0, 1); } catch { recusou++; } }
  caso("1e. Modbus: o cliente NÃO escreve (funções 5, 6, 15, 16 recusadas)", recusou === 4);
  c.fechar(); srv.close(); }
// 2) SLMP: palavras, bits e endereços hexadecimais
{ const mem = { D: [], W: [], R: [], M: [], X: [], Y: [], B: [], L: [] }; for (let i = 0; i < 300; i++) { mem.D[i] = 40000 + i; mem.M[i] = i % 4 === 1 ? 1 : 0; mem.X[i] = i === 0x1f ? 1 : 0; }
  const srv = await servidorSLMP(mem, 5121), c = new ClienteSLMP({ host: "127.0.0.1", porta: 5121 }); await c.conectar();
  caso("2. SLMP: palavras D100..D103 (comando 0401)", eq(await c.ler(endSLMP("D100"), 4), [40100, 40101, 40102, 40103]));
  caso("2b. SLMP: bits M0..M8", eq(await c.ler(endSLMP("M0"), 9), [0, 1, 0, 0, 0, 1, 0, 0, 0]));
  caso("2c. SLMP: X em hexadecimal (X1E, X1F, X20)", eq(await c.ler(endSLMP("X1E"), 3), [0, 1, 0]));
  caso("2d. SLMP: o cliente só tem leitura (sem 1401/RUN/STOP)", Object.getOwnPropertyNames(ClienteSLMP.prototype).sort().join(",") === "conectar,constructor,fechar,ler,receber");
  c.fechar(); srv.close(); }
// 3) mapa de sinais: tudo o que o CLP de mentira grava a ponte lê igual (registro32, escala, bits), nos dois protocolos
for (const f of ["linha_T_sinais_modbus.json", "linha_T_sinais_slmp.json"]) {
  const mapa = JSON.parse(fs.readFileSync(new URL("../modelos/" + f, import.meta.url))); mapa.conexao.porta += 200;
  const prot = mapa.conexao.protocolo, mem = memoriaVazia(prot);
  const valores = { situacao: 2, comp_parada: 7, angulo_transfer: 271.3, passo: 4, x_mm: 512.7, y_mm: 80, golpes: 123456, pecas_saida: 70001, botoeiras: 9, magazine_atual: 1, blanks_mag_A: 600, blanks_mag_B: 17, em_ciclo: 1 };
  for (let i = 1; i <= 8; i++) valores["prensa_pms_" + i] = i % 2;
  gravarNaMemoria(mem, prot, mapa.sinais, valores);
  const srv = await (prot === "slmp" ? servidorSLMP(mem, mapa.conexao.porta) : servidorModbus(mem, mapa.conexao.porta));
  const cli = criarCliente(mapa.conexao); await cli.conectar();
  const lidos = await lerSinais(cli, prot, blocosDeLeitura(prot, mapa.sinais));
  const dif = Object.keys(valores).filter((k) => Math.abs((lidos[k] ?? -1) - valores[k]) > 0.051);
  caso("3. " + prot.toUpperCase() + ": os " + Object.keys(valores).length + " sinais lidos = gravados (contador de 32 bits, escala 0,1, bits)", !dif.length, dif.join(","));
  cli.fechar(); srv.close();
}
// 4) CLP de mentira: o estado segue a simulação (ângulo sobe dentro do ciclo, contador = ciclos completos)
{ const arq = JSON.parse(fs.readFileSync(new URL("../modelos/linha_T_transfer_FICTICIA.json", import.meta.url))); arq.calculado = conferir(arq).calculado;
  const c = calcularCiclo(arq), r = simularTransfer(arq, { horas: 2, registrar: true }), rep = prepararReproducao(arq, c, r);
  const ciclo = r.registro.find((e) => e.tipo === "ciclo" && e.t > 3000);
  const angs = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => estadoEm(rep, ciclo.t + f * ciclo.dur).angulo_transfer);
  caso("4. Ângulo do transfer sobe de 0° a 360° dentro do ciclo", angs.every((a, i) => i === 0 || a > angs[i - 1]) && angs[0] < 60 && angs[4] > 300, angs.map((a) => a.toFixed(0)).join(" → "));
  const antes = estadoEm(rep, ciclo.t + 0.01).golpes, depois = estadoEm(rep, ciclo.t + ciclo.dur + 0.01).golpes;
  caso("4b. Contador de golpes conta 1 a cada ciclo completo", depois - antes === 1);
  const n = r.registro.filter((e) => e.tipo === "ciclo" && e.t + e.dur <= 7000).length;
  caso("4c. Contador no instante = ciclos completos da simulação", estadoEm(rep, 7000).golpes === n, estadoEm(rep, 7000).golpes + " × " + n);
  const par = r.registro.find((e) => e.tipo === "parada" && e.motivo === "quebrada");
  if (par) caso("4d. Na quebra, o CLP mostra situação 1 e a máquina certa", (() => { const e = estadoEm(rep, par.t + 1); return e.situacao === 1 && e.comp === rep.comps.indexOf(par.comp) + 1; })());
}

let ok = 0;
console.log("\nTESTES DA COMUNICAÇÃO COM O CLP (só leitura)\n");
for (const c of casos) { if (c.ok) ok++; console.log((c.ok ? "OK    " : "FALHOU") + "  " + c.nome + (c.det ? "  (" + c.det + ")" : "")); }
console.log("\n" + ok + " de " + casos.length + " casos certos.");
process.exit(ok === casos.length ? 0 : 1);
