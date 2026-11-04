// Simulador de Linha — monta o PACOTE DE VISITA (etapa E8, 04/11/2026).
// Copia só o que a demonstração precisa para uma pasta NOVA (nunca grava por cima), com as linhas fictícias prontas,
// os relatórios já gerados e um .bat que abre tudo com um clique, sem internet.
// NUNCA entram: privado/ (dados reais), registros/ (gravações do CLP), _reprovados/, vídeos e cenas geradas.
// Antes de terminar, procura nomes proibidos (empresa, marcas reais) e endereços de internet em todos os arquivos copiados.
// Uso: node ferramentas/montar_pacote_visita.mjs [pasta_destino]      (padrão: ..\SimuladorLinha_Visita, _2, _3…)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p, base = RAIZ) => path.relative(base, p).split(path.sep).join("/");
// nomes que nunca podem ir para o pacote (empresa, marcas reais): um por linha em privado/nomes_proibidos.txt — a lista fica
// na pasta privado para que nem ela vá para o GitHub ou para o pacote
const LISTA = path.join(RAIZ, "privado", "nomes_proibidos.txt");
const NOMES = fs.existsSync(LISTA) ? fs.readFileSync(LISTA, "utf8").split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#")) : [];
const PROIBIDO = NOMES.length ? new RegExp(NOMES.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*")).join("|"), "i") : /(?!)/;
const NUNCA = /^(privado|registros|_reprovados|videos|unreal|node_modules)(\/|$)|\.blend\d*$|_animacao_\d|linha_T_cena_|\.fbx$|\.mp4$|(^|\/)validacao_.*\.(html|json)$|__pycache__|montar_pacote_visita\.mjs$/;

// o que entra (pastas inteiras e arquivos soltos)
const PASTAS = ["motor", "tela", "lib", "ferramentas", "docs", "blender", "conferencia"];
const BATS = ["ABRIR_TELA_3D.bat", "ABRIR_TELA_3D_TRANSFER.bat", "ABRIR_FORMULARIOS.bat", "ABRIR_CENARIOS.bat", "ABRIR_CLP_DE_MENTIRA.bat", "SIMULAR.bat",
  "CONVERTER_PLANILHA.bat", "TESTAR_MOTOR.bat", "CONFERIR_SIMPY.bat", "GERAR_VIDEO_BLENDER.bat", "BLENDER_AO_VIVO.bat", "UNREAL_AO_VIVO.bat", "ABRIR_PAINEL.bat"];
const MODELOS = (f) => /FICTICIA\.json$|_sinais_(modbus|slmp)\.json$|_MODELO\.xlsx$/.test(f);   // só linhas fictícias, mapas do CLP de mentira e planilhas modelo

function destinoNovo(pedido) {
  if (pedido) { const d = path.resolve(pedido); if (fs.existsSync(d)) throw new Error(rel(d, path.dirname(RAIZ)) + " já existe: escolha outro nome (nada é gravado por cima)."); return d; }
  const base = path.join(path.dirname(RAIZ), "SimuladorLinha_Visita");
  for (let i = 1; ; i++) { const d = i === 1 ? base : base + "_" + i; if (!fs.existsSync(d)) return d; }
}
function copiar(de, para, lista) {
  fs.mkdirSync(path.dirname(para), { recursive: true }); fs.copyFileSync(de, para); lista.push(rel(para, DEST));
}
function copiarPasta(p, lista) {
  const d = path.join(RAIZ, p); if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = p + "/" + e.name; if (NUNCA.test(r)) continue;
    if (e.isDirectory()) copiarPasta(r, lista); else copiar(path.join(RAIZ, r), path.join(DEST, r), lista);
  }
}
const crlf = (t) => t.replace(/\r?\n/g, "\r\n");

