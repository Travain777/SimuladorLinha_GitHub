# -*- coding: utf-8 -*-
"""Simulador de Linha — compara o motor (JavaScript) com o modelo independente (SimPy), etapa E3.
Roda as duas implementações com N sementes cada e compara as MÉDIAS (os sorteios são diferentes, então se compara média com média).
Critério: a diferença das médias fica dentro do limite (vazão 1%; estados e OEE 1 ponto percentual) OU dentro do ruído do sorteio
(2,5 erros-padrão da diferença) — quebras sorteadas mexem muito na produção de uma rodada para outra.
Uso: python comparar.py <arquivo_da_linha.json> [N] [relatorio.txt]"""
import sys, json, subprocess, statistics as st, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modelo_simpy import simular, ESTADOS

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI)
arqn = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 20
arq = json.load(open(arqn, encoding="utf-8"))
js = json.loads(subprocess.run(["node", os.path.join(RAIZ, "motor", "rodar_sementes.mjs"), arqn, "1", str(N)], capture_output=True, text=True, check=True).stdout)
py = [simular(arq, 1000 + s) for s in range(1, N + 1)]

linhas, falhas = [], 0
def med(v): return st.mean(v), (st.stdev(v) / len(v) ** 0.5 if len(v) > 1 else 0)
def compara(nome, a, b, rel=False, lim=1.0):
    global falhas
    (ma, ea), (mb, eb) = med(a), med(b)
    dif = (ma - mb) / mb * 100 if rel else ma - mb
    ruido = 2.5 * (ea ** 2 + eb ** 2) ** 0.5 * (100 / mb if rel else 1)
    ok = abs(dif) <= max(lim, ruido)
    if not ok: falhas += 1
    unid = "%" if rel else " p.p."
    linhas.append("%s %-46s motor %10.2f  SimPy %10.2f  diferença %+6.2f%s (limite %.1f%s · ruído ±%.2f%s)" % ("OK    " if ok else "FALHOU", nome, ma, mb, dif, unid, lim, unid, ruido, unid))

compara("Golpes bons na saída", [r["golpes_saida"] for r in js], [r["golpes_saida"] for r in py], rel=True, lim=1.0)
compara("Golpes de refugo", [r["refugo"] for r in js], [r["refugo"] for r in py], rel=True, lim=5.0)
compara("Trocas de ferramenta", [r["trocas"] for r in js], [r["trocas"] for r in py], rel=True, lim=2.0)
if js[0]["empilhadeira_uso_pct"] is not None:
    compara("Empilhadeira ocupada (%)", [r["empilhadeira_uso_pct"] for r in js], [r["empilhadeira_uso_pct"] for r in py])
for i, e in enumerate(arq["estacoes"]):
    for s in ESTADOS:
        compara("%s · %s (%%)" % (e["id"], s), [r["estacoes"][i]["pct"][s] for r in js], [r["estacoes"][i]["pct"][s] for r in py])
    compara("%s · OEE (%%)" % e["id"], [100 * r["estacoes"][i]["oee"] for r in js], [100 * r["estacoes"][i]["oee"] for r in py])

cab = "CONFERÊNCIA MOTOR × SimPy — %s — %d sementes em cada" % (arq["linha"]["nome"], N)
txt = "\n".join([cab, "=" * len(cab)] + linhas + ["", "%d de %d comparações dentro do limite." % (len(linhas) - falhas, len(linhas))])
print(txt)
if len(sys.argv) > 3: open(sys.argv[3], "w", encoding="utf-8").write(txt + "\n")
sys.exit(0 if falhas == 0 else 1)
