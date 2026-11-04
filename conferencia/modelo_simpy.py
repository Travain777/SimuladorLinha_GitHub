# -*- coding: utf-8 -*-
"""Simulador de Linha — CONFERÊNCIA INDEPENDENTE (etapa E3, 03/11/2026).
Segundo modelo da mesma linha, escrito do zero em Python com a biblioteca SimPy (gratuita), SEM copiar o motor em JavaScript.
As regras são as mesmas do docs/MOTOR.md; o sorteio é outro (gerador do Python). Por isso a comparação é por MÉDIAS de várias sementes.
Uso: python modelo_simpy.py <arquivo_da_linha.json> [sementes]"""
import sys, json, math, random
import simpy

ESTADOS = ["produzindo", "faltou_peca", "bloqueada", "quebrada", "troca_ferramenta"]
EPS = 1e-9


def simular(arq, semente):
    L, est, ab = arq["linha"], arq["estacoes"], arq.get("abastecimento") or {"empilhadeiras": 0}
    k = L.get("pecas_por_golpe") or 1
    fim = (L.get("dias_simulados") or 1) * arq["calculado"]["tempo_disponivel_dia_min"] * 60
    rnd = random.Random(semente)
    env = simpy.Environment()

    def tri(c): return rnd.triangular(c["min"], c["max"], c["mais_comum"])     # Python: triangular(baixo, alto, moda)
    def expo(media): return rnd.expovariate(1.0 / media)

    # ---- linha (lote e troca)
    lote_un = math.ceil(L["lote_pecas"] / k) if L.get("lote_pecas") else math.inf
    linha = {"soltas": 0, "esvaziando": False, "em_setup": False, "wip": 0, "reinicio": env.event(), "trocas": 0, "total_soltos": 0, "saidas": 0}

    # ---- contabilidade de estados
    class Maq:
        def __init__(s, est_i, j):
            s.i, s.j, s.estado, s.desde, s.livre = est_i, j, "faltou_peca", 0.0, True
            s.tempo = {e: 0.0 for e in ESTADOS}
    maquinas = []
    def rotulo_livre(): return "troca_ferramenta" if (linha["esvaziando"] or linha["em_setup"]) else "faltou_peca"
    def muda(m, novo, livre=False):
        m.tempo[m.estado] += env.now - m.desde; m.estado, m.desde, m.livre = novo, env.now, livre
    def reetiquetar():
        for m in maquinas:
            if m.livre: muda(m, rotulo_livre(), True)

    # ---- estoques entre estações: Store; com estoque 0 a de trás espera a confirmação de que a da frente pegou
    caixas = [None] + [simpy.Store(env, capacity=max(1, est[i - 1]["estoque_depois"])) for i in range(1, len(est))]
    feitas = [0] * len(est); refugo = [0] * len(est)

    # ---- abastecimento
    com_ab = (ab.get("empilhadeiras") or 0) > 0
    emp = simpy.Resource(env, capacity=ab["empilhadeiras"]) if com_ab else None
    uso_emp = {"area": 0.0, "pedidos": 0, "espera": 0.0}
    mags = [ab["entrada"]["pecas_por_pilha"]] * ab["entrada"]["magazines"] if com_ab else None
    mag_evento = [env.event()]
    rack_un = max(1, ab["saida"]["pecas_por_rack"] // k) if com_ab else math.inf
    racks = [{"n": 0, "pedido": False} for _ in range(ab["saida"]["posicoes"])] if com_ab else None
    rack_evento = [env.event()]
    atual = {"mag": 0, "rack": 0}

    def empilhadeira(tipo, alvo):
        uso_emp["pedidos"] += 1; t0 = env.now
        with emp.request() as req:
            yield req
            uso_emp["espera"] += env.now - t0
            c = ab["entrada"] if tipo == "pilha" else ab["saida"]
            dur = (c["chegada_empilhadeira_min"] + c["troca_min"]) * 60
            uso_emp["area"] += dur
            yield env.timeout(dur)
        if tipo == "pilha":
            mags[alvo] = ab["entrada"]["pecas_por_pilha"]; ev = mag_evento[0]; mag_evento[0] = env.event(); ev.succeed()
        else:
            racks[alvo]["n"] = 0; racks[alvo]["pedido"] = False; ev = rack_evento[0]; rack_evento[0] = env.event(); ev.succeed()

    def checar_vazia():
        if linha["esvaziando"] and not linha["em_setup"] and linha["wip"] == 0:
            linha["em_setup"] = True; reetiquetar(); env.process(troca())

    def troca():
        yield env.timeout((L.get("setup_min") or 0) * 60)
        linha["trocas"] += 1; linha["em_setup"] = False; linha["esvaziando"] = False; linha["soltas"] = 0
        reetiquetar()
        ev = linha["reinicio"]; linha["reinicio"] = env.event(); ev.succeed()

    def pegar_blank():
        while True:
            if linha["esvaziando"] or linha["em_setup"] or linha["soltas"] >= lote_un:
                yield linha["reinicio"]; continue
            if com_ab:
                if mags[atual["mag"]] <= 0:
                    outros = [i for i, x in enumerate(mags) if x > 0]
                    if not outros: yield mag_evento[0]; continue
                    atual["mag"] = outros[0]
                mags[atual["mag"]] -= 1
                if mags[atual["mag"]] == 0: env.process(empilhadeira("pilha", atual["mag"]))
            linha["soltas"] += 1; linha["total_soltos"] += 1; linha["wip"] += 1
            if linha["soltas"] >= lote_un: linha["esvaziando"] = True; reetiquetar()
            return

    def guardar_no_rack(m):
        while True:
            r = racks[atual["rack"]]
            if r["n"] >= rack_un:
                outros = [i for i, x in enumerate(racks) if x["n"] < rack_un and not x["pedido"]]
                if not outros: yield rack_evento[0]; continue
                atual["rack"] = outros[0]; r = racks[atual["rack"]]
            r["n"] += 1
            if r["n"] >= rack_un: r["pedido"] = True; env.process(empilhadeira("rack", atual["rack"]))
            return

    def maquina(i, j):
        cfg = est[i]; m = Maq(i, j); maquinas.append(m)
        ttf = expo(cfg["falhas"]["mtbf_min"] * 60) if cfg["falhas"] else math.inf
        ultima = i == len(est) - 1
        while True:
            muda(m, rotulo_livre(), True)
            if i == 0: yield from pegar_blank()
            else:
                item = yield caixas[i].get()
                if item[1] is not None: item[1].succeed()
            muda(m, "produzindo")
            d = tri(cfg["ciclo_s"])
            while d > EPS:
                seg = min(d, ttf); yield env.timeout(seg); d -= seg; ttf -= seg
                if ttf <= EPS and cfg["falhas"]:
                    muda(m, "quebrada"); yield env.timeout(expo(cfg["falhas"]["mttr_min"] * 60))
                    ttf = expo(cfg["falhas"]["mtbf_min"] * 60); muda(m, "produzindo")
            if cfg["refugo_pct"] > 0 and rnd.random() * 100 < cfg["refugo_pct"]:
                refugo[i] += 1; linha["wip"] -= 1; checar_vazia(); continue
            muda(m, "bloqueada")
            if ultima:
                if com_ab: yield from guardar_no_rack(m)
                feitas[i] += 1; linha["saidas"] += 1; linha["wip"] -= 1; checar_vazia()
            else:
                cap0 = est[i]["estoque_depois"] == 0
                ack = env.event() if cap0 else None
                yield caixas[i + 1].put((1, ack))
                if cap0: yield ack
                feitas[i] += 1

    for i, e in enumerate(est):
        for j in range(e.get("paralelas") or 1): env.process(maquina(i, j))
    env.run(until=fim)
    for m in maquinas: muda(m, m.estado, m.livre)

    res = {"golpes_saida": linha["saidas"], "refugo": sum(refugo), "trocas": linha["trocas"], "estacoes": []}
    for i, e in enumerate(est):
        ms = [m for m in maquinas if m.i == i]; plan = fim * len(ms)
        tot = {s: sum(m.tempo[s] for m in ms) for s in ESTADOS}
        feitos = feitas[i] + refugo[i]; oper = plan - tot["quebrada"] - tot["troca_ferramenta"]
        A = oper / plan; P = feitos * e["ciclo_s"]["min"] / oper if oper > 0 else 0; Q = feitas[i] / feitos if feitos else 1
        res["estacoes"].append({"id": e["id"], "pct": {s: 100 * tot[s] / plan for s in ESTADOS}, "oee": A * P * Q})
    if com_ab: res["empilhadeira_uso_pct"] = 100 * uso_emp["area"] / (fim * ab["empilhadeiras"])
    return res


if __name__ == "__main__":
    arq = json.load(open(sys.argv[1], encoding="utf-8"))
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    for s in range(1, n + 1):
        r = simular(arq, s)
        print(s, r["golpes_saida"], r["refugo"], r["trocas"], round(r.get("empilhadeira_uso_pct", 0), 1))
