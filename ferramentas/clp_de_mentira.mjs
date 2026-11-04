// Simulador de Linha — CLP DE MENTIRA (etapa S5, 04/11/2026).
// Um "CLP" de teste no próprio PC (escuta SÓ em 127.0.0.1): roda a simulação da linha transfer em TEMPO REAL e responde
// em Modbus TCP ou SLMP (Mitsubishi), nos endereços do mapa de sinais, como se fosse a máquina. Serve para testar a ponte,
// o modo Espelho e a Comparação sem chegar perto da linha real. Só responde leituras.
// Para parecer uma linha de verdade, ele usa OUTRA semente (o sorteio não é o mesmo do modelo) e pode ser mais lento.
// Uso: node ferramentas/clp_de_mentira.mjs [mapa_de_sinais.json] [--vel 1] [--mais-lento 0] [--semente 101]
//   --vel N         acelera o tempo (1 = tempo real)
//   --mais-lento P  a "linha real" fica P% mais lenta que o modelo em todos os movimentos (para ver o desvio na Comparação)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conferir } from "../motor/formato.js";
import { simularTransfer } from "../motor/simulador_transfer.js";
import { calcularCiclo } from "../motor/sincronismo.js";
import { prepararReproducao, estadoEm } from "../motor/reproducao_transfer.js";
import { servidorModbus } from "./clp/modbus.mjs";
import { servidorSLMP } from "./clp/slmp.mjs";
import { memoriaVazia, gravarNaMemoria, valoresDoEstado } from "./clp/sinais.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), opc = (k, p) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : p; };
const arqMapa = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) || path.join(RAIZ, "modelos", "linha_T_sinais_modbus.json");
const mapa = JSON.parse(fs.readFileSync(arqMapa, "utf8"));
const cm = conferir(mapa); if (cm.erros.length) { console.error("Mapa de sinais com erro:\n  " + cm.erros.map((e) => e.campo + ": " + e.txt).join("\n  ")); process.exit(1); }
const arq = JSON.parse(fs.readFileSync(path.join(RAIZ, mapa.linha), "utf8"));
const cl = conferir(arq); if (cl.erros.length) { console.error("Arquivo da linha com erro."); process.exit(1); }
arq.calculado = { ...(arq.calculado || {}), ...cl.calculado };

// "linha real": outra semente e, se pedido, P% mais lenta em tudo
const vel = opc("--vel", 1), lento = opc("--mais-lento", 0) / 100, semente = opc("--semente", (arq.linha.semente ?? 1) + 100);
const real = structuredClone(arq); real.linha.semente = semente;
if (lento) {
  const f = 1 + lento;
  for (const e of [real.transfer.eixo_x, real.transfer.eixo_y]) { e.vel_mm_s /= f; e.acel_mm_s2 /= f * f; }
  real.transfer.confirmacao_s *= f;
  for (const p of real.prensas) { p.spm_volante /= f; p.embreagem_s *= f; p.freio_s *= f; }
  for (const k of ["min", "mais_comum", "max"]) real.destacker.pega_s[k] *= f;
}
const disp = arq.calculado.tempo_disponivel_dia_min;
const c = calcularCiclo(real), r = simularTransfer(real, { horas: disp / 60, registrar: true }), rep = prepararReproducao(real, c, r);

const protocolo = mapa.conexao.protocolo, porta = mapa.conexao.porta, mem = memoriaVazia(protocolo);
const inicio = Date.now(), t0 = opc("--inicio", 0);
const tSim = () => (t0 + (Date.now() - inicio) / 1000 * vel) % rep.fim;
function atualizar() { gravarNaMemoria(mem, protocolo, mapa.sinais, valoresDoEstado(estadoEm(rep, tSim()))); }
atualizar(); setInterval(atualizar, 20);

const srv = await (protocolo === "slmp" ? servidorSLMP(mem, porta) : servidorModbus(mem, porta)).catch((e) => { console.error("Não consegui abrir a porta " + porta + ": " + e.message); process.exit(1); });
const NOMES = ["produzindo", "QUEBRA", "BOTOEIRA", "TROCA DE FERRAMENTA", "FALTOU BLANK", "enchendo", "esvaziando"];
console.log("\n  CLP DE MENTIRA — " + arq.linha.nome);
console.log("  Responde " + (protocolo === "slmp" ? "SLMP (Mitsubishi, quadro 3E binário)" : "Modbus TCP (unidade " + (mapa.conexao.unidade ?? 1) + ")") + " em 127.0.0.1:" + porta + " — só leitura, só neste PC.");
console.log("  'Linha real' = semente " + semente + (lento ? " · " + (lento * 100).toFixed(1) + "% mais lenta que o modelo" : "") + " · ciclo " + c.ciclo_s.toFixed(3) + " s · velocidade " + vel + "×");
console.log("  Para encerrar: feche esta janela.\n");
if (!process.env.SEM_LINHA_DE_STATUS) setInterval(() => {
  const e = estadoEm(rep, tSim());
  process.stdout.write("\r  " + new Date().toLocaleTimeString("pt-BR") + " · ângulo " + e.angulo_transfer.toFixed(0).padStart(3) + "° · passo " + e.passo + " · golpes " + e.golpes + " · " + NOMES[e.situacao].padEnd(20));
}, 500);
export { srv };
