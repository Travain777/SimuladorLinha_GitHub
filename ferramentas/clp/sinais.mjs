// Simulador de Linha — mapa de sinais: ler do CLP (ponte) e escrever na memória do CLP DE MENTIRA (etapa S5, 04/11/2026).
// A leitura agrupa os endereços vizinhos para fazer poucas perguntas ao CLP. Nada aqui escreve num CLP de verdade:
// `gravarNaMemoria` só mexe nas tabelas do CLP de mentira, dentro deste programa.
import { ClienteModbus, endereco as endModbus } from "./modbus.mjs";
import { ClienteSLMP, endereco as endSLMP } from "./slmp.mjs";

export function criarCliente(conexao) {
  const c = conexao;
  return c.protocolo === "slmp" ? new ClienteSLMP({ host: c.endereco_ip, porta: c.porta, tempoMax_ms: c.tempo_max_ms }) : new ClienteModbus({ host: c.endereco_ip, porta: c.porta, unidade: c.unidade ?? 1, tempoMax_ms: c.tempo_max_ms });
}
const palavras = (s) => (s.tipo === "registro32" ? 2 : 1);

// prepara os blocos de leitura (uma pergunta por bloco)
export function blocosDeLeitura(protocolo, sinais) {
  const itens = [];
  for (const s of sinais) {
    if (!s.endereco) continue;
    const e = protocolo === "slmp" ? endSLMP(s.endereco) : endModbus(s.endereco);
    if (!e) continue;
    itens.push({ s, e, grupo: protocolo === "slmp" ? e.dev : e.area, n: e.n, qtd: palavras(s) });
  }
  const blocos = [], MAX = 120;
  for (const g of [...new Set(itens.map((i) => i.grupo))]) {
    const lista = itens.filter((i) => i.grupo === g).sort((a, b) => a.n - b.n);
    let atual = null;
    for (const it of lista) {
      if (atual && it.n + it.qtd - atual.ini <= MAX) { atual.itens.push(it); atual.fim = Math.max(atual.fim, it.n + it.qtd); }
      else { atual = { grupo: g, ini: it.n, fim: it.n + it.qtd, itens: [it], e: it.e }; blocos.push(atual); }
    }
  }
  return blocos;
}

// lê todos os sinais: devolve { id: valor já na escala }
export async function lerSinais(cliente, protocolo, blocos) {
  const v = {};
  for (const b of blocos) {
    const qtd = b.fim - b.ini;
    const brutos = protocolo === "slmp" ? await cliente.ler({ ...b.e, n: b.ini }, qtd) : await cliente.ler(b.e.fc, b.ini, qtd);
    for (const it of b.itens) {
      const k = it.n - b.ini, s = it.s;
      const bruto = s.tipo === "registro32" ? brutos[k] + brutos[k + 1] * 65536 : brutos[k];
      v[s.id] = s.tipo === "bit" ? bruto : +(bruto * s.escala).toFixed(6);
    }
  }
  return v;
}

// ---------------------------------------------------------------- CLP de mentira: memória
export function memoriaVazia(protocolo) {
  return protocolo === "slmp" ? { D: [], W: [], R: [], M: [], X: [], Y: [], B: [], L: [] } : { C: [], DI: [], HR: [], IR: [] };
}
export function gravarNaMemoria(mem, protocolo, sinais, valores) {
  for (const s of sinais) {
    if (!s.endereco || valores[s.id] == null) continue;
    const e = protocolo === "slmp" ? endSLMP(s.endereco) : endModbus(s.endereco); if (!e) continue;
    const tab = mem[protocolo === "slmp" ? e.dev : e.area];
    if (s.tipo === "bit") { tab[e.n] = valores[s.id] ? 1 : 0; continue; }
    const bruto = Math.max(0, Math.round(valores[s.id] / s.escala));
    if (s.tipo === "registro32") { tab[e.n] = bruto & 0xffff; tab[e.n + 1] = Math.floor(bruto / 65536) & 0xffff; }   // palavra baixa primeiro
    else tab[e.n] = bruto & 0xffff;
  }
}
// valores que o CLP de mentira põe em cada sinal conhecido, a partir do estado da simulação
export function valoresDoEstado(est) {
  const v = { situacao: est.situacao, comp_parada: est.comp, angulo_transfer: est.angulo_transfer, passo: est.passo, x_mm: est.x_mm, y_mm: est.y_mm,
    golpes: est.golpes, pecas_saida: est.pecas_saida, botoeiras: est.botoeiras, magazine_atual: est.magazine_atual, blanks_mag_A: est.blanks[0] ?? 0, blanks_mag_B: est.blanks[1] ?? 0, em_ciclo: est.em_ciclo };
  est.prensas_pms.forEach((p, i) => { v["prensa_pms_" + (i + 1)] = p; });
  return v;
}
