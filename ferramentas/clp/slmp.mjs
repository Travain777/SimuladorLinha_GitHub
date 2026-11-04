// Simulador de Linha — SLMP / MC protocolo quadro 3E binário (Mitsubishi Q, L, iQ-R, iQ-F) (etapa S5, 04/11/2026). Sem bibliotecas.
// CLIENTE: SÓ LEITURA. Só existe o comando 0401 (leitura em bloco), em palavras (subcomando 0000) ou bits (0001).
//          Não há comando de escrita (1401) nem de RUN/STOP remoto neste arquivo — o programa não consegue mexer no CLP.
// SERVIDOR: usado só pelo CLP de mentira (teste no próprio PC). Também só responde leituras.
import net from "node:net";

// código do dispositivo (binário) e se o número é hexadecimal no manual (X, Y, B, W)
export const DISPOSITIVOS = { D: [0xa8, false, "palavra"], W: [0xb4, true, "palavra"], R: [0xaf, false, "palavra"], M: [0x90, false, "bit"], X: [0x9c, true, "bit"], Y: [0x9d, true, "bit"], B: [0xa0, true, "bit"], L: [0x92, false, "bit"] };
// "D100" → { dev:"D", codigo:0xA8, n:100, tipo:"palavra" } ; "X1F" → n = 0x1F
export function endereco(txt) {
  const m = /^(D|W|R|M|X|Y|B|L)([0-9A-F]{1,6})$/i.exec(String(txt || "").trim());
  if (!m) return null;
  const dev = m[1].toUpperCase(), [codigo, hex, tipo] = DISPOSITIVOS[dev];
  if (!hex && !/^\d+$/.test(m[2])) return null;
  const n = parseInt(m[2], hex ? 16 : 10);
  return n <= 0xffffff ? { dev, codigo, n, tipo } : null;
}

export class ClienteSLMP {
  constructor({ host, porta = 5000, tempoMax_ms = 1500 }) { Object.assign(this, { host, porta, tempoMax_ms }); this.fila = []; this.buf = Buffer.alloc(0); }
  conectar() {
    return new Promise((ok, erro) => {
      const s = net.createConnection({ host: this.host, port: this.porta });
      const t = setTimeout(() => { s.destroy(); erro(new Error("sem resposta de " + this.host + ":" + this.porta)); }, this.tempoMax_ms);
      s.on("connect", () => { clearTimeout(t); s.setNoDelay(true); this.s = s; ok(); });
      s.on("error", (e) => { clearTimeout(t); for (const p of this.fila) p.erro(e); this.fila = []; erro(e); });
      s.on("close", () => { this.s = null; for (const p of this.fila) p.erro(new Error("conexão fechada")); this.fila = []; });
      s.on("data", (d) => this.receber(d));
    });
  }
  fechar() { this.s?.end(); this.s = null; }
  receber(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 11) {
      const len = this.buf.readUInt16LE(7); if (this.buf.length < 9 + len) break;
      const r = this.buf.subarray(0, 9 + len); this.buf = this.buf.subarray(9 + len);
      const p = this.fila.shift(); if (!p) continue; clearTimeout(p.t);
      const fim = r.readUInt16LE(9);
      if (fim !== 0) { p.erro(new Error("o CLP recusou a leitura (código de fim 0x" + fim.toString(16).toUpperCase() + ")")); continue; }
      const dados = r.subarray(11), v = [];
      if (p.bits) for (let i = 0; i < p.qtd; i++) v.push((dados[i >> 1] >> (i & 1 ? 0 : 4)) & 1);
      else for (let i = 0; i < p.qtd; i++) v.push(dados.readUInt16LE(2 * i));
      p.ok(v);
    }
  }
  // lê `qtd` palavras ou bits a partir de um endereço (comando 0401). Nunca escreve.
  ler(end, qtd) {
    if (!this.s) return Promise.reject(new Error("não conectado"));
    const bits = end.tipo === "bit", q = Buffer.alloc(21);
    q.writeUInt16LE(0x0050, 0); q[2] = 0x00; q[3] = 0xff; q.writeUInt16LE(0x03ff, 4); q[6] = 0x00;    // subcabeçalho, rede 0, estação FF, módulo 03FF, estação 0
    q.writeUInt16LE(12, 7); q.writeUInt16LE(0x0010, 9);                                                 // tamanho, temporizador (4 s)
    q.writeUInt16LE(0x0401, 11); q.writeUInt16LE(bits ? 0x0001 : 0x0000, 13);                           // 0401 = LEITURA em bloco
    q.writeUIntLE(end.n, 15, 3); q[18] = end.codigo; q.writeUInt16LE(qtd, 19);
    return new Promise((ok, erro) => {
      const t = setTimeout(() => { this.fila = this.fila.filter((x) => x.t !== t); erro(new Error("o CLP não respondeu a tempo")); }, this.tempoMax_ms);
      this.fila.push({ ok, erro, qtd, bits, t }); this.s.write(q);
    });
  }
}

// Servidor de teste (CLP de mentira): `mem` = { D:[], W:[], R:[], M:[], X:[], Y:[], B:[], L:[] }
export function servidorSLMP(mem, porta, host = "127.0.0.1") {
  const porCodigo = Object.fromEntries(Object.entries(DISPOSITIVOS).map(([k, v]) => [v[0], k]));
  const srv = net.createServer((s) => {
    let buf = Buffer.alloc(0);
    s.on("error", () => {});
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 11) {
        const len = buf.readUInt16LE(7); if (buf.length < 9 + len) break;
        const q = buf.subarray(0, 9 + len); buf = buf.subarray(9 + len);
        const cmd = q.readUInt16LE(11), sub = q.readUInt16LE(13), n = q.readUIntLE(15, 3), dev = porCodigo[q[18]], qtd = q.readUInt16LE(19);
        let dados, fim = 0;
        if (cmd !== 0x0401 || !dev) { fim = 0xc059; dados = Buffer.alloc(0); }                          // comando não suportado: só leitura
        else if (sub === 0x0001) { dados = Buffer.alloc(Math.ceil(qtd / 2)); for (let i = 0; i < qtd; i++) if (mem[dev][n + i]) dados[i >> 1] |= i & 1 ? 0x01 : 0x10; }
        else { dados = Buffer.alloc(2 * qtd); for (let i = 0; i < qtd; i++) dados.writeUInt16LE((mem[dev][n + i] || 0) & 0xffff, 2 * i); }
        const r = Buffer.alloc(11 + dados.length);
        r.writeUInt16LE(0x00d0, 0); r[2] = q[2]; r[3] = q[3]; r.writeUInt16LE(q.readUInt16LE(4), 4); r[6] = q[6];
        r.writeUInt16LE(2 + dados.length, 7); r.writeUInt16LE(fim, 9); dados.copy(r, 11); s.write(r);
      }
    });
  });
  return new Promise((ok, erro) => { srv.on("error", erro); srv.listen(porta, host, () => ok(srv)); });
}