const DEST = destinoNovo(process.argv[2]);
const lista = [];
console.log("\n  PACOTE DE VISITA — montando em " + DEST);
fs.mkdirSync(DEST, { recursive: true });
for (const p of PASTAS) copiarPasta(p, lista);
for (const f of fs.readdirSync(path.join(RAIZ, "modelos"))) if (MODELOS(f)) copiar(path.join(RAIZ, "modelos", f), path.join(DEST, "modelos", f), lista);
for (const b of BATS) if (fs.existsSync(path.join(RAIZ, b))) copiar(path.join(RAIZ, b), path.join(DEST, b), lista);

// relatórios gerados na hora, dentro do pacote (mesma semente = mesmo resultado)
for (const m of ["linha_A_prensas_FICTICIA.json", "linha_T_transfer_FICTICIA.json"])
  execFileSync(process.execPath, [path.join(DEST, "motor", "rodar.mjs"), path.join(DEST, "modelos", m), path.join(DEST, "modelos", m.replace(/\.json$/, "_resultado.json"))], { cwd: DEST, stdio: "ignore", env: { ...process.env, SEM_NAVEGADOR: "1" } });
for (const f of fs.readdirSync(path.join(DEST, "modelos"))) if (/_(relatorio\.html|resultado\.json)$/.test(f)) lista.push("modelos/" + f);

// exemplo de validação com dados FICTÍCIOS (gerados por simulação) — mostra ao cliente como o modelo é comparado com o real
{
  const { validarApontamento, validarGravacao } = await import(new URL("../motor/validacao.js", import.meta.url));
  const { gerarRelatorioValidacao } = await import(new URL("../motor/relatorio_validacao.mjs", import.meta.url));
  const L = JSON.parse(fs.readFileSync(path.join(DEST, "modelos", "linha_T_transfer_FICTICIA.json"), "utf8"));
  const ap = JSON.parse(fs.readFileSync(path.join(DEST, "conferencia", "apontamento_TESTE_ficticio.json"), "utf8"));
  const v = validarApontamento(L, ap, { sementes: 40 }), g = validarGravacao(L, fs.readFileSync(path.join(DEST, "conferencia", "gravacao_TESTE_ficticia.jsonl"), "utf8"));
  fs.mkdirSync(path.join(DEST, "demo"), { recursive: true });
  fs.writeFileSync(path.join(DEST, "demo", "validacao_exemplo_FICTICIO.html"), gerarRelatorioValidacao(v, g, { apontamento: ap.nome, gravacao: "gravação fictícia de 60 min", ficticio: true }), "utf8");
  lista.push("demo/validacao_exemplo_FICTICIO.html");
}

