// Simulador de Linha — VALIDAR com a linha real (etapa E6, 04/11/2026).
// Compara o simulador com o apontamento de turnos reais e/ou com uma gravação da ponte do CLP (só leitura).
// O relatório vai para a pasta privado/ (tem dados da empresa: não publicar).
// Uso: node ferramentas/validar.mjs [privado/apontamento.json] [--gravacao registros/ao_vivo_x.jsonl | --gravacao ultima]
//                                  [--linha privado/linha_real.json] [--sementes 40] [--sem-abrir]
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validarApontamento, validarGravacao } from "../motor/validacao.js";
import { gerarRelatorioValidacao } from "../motor/relatorio_validacao.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const carimbo = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join("/");
function dentro(p, pastas) {                                       // só arquivos de dentro do Simulador, nas pastas certas
  const a = path.resolve(RAIZ, p), r = rel(a);
  if (!pastas.some((x) => r.startsWith(x + "/")) || r.includes("..")) throw new Error(p + ": use um arquivo das pastas " + pastas.join(", ") + ".");
  if (!fs.existsSync(a)) throw new Error("não achei " + r);
  return a;
}
const lerJSON = (a) => JSON.parse(fs.readFileSync(a, "utf8"));

// quantos dados da linha ainda são os da Linha T fictícia (para lembrar de preencher os reais)
function aindaFicticia(linha) {
  try {
    const T = lerJSON(path.join(RAIZ, "modelos", "linha_T_transfer_FICTICIA.json")); let iguais = 0, total = 0;
    const cmp = (a, b) => { if (a && typeof a === "object") { for (const k of Object.keys(a)) if (!["id", "nome", "calculado", "alterado_em", "ordem", "observacao", "produto"].includes(k)) cmp(a[k], b?.[k]); } else if (typeof a === "number") { total++; if (a === b) iguais++; } };
    cmp({ transfer: linha.transfer, prensas: linha.prensas, destacker: linha.destacker, saida: linha.saida }, { transfer: T.transfer, prensas: T.prensas, destacker: T.destacker, saida: T.saida });
    return { iguais, total };
  } catch { return null; }
}

export function rodarValidacao({ apontamento, gravacao, linha, sementes = 40 } = {}) {
  let ap = null, arqLinha = linha ? dentro(linha, ["modelos", "privado"]) : null, grav = null;
  if (apontamento) { ap = lerJSON(dentro(apontamento, ["privado", "modelos", "conferencia"])); if (!arqLinha) arqLinha = dentro(ap.linha, ["modelos", "privado"]); }
  if (gravacao === "ultima") {
    const d = path.join(RAIZ, "registros"), fs_ = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^ao_vivo_.*\.jsonl$/.test(f)).sort() : [];
    if (!fs_.length) throw new Error("não há gravação do CLP na pasta registros (ligue a ponte na tela 3D, modo Espelho).");
    gravacao = "registros/" + fs_[fs_.length - 1];
  }
  if (gravacao) {
    grav = dentro(gravacao, ["registros", "privado", "conferencia"]);
    if (!arqLinha) {                                                 // a linha do mapa de sinais que gravou
      const cab = JSON.parse(fs.readFileSync(grav, "utf8").split(/\r?\n/)[0] || "{}");
      const mapa = cab.mapa ? lerJSON(dentro(cab.mapa, ["modelos", "privado"])) : null;
      arqLinha = dentro(mapa?.linha || "privado/linha_real.json", ["modelos", "privado"]);
    }
  }
  if (!ap && !grav) throw new Error("diga o apontamento (privado/....json) e/ou --gravacao.");
  const L = lerJSON(arqLinha);
  const v = ap ? validarApontamento(L, ap, { sementes }) : null;
  const g = grav ? validarGravacao(L, fs.readFileSync(grav, "utf8")) : null;
  const fic = aindaFicticia(L), avisoFic = fic && fic.iguais / fic.total > 0.5 && !/FICT/i.test(L.linha?.nome || "")
    ? "O arquivo da linha (" + rel(arqLinha) + ") ainda tem " + fic.iguais + " de " + fic.total + " números iguais aos da Linha T fictícia: preencha os tempos reais no formulário antes de tirar conclusão." : null;
  if (avisoFic && v) v.avisos.unshift(avisoFic); else if (avisoFic && g) g.aviso = avisoFic;
  const nome = (ap ? path.basename(apontamento, ".json") : path.basename(grav, ".jsonl")).replace(/[^A-Za-z0-9_\-]/g, "_");
  fs.mkdirSync(path.join(RAIZ, "privado"), { recursive: true });
  const base = path.join(RAIZ, "privado", "validacao_" + nome + "_" + carimbo());
  fs.writeFileSync(base + ".html", gerarRelatorioValidacao(v, g, { apontamento: ap?.nome || (apontamento && rel(dentro(apontamento, ["privado", "modelos", "conferencia"]))), gravacao: grav && rel(grav), ficticio: !!(ap?.ficticio || (grav && /FICT/i.test(fs.readFileSync(grav, "utf8").slice(0, 400)))) }), "utf8");
  fs.writeFileSync(base + ".json", JSON.stringify({ linha: rel(arqLinha), apontamento: apontamento || null, gravacao: grav ? rel(grav) : null, validacao: v, gravacao_clp: g }, null, 1), "utf8");
  return { relatorio: rel(base + ".html"), resultado: rel(base + ".json"), linha: rel(arqLinha), v, g, avisoFic };
}

