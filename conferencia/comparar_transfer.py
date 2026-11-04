# -*- coding: utf-8 -*-
"""Simulador de Linha — compara a simulação da LINHA TRANSFER (JavaScript) com o modelo independente em SimPy (etapa S3).
Mesmo critério da E3: diferença das médias dentro do limite OU dentro do ruído do sorteio (2,5 erros-padrão da diferença).
Uso: python comparar_transfer.py <linha_T.json> [N] [relatorio.txt]"""
import sys, json, subprocess, statistics as st, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modelo_simpy_transfer import simular

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI)
arqn = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 20
arq = json.load(open(arqn, encoding="utf-8"))
js = json.loads(subprocess.run(["node", os.path.join(RAIZ, "motor", "rodar_sementes_transfer.mjs"), arqn, "1", str(N)], capture_output=True, text=True, check=True).stdout)
py = [simular(arq, 1000 + s) for s in range(1, N + 1)]

linhas, falhas = [], 0
def med(v): return st.mean(v), (st.stdev(v) / len(v) ** 0.5 if len(v) > 1 else 0)
def compara(nome, chave, rel=False, lim=1.0, fator=1.0):
    global falhas
    a = [r[chave] * fator for r in js]; b = [r[chave] * fator for r in py]
    (ma, ea), (mb, eb) = med(a), med(b)
    dif = (ma - mb) / mb * 100 if rel and mb else ma - mb
    ruido = 2.5 * (ea ** 2 + eb ** 2) ** 0.5 * (100 / mb if rel and mb else 1)
    ok = abs(dif) <= max(lim, ruido)
    if not ok: falhas += 1
    u = "%" if rel else ""
    linhas.append("%s %-40s motor %10.2f  SimPy %10.2f  diferença %+7.2f%s (limite %.1f%s · ruído ±%.2f%s)" % ("OK    " if ok else "FALHOU", nome, ma, mb, dif, u, lim, u, ruido, u))

compara("Peças que saíram das prensas", "golpes_saida", rel=True, lim=1.0)
compara("Peças boas", "boas", rel=True, lim=1.0)
compara("Paradas pela botoeira", "paradas_botoeira", rel=True, lim=5.0)
compara("Trocas de ferramenta", "trocas", rel=True, lim=2.0)
compara("Minutos parada por quebra", "quebrada_min", rel=True, lim=5.0)
compara("Minutos parada pela botoeira", "botoeira_min", rel=True, lim=5.0)
compara("Minutos faltando blank", "faltou_blank_min", lim=5.0)
compara("Disponibilidade (pontos %)", "disponibilidade", lim=1.0, fator=100)
compara("OEE da linha (pontos %)", "oee", lim=1.0, fator=100)

cab = "CONFERÊNCIA LINHA TRANSFER × SimPy — %s — %d sementes em cada" % (arq["linha"]["nome"], N)
txt = "\n".join([cab, "=" * len(cab)] + linhas + ["", "%d de %d comparações dentro do limite." % (len(linhas) - falhas, len(linhas))])
print(txt)
if len(sys.argv) > 3: open(sys.argv[3], "w", encoding="utf-8").write(txt + "\n")
sys.exit(0 if falhas == 0 else 1)
