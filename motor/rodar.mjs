// Simulador de Linha — roda a simulação de um arquivo de linha e mostra o resultado em texto (etapa E2).
// Uso: node motor/rodar.mjs <arquivo_da_linha.json> [resultado.json]
import { readFileSync, writeFileSync } from "node:fs";
import { simular } from "./simulador.js";
import { gerarRelatorio } from "./relatorio.mjs";
import { calcularCiclo } from "./sincronismo.js";
import { simularTransfer } from "./simulador_transfer.js";
import { gerarRelatorioSincronismo } from "./relatorio_sincronismo.mjs";
import { conferir } from "./formato.js";

const [, , entrada, saida] = process.argv;
if (!entrada) { console.log("Uso: node motor/rodar.mjs <arquivo_da_linha.json> [resultado.json]"); process.exit(2); }
const arq = JSON.parse(readFileSync(entrada, "utf8"));
const conf = conferir(arq);
if (conf.erros.length) { console.log("O arquivo da linha tem " + conf.erros.length + " ponto(s) para corrigir (use ABRIR_FORMULARIOS.bat):"); for (const e of conf.erros) console.log("  - " + e.campo + ": " + e.txt); process.exit(1); }
arq.calculado = { ...(arq.calculado || {}), ...conf.calculado };
if (arq.formato === "simulador-linha/2") { rodarTransfer(); process.exit(0); }
const t0 = Date.now(), r = simular(arq);
const n = (x, c = 0) => x == null ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const L = arq.linha, k = L.pecas_por_golpe || 1;

console.log("\n=== SIMULAÇÃO: " + r.linha + " ===");
console.log("Peça: " + (L.produto || "—") + " · " + n(r.dias_simulados, 1) + " dias de produção (" + n(r.horas_simuladas, 1) + " h disponíveis) · semente " + L.semente);
console.log("\nRESULTADO");
console.log("  Peças boas:           " + n(r.pecas_boas) + "  (" + n(r.pecas_por_dia) + " por dia · " + n(r.pecas_por_hora) + " por hora)");
console.log("  Demanda:              " + n(r.demanda_pecas_dia) + " por dia  →  " + (r.pecas_por_dia >= r.demanda_pecas_dia ? "ATENDE" : "NÃO ATENDE") +
  " (" + n(100 * r.pecas_por_dia / r.demanda_pecas_dia, 1) + "% da demanda)");
console.log("  Ritmo real:           uma peça boa a cada " + n(r.ciclo_real_s, 2) + " s  ·  takt pedido " + n(r.takt_s, 2) + " s");
console.log("  OEE da linha:         " + n(100 * r.oee_linha.oee, 1) + "%  (ciclo ideal da linha " + n(r.oee_linha.ciclo_ideal_s, 2) + " s)");
console.log("  Golpes por minuto:    " + n(r.golpes_saida / (r.horas_simuladas * 60), 2) + " (média com todas as perdas)");
console.log("  Refugo:               " + n(r.refugo_pecas) + " peças");
console.log("  Trocas de ferramenta: " + n(r.trocas_ferramenta) + " (" + n(r.tempo_troca_ferramenta_s / 60, 0) + " min de troca com a linha parada; o esvaziamento antes da troca aparece na coluna Troca ferr.)");
console.log("  Estoque médio na linha: " + n(r.estoque_medio_golpes, 1) + " golpes · cada peça fica " + n(r.tempo_medio_na_linha_s, 1) + " s na linha");
if (r.empilhadeiras) console.log("  Empilhadeira(s):      " + r.empilhadeiras.quantidade + " · " + n(r.empilhadeiras.pedidos) + " trocas · ocupada " +
  n(r.empilhadeiras.uso_pct, 1) + "% do tempo · espera média " + n(r.empilhadeiras.espera_media_min, 1) + " min (máx. " + n(r.empilhadeiras.espera_max_min, 1) + " min)");