// ---------------------------------------------------------------- linha de comando
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opc = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const apontamento = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--sem-abrir"].includes(args[i - 1])));
  try {
    const r = rodarValidacao({ apontamento, gravacao: opc("--gravacao"), linha: opc("--linha"), sementes: +(opc("--sementes") || 40) });
    const p = (x, d = 2) => (x == null ? "—" : (x > 0 ? "+" : "") + x.toFixed(d).replace(".", ",") + "%");
    console.log("\n  VALIDAÇÃO COM A LINHA REAL — " + r.linha + "  (meta: até ±5% em peças)");
    if (r.avisoFic) console.log("\n  ATENÇÃO: " + r.avisoFic);
    if (r.v) {
      const R = r.v.reproducao, P = r.v.previsao;
      console.log("\n  1. Reprodução (" + r.v.turnos_usados + " turnos, mesmas paradas): real " + R.real.toLocaleString("pt-BR") + " · simulador " + R.sim.toLocaleString("pt-BR") + " · " + p(R.dif_pct) + (R.dentro_meta ? "  DENTRO da meta" : "  FORA da meta"));
      console.log("  2. Previsão (" + P.sementes + " sementes): peças boas reais " + P.real.toLocaleString("pt-BR") + " · simulador " + Math.round(P.sim_media).toLocaleString("pt-BR") + " (" + Math.round(P.sim_p5).toLocaleString("pt-BR") + " a " + Math.round(P.sim_p95).toLocaleString("pt-BR") + ") · " + p(P.dif_pct) + (P.dentro_meta ? "  DENTRO da meta" : "  FORA da meta"));
      for (const a of r.v.avisos) console.log("     aviso: " + a);
    }
    if (r.g) console.log("\n  Gravação do CLP (" + r.g.duracao_min.toFixed(1).replace(".", ",") + " min): ciclo medido " + (r.g.ciclo.medio_s?.toFixed(3) ?? "—") + " s × modelo " + r.g.ciclo.modelo_medio_s.toFixed(3) + " s · " + r.g.comparado + " " + r.g.reproducao.real + " × simulador " + r.g.reproducao.sim + " · " + p(r.g.reproducao.dif_pct) + (r.g.reproducao.dentro_meta ? "  DENTRO da meta" : "  FORA da meta"));
    console.log("\n  Relatório (PRIVADO): " + r.relatorio + "\n");
    if (!args.includes("--sem-abrir") && !process.env.SEM_NAVEGADOR) {
      const f = path.join(RAIZ, r.relatorio); exec(process.platform === "win32" ? 'start "" "' + f + '"' : process.platform === "darwin" ? 'open "' + f + '"' : 'xdg-open "' + f + '"');
    }
  } catch (e) { console.error("\n  Não validou: " + e.message + "\n"); process.exit(1); }
}
