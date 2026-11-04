// Simulador de Linha — Modbus TCP (etapa S5, 04/11/2026). Sem bibliotecas.
// CLIENTE: SÓ LEITURA. Só existem as funções 1 (coils), 2 (entradas discretas), 3 (holding registers) e 4 (input registers).
//          Não há nenhuma função de escrita neste arquivo — o programa não consegue escrever no CLP (NR-12).
// SERVIDOR: usado só pelo CLP de mentira (teste no próprio PC). Também só responde leituras.
import net from "node:net";

export const AREAS = { C: 1, DI: 2, HR: 3, IR: 4 };          // prefixo do endereço → função de leitura
// "HR100" → { area:"HR", fc:3, n:100 }
export function endereco(txt) {
  const m = /^(HR|IR|DI|C)(\d{1,5})$/i.exec(String(txt || "").trim());
  if (!m) return null;
  const area = m[1].toUpperCase(), n = +m[2];
  return n <= 65535 ? { area, fc: AREAS[area], n } : null;
}

export class ClienteModbus {
  constructor({ host, porta = 502, unidade = 1, tempoMax_ms = 1500 }) { Object.assign(this, { host, porta, unidade, tempoMax_ms }); this.tid = 0; this.pend = new Map(); this.buf = Buffer.alloc(0); }
  conectar() {
    return new Promise((ok, erro) => {
      const s = net.createConnection({ host: this.host, port: this.porta });
      const t = setTimeout(() => { s.destroy(); erro(new Error("sem resposta de " + this.host + ":" + this.porta)); }, this.tempoMax_ms);
      s.on("connect", () => { clearTimeout(t); s.setNoDelay(true); this.s = s; ok(); });
      s.on("error", (e) => { clearTimeout(t); for (const p of this.pend.values()) p.erro(e); this.pend.clear(); erro(e); });
      s.on("close", () => { this.s = null; for (const p of this.pend.values()) p.erro(new Error("conexão fechada")); this.pend.clear(); });
      s.on("data", (d) => this.receber(d));
    });
  }
  fechar() { this.s?.end(); this.s = null; }
  receber(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 7) {
      const len = this.buf.readUInt16BE(4); if (this.buf.length < 6 + len) break;
      const quadro = this.buf.subarray(0, 6 + len); this.buf = this.buf.subarray(6 + len);
      const tid = quadro.readUInt16BE(0), p = this.pend.get(tid); if (!p) continue; this.pend.delete(tid); clearTimeout(p.t);
      const fc = quadro[7];
      if (fc & 0x80) { p.erro(new Error("o CLP recusou a leitura (código de exceção " + quadro[8] + ")")); continue; }
      const dados = quadro.subarray(9, 9 + quadro[8]);
      if (fc === 3 || fc === 4) { const v = []; for (let i = 0; i < p.qtd; i++) v.push(dados.readUInt16BE(2 * i)); p.ok(v); }
      else { const v = []; for (let i = 0; i < p.qtd; i++) v.push((dados[i >> 3] >> (i & 7)) & 1); p.ok(v); }
    }
  }
  // lê `qtd` valores a partir do endereço (fc 1..4). Nunca escreve.
  ler(fc, inicio, qtd) {
    if (![1, 2, 3, 4].includes(fc)) return Promise.reject(new Error("só leitura: função " + fc + " não existe aqui"));
    if (!this.s) return Promise.reject(new Error("não conectado"));
    const tid = (this.tid = (this.tid + 1) & 0xffff), q = Buffer.alloc(12);
    q.writeUInt16BE(tid, 0); q.writeUInt16BE(0, 2); q.writeUInt16BE(6, 4); q[6] = this.unidade; q[7] = fc; q.writeUInt16BE(inicio, 8); q.writeUInt16BE(qtd, 10);
    return new Promise((ok, erro) => {
      const t = setTimeout(() => { this.pend.delete(tid); erro(new Error("o CLP não respondeu a tempo")); }, this.tempoMax_ms);
      this.pend.set(tid, { ok, erro, qtd, t }); this.s.write(q);
    });
  }
}

// Servidor de teste (CLP de mentira). `tabelas` = { C:[], DI:[], HR:[], IR:[] } com os valores atuais.
export function servidorModbus(tabelas, porta, host = "127.0.0.1") {
  const srv = net.createServer((s) => {
    let buf = Buffer.alloc(0);
    s.on("error", () => {});
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 12) {
        const len = buf.readUInt16BE(4); if (buf.length < 6 + len) break;
        const q = buf.subarray(0, 6 + len); buf = buf.subarray(6 + len);
        const fc = q[7], ini = q.readUInt16BE(8), qtd = q.readUInt16BE(10), area = { 1: "C", 2: "DI", 3: "HR", 4: "IR" }[fc];
        let pdu;
        if (!area || qtd < 1 || qtd > 2000) pdu = Buffer.from([fc | 0x80, 1]);                       // função não suportada: só leitura
        else if (fc >= 3) { pdu = Buffer.alloc(2 + 2 * qtd); pdu[0] = fc; pdu[1] = 2 * qtd; for (let i = 0; i < qtd; i++) pdu.writeUInt16BE((tabelas[area][ini + i] || 0) & 0xffff, 2 + 2 * i); }
        else { const nb = Math.ceil(qtd / 8); pdu = Buffer.alloc(2 + nb); pdu[0] = fc; pdu[1] = nb; for (let i = 0; i < qtd; i++) if (tabelas[area][ini + i]) pdu[2 + (i >> 3)] |= 1 << (i & 7); }
        const r = Buffer.alloc(7 + pdu.length); q.copy(r, 0, 0, 4); r.writeUInt16BE(1 + pdu.length, 4); r[6] = q[6]; pdu.copy(r, 7); s.write(r);
      }
    });
  });
  return new Promise((ok, erro) => { srv.on("error", erro); srv.listen(porta, host, () => ok(srv)); });
}