console.log("\nCADA ESTAÇÃO (% do tempo disponível)");
console.log("  " + "Estação".padEnd(34) + "Produz.  Faltou peça  Bloqueada  Quebrada  Troca ferr.  Refugo     OEE");
for (const e of r.estacoes) {
  const p = e.pct, c = (x) => (n(x, 1) + "%").padStart(8);
  console.log("  " + (e.nome + (e.id === r.gargalo ? "  ◀ GARGALO" : "")).slice(0, 33).padEnd(34) + c(p.produzindo) + "  " + c(p.faltou_peca) + "    " +
    c(p.bloqueada) + "  " + c(p.quebrada) + "    " + c(p.troca_ferramenta) + "  " + String(e.refugo * k).padStart(6) + "  " + (n(100 * e.oee.oee, 1) + "%").padStart(6));
}
const g = r.estacoes.find((e) => e.id === r.gargalo);
console.log("\nGARGALO: " + g.nome + " — produz ou está quebrada " + n(g.pct.produzindo + g.pct.quebrada, 1) + "% do tempo, a mais ocupada da linha.");
console.log("(simulação em " + n((Date.now() - t0) / 1000, 1) + " s)\n");
if (saida) {
  const { registro, ...sem } = r; writeFileSync(saida, JSON.stringify(sem, null, 2)); console.log("Resultado gravado em " + saida);
  const rel = saida.replace(/_resultado\.json$|\.json$/i, "") + "_relatorio.html";
  writeFileSync(rel, gerarRelatorio(arq, r)); console.log("Relatório (abrir no navegador; Ctrl+P salva em PDF): " + rel);
}