// um clique: ABRIR_DEMONSTRACAO.bat (CLP de mentira numa janela minimizada + servidor com a página de entrada)
fs.writeFileSync(path.join(DEST, "ABRIR_DEMONSTRACAO.bat"), crlf(`@echo off
chcp 65001 >nul
rem Simulador de Linha - DEMONSTRACAO (pacote de visita, etapa E8). Um clique: abre a pagina de entrada no navegador.
rem Roda tudo neste PC, sem internet. Linhas e numeros ficticios. Para encerrar: feche as janelas pretas.
cd /d "%~dp0"
if exist "%~dp0node\\node.exe" set "PATH=%~dp0node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS ^(ou copie a pasta node com o node.exe para dentro desta pasta^) e rode de novo.
  pause
  exit /b 1
)
echo Ligando o CLP de mentira ^(so neste PC, 127.0.0.1, 5%% mais lento que o modelo^)...
start "Simulador de Linha - CLP de mentira" /min cmd /c "set SEM_LINHA_DE_STATUS=1&& node ferramentas\\clp_de_mentira.mjs modelos\\linha_T_sinais_modbus.json --mais-lento 5"
echo Abrindo a demonstracao...
node ferramentas\\servidor.mjs --menu
pause
`));
lista.push("ABRIR_DEMONSTRACAO.bat");
fs.writeFileSync(path.join(DEST, "LEIA-ME.txt"), crlf(`SIMULADOR DE LINHA — PACOTE DE VISITA (montado em ${new Date().toLocaleString("pt-BR")})

COMO ABRIR
  Duplo clique em ABRIR_DEMONSTRACAO.bat. O navegador abre a página de entrada com tudo:
  linha transfer em 3D, ao vivo com o CLP de mentira, dados da linha, cenários A × B, relatórios e o exemplo de validação.
  Não precisa de internet. Precisa do Node.js instalado (ou de uma pasta "node" com o node.exe dentro desta pasta).
  Para encerrar: feche as janelas pretas (servidor e CLP de mentira).

O QUE TEM AQUI
  Só linhas e números FICTÍCIOS (Linha T transfer e Linha A de estações). Nenhum dado real, nenhuma gravação de CLP.
  O CLP de mentira responde só neste PC (127.0.0.1) e só a leituras. O programa não tem função de escrita no CLP.
  TESTAR_MOTOR.bat confere os motores com as contas feitas à mão; CONFERIR_SIMPY.bat com um segundo modelo (precisa de Python).
  Os outros .bat são os mesmos do projeto (formulários, 3D, cenários, Blender, Unreal). Detalhes em docs\\.

LIMITES (para falar com honestidade)
  O simulador calcula tempo e fluxo; não calcula resistência de peça ou estrutura (isso é elementos finitos).
  O resultado só é tão bom quanto os dados de entrada. O relatório é um estudo técnico, não um laudo de engenharia.
`));
lista.push("LEIA-ME.txt");

// conferências: nomes proibidos, endereços de internet, dados reais
const problemas = [], internet = [];
for (const f of lista) {
  const a = path.join(DEST, f); if (!/\.(js|mjs|html|json|jsonl|txt|md|bat|py|css)$/.test(f)) continue;
  const t = fs.readFileSync(a, "utf8");
  if (PROIBIDO.test(t)) problemas.push(f + ": nome proibido (" + t.match(PROIBIDO)[0] + ")");
  if (/"formato":\s*"simulador-apontamento\/1"/.test(t) && !/"ficticio":\s*true/.test(t)) problemas.push(f + ": apontamento que não é fictício");
  if (/\.(html|js|css)$/.test(f) && f.startsWith("tela/")) for (const u of t.match(/https?:\/\/[^\s"'`)<>]+/g) || []) if (!/localhost|127\.0\.0\.1|www\.w3\.org/.test(u)) internet.push(f + ": " + u);
}
if (fs.existsSync(path.join(DEST, "privado")) || fs.existsSync(path.join(DEST, "registros"))) problemas.push("pasta privado ou registros no pacote");
const tam = lista.reduce((s, f) => s + fs.statSync(path.join(DEST, f)).size, 0);
fs.writeFileSync(path.join(DEST, "pacote.json"), JSON.stringify({ formato: "pacote-visita/1", montado_em: new Date().toISOString(), origem: RAIZ, arquivos: lista.length, bytes: tam, problemas, internet, lista }, null, 1));
console.log("  " + lista.length + " arquivos · " + (tam / 1e6).toFixed(1).replace(".", ",") + " MB");
if (!NOMES.length) console.log("  ATENÇÃO: sem a lista privado/nomes_proibidos.txt — os nomes proibidos não foram conferidos.");
console.log("  Nomes proibidos / dados reais: " + (problemas.length ? problemas.length + " PROBLEMA(S):\n    " + problemas.join("\n    ") : "nenhum"));
console.log("  Endereços de internet nas telas: " + (internet.length ? internet.length + ":\n    " + internet.join("\n    ") : "nenhum (roda sem internet)"));
console.log("\n  Pronto. Abra " + rel(path.join(DEST, "ABRIR_DEMONSTRACAO.bat"), path.dirname(RAIZ)) + "\n");
process.exit(problemas.length ? 1 : 0);
