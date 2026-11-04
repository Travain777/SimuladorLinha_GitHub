// Simulador de Linha — gera um APONTAMENTO e uma GRAVAÇÃO DE CLP FICTÍCIOS para testar a validação (etapa E6).
// A "linha de verdade" é uma linha simulada (com outra semente e, se quiser, alterada); os turnos são cortados dela
// como um apontador faria: peças boas, refugo, cada parada com o equipamento e os minutos, trocas de ferramenta.
// NADA AQUI É DADO REAL. Os dados reais você preenche no formulário, na pasta privado.
import { conferir } from "../motor/formato.js";
import { calcularCiclo } from "../motor/sincronismo.js";
import { simularTransfer } from "../motor/simulador_transfer.js";
import { prepararReproducao, estadoEm } from "../motor/reproducao_transfer.js";
import { valoresDoEstado } from "../ferramentas/clp/sinais.mjs";

function linhaPronta(linha) { const a = structuredClone(linha); a.calculado = { ...(a.calculado || {}), ...conferir(a).calculado }; return a; }
const equip = (a, id) => (id === a.transfer.id ? "transfer" : id === a.destacker.id ? "destacker" : a.prensas.findIndex((p) => p.id === id) >= 0 ? "prensa_" + (a.prensas.findIndex((p) => p.id === id) + 1) : "outro");

export function gerarApontamento(verdade, { turnos = 12, minutos = 420, semente = 777, nome = "TESTE FICTÍCIO" } = {}) {
  const a = linhaPronta(verdade); a.linha.semente = semente;
  const k = a.linha.pecas_por_golpe || 1, aquec = 3600, total = aquec + turnos * minutos * 60;
  const r = simularTransfer(a, { horas: total / 3600, registrar: true, comecar_cheia: true });
  const T = [], P = [], paradas = r.registro.filter((e) => e.tipo === "parada");
  const motivo = { quebrada: "quebra", troca_ferramenta: "troca" };
  for (let i = 0; i < turnos; i++) {
    const ini = aquec + i * minutos * 60, fim = ini + minutos * 60, id = "T" + (i + 1);
    const ciclos = r.registro.filter((e) => e.tipo === "ciclo" && e.t >= ini && e.t + e.dur <= fim + 1e-9);
    const boas = ciclos.filter((e) => e.sai && !e.ruim).length * k, refugo = ciclos.filter((e) => e.sai && e.ruim).length * k;
    // como o apontador faz: cada parada entra no turno com a parte que caiu nele (a que veio de antes começa aos 0 min)
    let vazia = false;
    for (const e of paradas) {
      const a0 = Math.max(e.t, ini), a1 = Math.min(e.t + e.dur, fim);
      if (a1 - a0 < 0.6) continue;
      if (e.t < ini && e.motivo === "troca_ferramenta") vazia = true;
      P.push({ turno: id, motivo: motivo[e.motivo] || e.motivo, equipamento: e.comp ? equip(a, e.comp) : "outro", min: +((a1 - a0) / 60).toFixed(2), inicio_min: +((a0 - ini) / 60).toFixed(2), obs: e.t < ini ? "continuação do turno anterior" : "" });
    }
    const primeiro = r.registro.find((e) => e.tipo === "ciclo" && e.t >= ini);
    if (primeiro && !primeiro.sai) vazia = true;                 // estava enchendo
    T.push({ id, data: "2026-01-" + String(5 + i).padStart(2, "0"), turno: i % 2 ? "2º" : "1º", minutos_disponiveis: minutos, comecou_cheia: vazia ? "nao" : "sim",
      pecas_boas: boas, refugo, usar: "sim", obs: "" });
  }
  return { formato: "simulador-apontamento/1", nome, ficticio: true, linha: "modelos/linha_T_transfer_FICTICIA.json", troca_inclui_esvaziar_encher: "nao",
    obs: "Gerado por conferencia/gerar_apontamento_ficticio.mjs a partir de uma linha simulada — só para testar a validação.", turnos: T, paradas: P };
}

// gravação no formato da ponte da S5 (registros/ao_vivo_*.jsonl), 10 leituras por segundo
export function gerarGravacao(verdade, { minutos = 30, inicio_s = 3600, semente = 777, hz = 10 } = {}) {
  const a = linhaPronta(verdade); a.linha.semente = semente;
  const c = calcularCiclo(a), r = simularTransfer(a, { horas: (inicio_s + minutos * 60) / 3600 + 0.1, registrar: true }), rep = prepararReproducao(a, c, r);
  const t0 = Date.UTC(2026, 0, 5, 9, 0, 0), out = [JSON.stringify({ inicio: new Date(t0).toISOString(), mapa: "modelos/linha_T_sinais_modbus.json", ficticio: "gravação FICTÍCIA gerada por conferencia/gerar_apontamento_ficticio.mjs" })];
  for (let i = 0; i <= minutos * 60 * hz; i++) out.push(JSON.stringify({ t: t0 + i * 1000 / hz, ok: true, ms: 3, v: valoresDoEstado(estadoEm(rep, inicio_s + i / hz)) }));
  return out.join("\n") + "\n";
}
