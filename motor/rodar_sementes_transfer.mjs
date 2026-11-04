// Roda a simulação da linha transfer para várias sementes e devolve um resumo em JSON (conferência com o SimPy, etapa S3).
// Uso: node motor/rodar_sementes_transfer.mjs <arquivo.json> <primeira> <última>
import { readFileSync } from "node:fs";
import { simularTransfer } from "./simulador_transfer.js";
const [, , arqNome, a, b] = process.argv;
const arq = JSON.parse(readFileSync(arqNome, "utf8")); const saida = [];
for (let s = +a; s <= +b; s++) {
  arq.linha.semente = s; const r = simularTransfer(arq), k = arq.linha.pecas_por_golpe || 1;
  saida.push({ golpes_saida: r.golpes_saida, boas: r.pecas_boas / k, paradas_botoeira: r.botoeira.paradas, trocas: r.trocas_ferramenta,
    quebrada_min: r.perdas_min.quebrada, botoeira_min: r.perdas_min.botoeira, faltou_blank_min: r.perdas_min.faltou_blank,
    disponibilidade: r.oee.disponibilidade, oee: r.oee.oee });
}
console.log(JSON.stringify(saida));
