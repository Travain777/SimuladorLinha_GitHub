# -*- coding: utf-8 -*-
"""Simulador de Linha — CONFERÊNCIA INDEPENDENTE da linha transfer (etapa S3, 04/11/2026).
Segundo modelo da mesma linha, escrito do zero em Python com SimPy (gratuito), SEM copiar o JavaScript.
Mesmas regras do docs/MOTOR.md (sincronismo S2 + acontecimentos S3); sorteio diferente → compara-se a MÉDIA de várias sementes.
Processos: transfer (ciclo a ciclo), operadora (mesa), empilhadeira (recurso), esteira (atraso de cada peça).
Uso: python modelo_simpy_transfer.py <linha_T.json> [sementes]"""
import sys, json, math, random
import simpy


def mov(d, v, a):                     # servo: acelera, anda, freia (ou triangular se o curso for curto)
    return d / v + v / a if d >= v * v / a else 2 * math.sqrt(d / a)


def simular(arq, semente):
    L, X, D, S = arq["linha"], arq["transfer"], arq["destacker"], arq["saida"]
    k = L.get("pecas_por_golpe") or 1
    disp = sum(t["duracao_min"] - t["pausa_min"] for t in arq["turnos"])
    fim = (L.get("dias_simulados") or 1) * disp * 60
    rnd = random.Random(semente); env = simpy.Environment()
    tri = lambda t: rnd.triangular(t["min"], t["max"], t["mais_comum"])
    expo = lambda m: rnd.expovariate(1.0 / m)

    conf = X.get("confirmacao_s") or 0
    ty = mov(X["eixo_y"]["curso_mm"], X["eixo_y"]["vel_mm_s"], X["eixo_y"]["acel_mm_s2"])
    tx = mov(X["eixo_x"]["curso_mm"], X["eixo_x"]["vel_mm_s"], X["eixo_x"]["acel_mm_s2"])
    tg = max(p["embreagem_s"] + 60.0 / p["spm_volante"] + p["freio_s"] for p in arq["prensas"])
    def ciclo(dest): return ty + conf + tx + conf + ty + conf + max(tx, tg, dest) + conf
    ideal = ciclo(D["pega_s"]["min"])

    # posições: interpress / prensa alternados
    ips, prs, lay = arq["interpress"]["quantidade"], list(arq["prensas"]), []
    while ips > 0 or prs:
        if ips > 0: lay.append(None); ips -= 1             # None = interpress
        if prs: lay.append(prs.pop(0))
    linha = [None] * len(lay)

    comp = [X, D] + arq["prensas"]
    vida = [expo(c["falhas"]["mtbf_min"] * 60) if c.get("falhas") else math.inf for c in comp]
    tempo = {"bom": 0.0, "refugo": 0.0, "lento": 0.0, "enchimento": 0.0, "faltou_blank": 0.0, "quebrada": 0.0, "botoeira": 0.0, "troca": 0.0}
    cont = {"saidas": 0, "ruins": 0, "paradas_botoeira": 0, "achados": 0, "passaram": 0, "trocas": 0}

    # abastecimento
    ab = arq.get("abastecimento") or {"empilhadeiras": 0}
    tem_ab = (ab.get("empilhadeiras") or 0) > 0 and ab.get("entrada")
    mags = [ab["entrada"]["pecas_por_pilha"]] * ab["entrada"]["magazines"] if tem_ab else None
    pedido = [False] * (len(mags) if tem_ab else 0)
    emp = simpy.Resource(env, capacity=ab["empilhadeiras"]) if tem_ab else None
    chegou = {"ev": env.event()}
    def empilhadeira(m):
        with emp.request() as r:
            yield r
            yield env.timeout((ab["entrada"]["chegada_empilhadeira_min"] + ab["entrada"]["troca_min"]) * 60)
        mags[m] = ab["entrada"]["pecas_por_pilha"]; pedido[m] = False
        e = chegou["ev"]; chegou["ev"] = env.event(); e.succeed()

    # esteira, mesa e operadora
    mesa = simpy.Store(env); botoeira = []
    op = S["operadora"]
    def esteira(peca, atraso):
        yield env.timeout(atraso); yield mesa.put(peca)
    def operadora():
        while True:
            ruim = yield mesa.get()
            yield env.timeout(tri(op["tempo_peca_s"]))
            if ruim:
                if rnd.random() * 100 < op["acha_defeito_pct"]: cont["achados"] += 1; botoeira.append(env.now)
                else: cont["passaram"] += 1
    env.process(operadora())

    lote_max = math.ceil(L["lote_pecas"] / k) if L.get("lote_pecas") else math.inf
    def transfer():
        soltas, esvaziando, atual = 0, False, 0
        while True:
            if botoeira and botoeira[0] <= env.now:                     # operadora apertou: para
                botoeira.pop(0); cont["paradas_botoeira"] += 1
                d = tri(op["parada_botoeira_min"]) * 60; t0 = env.now; yield env.timeout(d); tempo["botoeira"] += env.now - t0; continue
            if esvaziando and all(x is None for x in linha):             # linha vazia: troca de ferramenta
                t0 = env.now; yield env.timeout((L.get("setup_min") or 0) * 60); tempo["troca"] += env.now - t0
                esvaziando, soltas = False, 0; cont["trocas"] += 1; continue
            alimenta, extra = not esvaziando, 0.0
            if alimenta and tem_ab and mags[atual] <= 0:
                cheios = [i for i, n in enumerate(mags) if n > 0]
                if not cheios:                                           # faltou blank: espera a empilhadeira
                    t0 = env.now; yield chegou["ev"]; tempo["faltou_blank"] += env.now - t0; continue
                atual = cheios[0]; extra = D.get("troca_magazine_s") or 0
            dest = tri(D["pega_s"]) + extra if alimenta else 0.0
            dur = ciclo(dest); t0 = env.now
            yield env.timeout(dur)                                       # o ciclo inteiro
            sai = linha[-1]; linha[1:] = linha[:-1]; linha[0] = None
            for i, p in enumerate(lay):
                if p is not None and linha[i] is not None and not linha[i] and p["refugo_pct"] > 0 and rnd.random() * 100 < p["refugo_pct"]: linha[i] = True
            if alimenta:
                linha[0] = False                                         # False = peça boa, True = peça ruim
                if tem_ab:
                    mags[atual] -= 1
                    if mags[atual] == 0 and not pedido[atual]: pedido[atual] = True; env.process(empilhadeira(atual))
                soltas += 1
                if soltas >= lote_max: esvaziando = True
            if sai is not None:
                cont["saidas"] += 1; cont["ruins"] += 1 if sai else 0
                tempo["refugo" if sai else "bom"] += ideal; tempo["lento"] += dur - ideal
                env.process(esteira(sai, max(0.0, (S.get("esteira_s") or 0) - (dur - (ty + conf + tx)))))
            else: tempo["enchimento"] += dur
            # falhas pelo tempo trabalhado: a que vence primeiro para a linha toda
            for i in range(len(vida)): vida[i] -= dur
            while True:
                i = min(range(len(vida)), key=lambda j: vida[j])
                if vida[i] > 0: break
                t1 = env.now; yield env.timeout(expo(comp[i]["falhas"]["mttr_min"] * 60)); tempo["quebrada"] += env.now - t1
                vida[i] = expo(comp[i]["falhas"]["mtbf_min"] * 60)
    env.process(transfer())
    env.run(until=fim)

    rod = fim - tempo["faltou_blank"] - tempo["quebrada"] - tempo["botoeira"] - tempo["troca"]
    boas = cont["saidas"] - cont["ruins"]
    return {"golpes_saida": cont["saidas"], "boas": boas, "paradas_botoeira": cont["paradas_botoeira"], "trocas": cont["trocas"],
            "quebrada_min": tempo["quebrada"] / 60, "botoeira_min": tempo["botoeira"] / 60, "faltou_blank_min": tempo["faltou_blank"] / 60,
            "disponibilidade": rod / fim, "oee": boas * ideal / fim}


if __name__ == "__main__":
    arq = json.load(open(sys.argv[1], encoding="utf-8"))
    for s in range(1, (int(sys.argv[2]) if len(sys.argv) > 2 else 3) + 1):
        print(s, simular(arq, s))
