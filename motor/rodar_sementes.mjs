// Roda o motor para várias sementes e devolve um resumo em JSON (usado pela conferência com o SimPy, etapa E3).
// Uso: node motor/rodar_sementes.mjs <arquivo.json> <primeira> <última>
import { readFileSync } from "node:fs";
import { simular } from "./simulador.js";
const [, , arqNome, a, b] = process.argv;
const arq = JSON.parse(readFileSync(arqNome, "utf8")); const saida = [];
for (let s = +a; s <= +b; s++) {
  arq.linha.semente = s; const r = simular(arq);
  saida.push({ golpes_saida: r.golpes_saida, refugo: r.refugo_pecas / (arq.linha.pecas_por_golpe || 1), trocas: r.trocas_ferramenta,
    empilhadeira_uso_pct: r.empilhadeiras ? r.empilhadeiras.uso_pct : null,
    estacoes: r.estacoes.map((e) => ({ id: e.id, pct: e.pct, oee: e.oee.oee })) });
}
console.log(JSON.stringify(saida));