// ---------------------------------------------------------------- linha transfer (etapa S2): motor de sincronismo
function rodarTransfer() {
  const c = calcularCiclo(arq), L = arq.linha, k = L.pecas_por_golpe || 1, disp = arq.calculado.tempo_disponivel_dia_min;
  const n = (x, d = 0) => x == null ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  console.log("\n=== SINCRONISMO DA LINHA TRANSFER: " + L.nome + " ===");
  console.log("O CLP do transfer é o mestre · " + arq.prensas.length + " prensas · " + arq.interpress.quantidade + " interpress\n");
  console.log("CICLO (360° do transfer)");
  for (const p of c.passos) console.log("  " + (p.n + ". " + p.nome).padEnd(46) + n(p.tempo_s, 3).padStart(7) + " s   " + (n(p.grau_inicio, 0) + "° → " + n(p.grau_fim, 0) + "°").padStart(12));
  console.log("  " + "CICLO".padEnd(46) + n(c.ciclo_s, 3).padStart(7) + " s   →  " + n(c.golpes_por_minuto, 2) + " golpes/min · " + n(c.pecas_por_hora, 0) + " peças/h");
  console.log("\nPASSO 4 (em paralelo)");
  for (const r of c.ramos) console.log("  " + r.nome.padEnd(46) + n(r.tempo_s, 3).padStart(7) + " s   " + (r.id === c.segura.id ? "◀ SEGURA A LINHA" : "folga " + n(r.folga_s, 3) + " s"));
  console.log("\nQUEM SEGURA: " + c.segura.nome + ". Melhorando até " + c.proximo.nome + " (" + n(c.proximo.tempo_s, 3) + " s): ciclo " + n(c.ciclo_se_igualar_s, 3) + " s = " + n(c.gpm_se_igualar, 2) + " golpes/min.");
  console.log("Destacker: atrasa a linha em " + n(c.destacker_variacao.atrasa_pct, 1) + "% dos ciclos · ciclo médio " + n(c.destacker_variacao.ciclo_medio_s, 3) + " s (" + n(c.destacker_variacao.gpm_medio, 2) + " golpes/min) · pior caso " + n(c.destacker_variacao.ciclo_pior_s, 3) + " s");
  console.log("Sem nenhuma perda: " + n(disp * 60 / c.ciclo_s * k) + " peças/dia · demanda " + n(L.demanda_pecas_dia) + " · takt " + n(c.takt_s, 2) + " s");
  console.log("Enchimento: " + c.enchimento.posicoes + " posições = " + n(c.enchimento.tempo_s, 0) + " s até a primeira peça sair depois de uma troca.");
  const t0 = Date.now(), r = simularTransfer(arq), dias = r.dias_simulados;
  console.log("\n=== SIMULAÇÃO: " + n(dias, 0) + " dias de produção (" + n(r.horas_simuladas, 1) + " h disponíveis) · semente " + L.semente + " ===");
  console.log("  Peças boas:          " + n(r.pecas_boas) + "  (" + n(r.pecas_por_dia) + " por dia · " + n(r.pecas_por_hora) + " por hora)");
  console.log("  Demanda:             " + n(L.demanda_pecas_dia) + " por dia  →  " + (r.pecas_por_dia >= L.demanda_pecas_dia ? "ATENDE" : "NÃO ATENDE") + " (" + n(100 * r.pecas_por_dia / L.demanda_pecas_dia, 1) + "%)");
  console.log("  Ritmo real:          uma peça boa a cada " + n(r.ritmo_real_s, 2) + " s  ·  takt " + n(r.takt_s, 2) + " s");
  console.log("  OEE da linha:        " + n(100 * r.oee.oee, 1) + "%  (disponibilidade " + n(100 * r.oee.disponibilidade, 1) + "% · desempenho " + n(100 * r.oee.desempenho, 1) + "% · qualidade " + n(100 * r.oee.qualidade, 2) + "%)");
  console.log("\nPARA ONDE VAI O TEMPO (min por dia de " + n(disp) + " min)");
  const nomes = { bom: "Peças boas (ciclo ideal)", troca_ferramenta: "Troca de ferramenta", quebrada: "Quebras", botoeira: "Botoeira da operadora", faltou_blank: "Faltou blank", ciclo_lento: "Ciclo acima do ideal", enchimento: "Enchimento", refugo: "Refugo" };
  for (const [id, nome] of Object.entries(nomes)) console.log("  " + nome.padEnd(30) + n(r.perdas_min[id] / dias, 1).padStart(8) + " min   " + n(100 * r.perdas_min[id] / (disp * dias), 1).padStart(5) + "%");
  console.log("\n  Quebras: " + r.quebras.filter((q) => q.falhas).sort((a, b) => b.min - a.min).map((q) => q.nome.split(" (")[0].split(" — ")[0] + " " + q.falhas + "× " + n(q.min, 0) + " min").join(" · "));
  console.log("  Botoeira: " + r.botoeira.paradas + " paradas · ruins " + n(r.pecas_ruins_saida) + " (achadas " + n(r.refugo_achado) + ", passaram " + n(r.defeitos_passaram) + ")");
  console.log("  Operadora ocupada " + n(r.operadora.ocupacao_pct, 1) + "% · mesa chegou a " + r.operadora.mesa_max + " peças · trocas de ferramenta " + r.trocas_ferramenta);
  if (r.empilhadeira) console.log("  Empilhadeira: " + r.empilhadeira.pedidos + " trocas de pilha · ocupada " + n(r.empilhadeira.uso_pct, 1) + "% · faltou blank " + n(r.destacker.faltou_blank_min, 0) + " min no total");
  console.log("(simulação em " + n((Date.now() - t0) / 1000, 1) + " s)\n");
  if (saida) {
    const { registro, sincronismo, ...sem } = r;
    writeFileSync(saida, JSON.stringify({ formato: "resultado-transfer/1", linha: L.nome, sincronismo: c, simulacao: sem }, null, 2)); console.log("Resultado gravado em " + saida);
    const rel = saida.replace(/_resultado\.json$|\.json$/i, "") + "_relatorio.html";
    writeFileSync(rel, gerarRelatorioSincronismo(arq, c, r)); console.log("Relatório (abrir no navegador; Ctrl+P salva em PDF): " + rel);
  }
}
