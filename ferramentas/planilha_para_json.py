# -*- coding: utf-8 -*-
"""Simulador de Linha — etapas E1 e S1 (03 e 04/11/2026): lê a planilha da linha, confere os dados e grava o arquivo da linha (JSON).
Planilha com a aba Prensas = linha transfer (formato simulador-linha/2); sem ela = linha de estações (simulador-linha/1).
Uso: python planilha_para_json.py <planilha.xlsx> <saida.json>
Se houver erro de preenchimento, mostra a lista (aba, linha, o que corrigir) e NÃO grava o arquivo."""
import sys, json, re, datetime
from openpyxl import load_workbook

FORMATO = "simulador-linha/1"
FORMATO_TRANSFER = "simulador-linha/2"
TIPOS = {"alimentação": "alimentacao", "alimentacao": "alimentacao", "processo": "processo", "saída": "saida", "saida": "saida"}


def num(v):
    if v is None or (isinstance(v, str) and not v.strip()): return None
    if isinstance(v, (int, float)): return float(v)
    try: return float(str(v).strip().replace(",", "."))
    except ValueError: return "erro"


def minutos_do_dia(v):
    if v is None or v == "": return None
    if isinstance(v, datetime.time): return v.hour * 60 + v.minute
    if isinstance(v, datetime.datetime): return v.hour * 60 + v.minute
    if isinstance(v, (int, float)): return round(float(v) % 1 * 24 * 60)          # fração do dia do Excel
    m = re.match(r"^\s*(\d{1,2})[:h](\d{2})\s*$", str(v))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else "erro"


def hhmm(m): return "%02d:%02d" % (m // 60, m % 60)


def ler_linha_turnos(wb, erro):

    # ---- Linha
    ws = wb["Linha"]
    p = {str(ws.cell(row=r, column=1).value or "").strip(): ws.cell(row=r, column=2).value for r in range(2, 20)}
    def campo(nome, minimo=None, inteiro=False, obrig=True):
        v = num(p.get(nome))
        r = next((r for r in range(2, 20) if str(ws.cell(row=r, column=1).value or "").strip() == nome), "?")
        if v is None:
            if obrig: erro("Linha", r, "preencha \"%s\"." % nome)
            return None
        if v == "erro": erro("Linha", r, "\"%s\" precisa ser um número." % nome); return None
        if minimo is not None and v < minimo: erro("Linha", r, "\"%s\" precisa ser pelo menos %s." % (nome, minimo)); return None
        return int(round(v)) if inteiro else v
    linha = {
        "nome": str(p.get("Nome da linha") or "").strip() or "Linha sem nome",
        "produto": str(p.get("Peça / produto") or "").strip(),
        "pecas_por_golpe": campo("Peças por golpe", 1, True),
        "demanda_pecas_dia": campo("Demanda por dia", 1, True),
        "lote_pecas": campo("Tamanho do lote", 1, True),
        "setup_min": campo("Troca de ferramenta (setup)", 0),
        "dias_simulados": campo("Dias a simular", 1, True),
        "semente": campo("Semente", 0, True),
    }

    # ---- Turnos
    ws = wb["Turnos"]; turnos = []
    for r in range(2, ws.max_row + 1):
        nome, ini, fim, pausa = (ws.cell(row=r, column=c).value for c in range(1, 5))
        if not any(x not in (None, "") for x in (nome, ini, fim, pausa)): continue
        a, b, pz = minutos_do_dia(ini), minutos_do_dia(fim), num(pausa) or 0
        if a in (None, "erro") or b in (None, "erro"): erro("Turnos", r, "início e fim no formato 06:00."); continue
        if pz == "erro" or pz < 0: erro("Turnos", r, "pausas em minutos (número)."); continue
        dur = (b - a) % (24 * 60)
        if dur == 0: erro("Turnos", r, "início e fim iguais."); continue
        if pz >= dur: erro("Turnos", r, "as pausas são maiores que o turno."); continue
        turnos.append({"nome": str(nome or "Turno %d" % (len(turnos) + 1)), "inicio": hhmm(a), "fim": hhmm(b), "pausa_min": pz, "duracao_min": dur})
    if not turnos: erro("Turnos", 2, "preencha pelo menos um turno.")

    return linha, turnos


def ler(caminho):
    wb = load_workbook(caminho, data_only=True)
    erros = []
    def erro(aba, linha, txt): erros.append("%s, linha %s: %s" % (aba, linha, txt))
    linha, turnos = ler_linha_turnos(wb, erro)
    if "Prensas" in wb.sheetnames:                       # planilha da LINHA TRANSFER (etapa S1)
        return ler_transfer(wb, caminho, linha, turnos, erro), erros

    # ---- Estações
    ws = wb["Estações"]; estacoes = []; codigos = set()
    for r in range(2, ws.max_row + 1):
        v = [ws.cell(row=r, column=c).value for c in range(1, 14)]
        if all(x in (None, "") for x in v[:12]): continue
        ordem, cod, nome, tipo = num(v[0]), str(v[1] or "").strip(), str(v[2] or "").strip(), str(v[3] or "").strip().lower()
        cmin, cmod, cmax, par, buf, mtbf, mttr, ref = (num(x) for x in v[4:12])
        ok = True
        if ordem in (None, "erro"): erro("Estações", r, "preencha a Ordem (1, 2, 3...)."); ok = False
        if not re.match(r"^EST_[A-Za-z0-9_]+$", cod): erro("Estações", r, "Código começa por EST_ e não tem espaço nem acento (ex.: EST_Prensa_1)."); ok = False
        elif cod in codigos: erro("Estações", r, "o código %s está repetido." % cod); ok = False
        if tipo not in TIPOS: erro("Estações", r, "Tipo deve ser alimentação, processo ou saída."); ok = False
        for nomec, x in (("Ciclo mínimo", cmin), ("Ciclo mais comum", cmod), ("Ciclo máximo", cmax)):
            if x in (None, "erro") or x <= 0: erro("Estações", r, "%s precisa ser um número maior que zero (segundos)." % nomec); ok = False
        if ok and not (cmin <= cmod <= cmax): erro("Estações", r, "os ciclos precisam ficar em ordem: mínimo ≤ mais comum ≤ máximo."); ok = False
        par = 1 if par is None else par
        buf = 0 if buf is None else buf
        if par == "erro" or par < 1: erro("Estações", r, "Máquinas em paralelo: 1 ou mais."); ok = False
        if buf == "erro" or buf < 0: erro("Estações", r, "Estoque depois: 0 ou mais peças."); ok = False
        falhas = None
        if mtbf not in (None, 0) or mttr not in (None, 0):
            if mtbf in (None, "erro", 0) or mttr in (None, "erro", 0) or mtbf < 0 or mttr < 0:
                erro("Estações", r, "preencha os dois: tempo médio entre falhas E tempo médio de reparo (ou deixe os dois vazios)."); ok = False
            else: falhas = {"mtbf_min": mtbf, "mttr_min": mttr}
        ref = 0 if ref is None else ref
        if ref == "erro" or not (0 <= ref < 100): erro("Estações", r, "Refugo entre 0 e 100 (%)."); ok = False
        if not ok: continue
        codigos.add(cod)
        estacoes.append({"ordem": int(ordem), "id": cod, "nome": nome or cod, "tipo": TIPOS[tipo],
                         "ciclo_s": {"min": cmin, "mais_comum": cmod, "max": cmax}, "paralelas": int(par),
                         "estoque_depois": int(buf), "falhas": falhas, "refugo_pct": ref, "observacao": str(v[12] or "")})
    estacoes.sort(key=lambda e: e["ordem"])
    if estacoes:
        ords = [e["ordem"] for e in estacoes]
        if ords != list(range(1, len(ords) + 1)): erro("Estações", "-", "a Ordem precisa ser 1, 2, 3... sem pular nem repetir (está %s)." % ords)
        if estacoes[0]["tipo"] != "alimentacao": erro("Estações", "-", "a estação de Ordem 1 precisa ser do tipo alimentação.")
        if estacoes[-1]["tipo"] != "saida": erro("Estações", "-", "a última estação precisa ser do tipo saída.")
        if sum(e["tipo"] == "alimentacao" for e in estacoes) > 1 or sum(e["tipo"] == "saida" for e in estacoes) > 1:
            erro("Estações", "-", "só pode haver uma estação de alimentação e uma de saída.")
    else: erro("Estações", 2, "preencha pelo menos duas estações (alimentação e saída).")

    # ---- Abastecimento: cada valor é achado pelo nome do item dentro da sua seção (ENTRADA, SAÍDA, EMPILHADEIRAS)
    ws = wb["Abastecimento"]; secao = None; itens = {}
    for r in range(2, ws.max_row + 1):
        nome = str(ws.cell(row=r, column=1).value or "").strip()
        if not nome: continue
        cab = nome.upper() if ws.cell(row=r, column=2).value in (None, "") else ""      # título de seção: sem valor ao lado
        if cab.startswith("ENTRADA"): secao = "entrada"; continue
        if cab.startswith("SAÍDA") or cab.startswith("SAIDA"): secao = "saida"; continue
        if cab.startswith("EMPILHADEIRAS"): secao = "empilhadeiras"; continue
        itens[(secao, nome.lower())] = (r, ws.cell(row=r, column=2).value)
    def pega(secao, comeco, minimo, inteiro=False):
        achou = [(k, v) for k, v in itens.items() if k[0] == secao and k[1].startswith(comeco)]
        if not achou: erro("Abastecimento", "-", "falta o item \"%s\" na seção %s." % (comeco, secao)); return None
        r, v = achou[0][1]; x = num(v)
        if x in (None, "erro") or x < minimo: erro("Abastecimento", r, "\"%s\" precisa ser um número a partir de %s." % (achou[0][0][1], minimo)); return None
        return int(round(x)) if inteiro else x
    ent = {"estacao": estacoes[0]["id"] if estacoes else None, "pecas_por_pilha": pega("entrada", "peças por pilha", 1, True),
           "magazines": pega("entrada", "magazines", 1, True), "chegada_empilhadeira_min": pega("entrada", "tempo para a empilhadeira", 0),
           "troca_min": pega("entrada", "tempo para trocar", 0)}
    sai = {"estacao": estacoes[-1]["id"] if estacoes else None, "pecas_por_rack": pega("saida", "peças por rack", 1, True),
           "posicoes": pega("saida", "posições", 1, True), "chegada_empilhadeira_min": pega("saida", "tempo para a empilhadeira", 0),
           "troca_min": pega("saida", "tempo para trocar", 0)}
    abastecimento = {"empilhadeiras": pega("empilhadeiras", "empilhadeiras", 0, True), "entrada": ent, "saida": sai}

    # ---- calculado
    disp = sum(t["duracao_min"] - t["pausa_min"] for t in turnos)
    calc = {"tempo_disponivel_dia_min": disp,
            "takt_s": round(disp * 60 / linha["demanda_pecas_dia"], 3) if linha["demanda_pecas_dia"] and disp else None}
    if estacoes and calc["takt_s"]:
        lentas = [e["id"] for e in estacoes if e["ciclo_s"]["mais_comum"] / e["paralelas"] > calc["takt_s"] * linha["pecas_por_golpe"] and e["tipo"] != "alimentacao"]
        calc["estacoes_mais_lentas_que_o_takt"] = lentas
    return {"formato": FORMATO, "origem": str(caminho).replace("\\", "/").split("/")[-1], "linha": linha, "turnos": turnos,
            "estacoes": estacoes, "abastecimento": abastecimento, "calculado": calc}, erros


def parametros(wb, aba, erro):
    """Lê uma aba Parâmetro | Valor com seções (linha de título sem valor ao lado). Devolve pega(secao_inicio, nome_inicio, ...)."""
    ws = wb[aba]; secao = ""; itens = {}
    for r in range(2, ws.max_row + 1):
        nome = str(ws.cell(row=r, column=1).value or "").strip()
        if not nome: continue
        v = ws.cell(row=r, column=2).value
        cor = str(ws.cell(row=r, column=1).fill.start_color.rgb or "")
        if v in (None, "") and (cor.upper().endswith("F2B705") or nome.split(" —")[0].isupper()): secao = nome.lower(); continue   # título de seção (faixa amarela)
        itens[(secao, nome.lower())] = (r, v, nome)
    def pega(sec, comeco, minimo=None, maior=None, inteiro=False, texto=False, opcional=False, maximo=None):
        achou = [(k, v) for k, v in itens.items() if k[0].startswith(sec) and k[1].startswith(comeco.lower())]
        if not achou: erro(aba, "-", "falta o item \"%s\"." % comeco); return None
        (r, v, nome) = achou[0][1]
        if texto: return str(v or "").strip()
        x = num(v)
        if x is None:
            if not opcional: erro(aba, r, "preencha \"%s\"." % nome)
            return None
        if x == "erro": erro(aba, r, "\"%s\" precisa ser um número." % nome); return None
        if minimo is not None and x < minimo: erro(aba, r, "\"%s\" precisa ser pelo menos %s." % (nome, minimo)); return None
        if maior is not None and not x > maior: erro(aba, r, "\"%s\" precisa ser maior que %s." % (nome, maior)); return None
        if maximo is not None and x > maximo: erro(aba, r, "\"%s\" pode ser no máximo %s." % (nome, maximo)); return None
        return int(round(x)) if inteiro else x
    return pega


def falhas_de(mtbf, mttr, erro, aba, onde):
    if mtbf is None and mttr is None: return None
    if mtbf is None or mttr is None or mtbf <= 0 or mttr <= 0:
        erro(aba, onde, "preencha os dois: tempo médio entre falhas E tempo médio de reparo (ou deixe os dois vazios)."); return None
    return {"mtbf_min": mtbf, "mttr_min": mttr}


def tri_de(a, b, c, erro, aba, nome):
    if None in (a, b, c): return None
    if not (0 < a <= b <= c): erro(aba, "-", "%s: precisa ficar em ordem — mínimo ≤ mais comum ≤ máximo (e maior que zero)." % nome); return None
    return {"min": a, "mais_comum": b, "max": c}


def codigo_ok(cod, usados, erro, aba, r):
    if not re.match(r"^EST_[A-Za-z0-9_]+$", cod or ""): erro(aba, r, "o código começa por EST_ e não tem espaço nem acento (ex.: EST_Prensa_1)."); return False
    if cod in usados: erro(aba, r, "o código %s está repetido." % cod); return False
    usados.add(cod); return True


def ler_transfer(wb, caminho, linha, turnos, erro):
    usados = set()
    # ---- Transfer
    pt = parametros(wb, "Transfer", erro)
    X = {"id": pt("transfer", "código", texto=True), "nome": pt("transfer", "nome", texto=True),
         "eixo_x": {"curso_mm": pt("eixo x", "curso", maior=0), "vel_mm_s": pt("eixo x", "velocidade", maior=0), "acel_mm_s2": pt("eixo x", "aceleração", maior=0)},
         "eixo_y": {"curso_mm": pt("eixo y", "curso", maior=0), "vel_mm_s": pt("eixo y", "velocidade", maior=0), "acel_mm_s2": pt("eixo y", "aceleração", maior=0)},
         "confirmacao_s": pt("ciclo", "confirmação", minimo=0, maximo=2),
         "falhas": falhas_de(pt("falhas", "tempo médio entre", opcional=True), pt("falhas", "tempo médio de reparo", opcional=True), erro, "Transfer", "-")}
    codigo_ok(X["id"], usados, erro, "Transfer", "-")
    # ---- Prensas
    ws = wb["Prensas"]; prensas = []; linhas_com_erro = 0
    for r in range(2, ws.max_row + 1):
        v = [ws.cell(row=r, column=c).value for c in range(1, 12)]
        if all(x in (None, "") for x in v): continue
        ordem, cod, nome = num(v[0]), str(v[1] or "").strip(), str(v[2] or "").strip()
        cap, spm, curso, emb, fre, mtbf, mttr, ref = (num(x) for x in v[3:11])
        ok = codigo_ok(cod, usados, erro, "Prensas", r)
        if ordem in (None, "erro"): erro("Prensas", r, "preencha a Ordem (1, 2, 3...)."); ok = False
        for nomec, x, mx in (("Capacidade", cap, None), ("Golpes por minuto do volante", spm, 200), ("Curso do martelo", curso, None)):
            if x in (None, "erro") or x <= 0 or (mx and x > mx): erro("Prensas", r, "%s precisa ser um número maior que zero%s." % (nomec, " (até %s)" % mx if mx else "")); ok = False
        for nomec, x in (("Embreagem", emb), ("Freio", fre)):
            if x in (None, "erro") or not (0 <= x <= 2): erro("Prensas", r, "%s: tempo em segundos entre 0 e 2." % nomec); ok = False
        if "erro" in (mtbf, mttr): erro("Prensas", r, "MTBF e MTTR precisam ser números."); ok = False; mtbf = mttr = None
        ref = 0 if ref is None else ref
        if ref == "erro" or not (0 <= ref < 100): erro("Prensas", r, "Refugo entre 0 e 100 (%)."); ok = False
        f = falhas_de(mtbf, mttr, erro, "Prensas", r)
        if not ok: linhas_com_erro += 1; continue
        prensas.append({"ordem": int(ordem), "id": cod, "nome": nome or cod, "capacidade_t": cap, "spm_volante": spm, "curso_mm": curso,
                        "embreagem_s": emb, "freio_s": fre, "falhas": f, "refugo_pct": ref})
    prensas.sort(key=lambda p: p["ordem"])
    if not prensas: erro("Prensas", 2, "preencha pelo menos uma prensa.")
    elif not linhas_com_erro and [p["ordem"] for p in prensas] != list(range(1, len(prensas) + 1)): erro("Prensas", "-", "a Ordem precisa ser 1, 2, 3... sem pular nem repetir.")
    # ---- Destacker e Saída
    pd = parametros(wb, "Destacker e Saída", erro)
    nip = pd("interpress", "quantidade", minimo=1, inteiro=True)
    D = {"id": pd("destacker", "código", texto=True), "nome": pd("destacker", "nome", texto=True),
         "pega_s": tri_de(pd("destacker", "pega do blank — mínimo", maior=0), pd("destacker", "pega do blank — mais comum", maior=0), pd("destacker", "pega do blank — máximo", maior=0), erro, "Destacker e Saída", "Pega do blank"),
         "troca_magazine_s": pd("destacker", "troca de magazine", minimo=0),
         "falhas": falhas_de(pd("destacker", "destacker — tempo médio entre", opcional=True), pd("destacker", "destacker — tempo médio de reparo", opcional=True), erro, "Destacker e Saída", "-")}
    codigo_ok(D["id"], usados, erro, "Destacker e Saída", "-")
    S = {"id": pd("saída", "código", texto=True), "nome": pd("saída", "nome", texto=True), "esteira_s": pd("saída", "tempo na esteira", minimo=0),
         "operadora": {"tempo_peca_s": tri_de(pd("saída", "operadora por peça — mínimo", maior=0), pd("saída", "operadora por peça — mais comum", maior=0), pd("saída", "operadora por peça — máximo", maior=0), erro, "Destacker e Saída", "Operadora por peça"),
                       "acha_defeito_pct": pd("saída", "peças com defeito", minimo=0, maximo=100),
                       "parada_botoeira_min": tri_de(pd("saída", "parada pela botoeira — mínimo", maior=0), pd("saída", "parada pela botoeira — mais comum", maior=0), pd("saída", "parada pela botoeira — máximo", maior=0), erro, "Destacker e Saída", "Parada pela botoeira")}}
    codigo_ok(S["id"], usados, erro, "Destacker e Saída", "-")
    # ---- Abastecimento
    pa = parametros(wb, "Abastecimento", erro)
    ab = {"empilhadeiras": pa("empilhadeiras", "empilhadeiras", minimo=0, inteiro=True),
          "entrada": {"estacao": D["id"], "pecas_por_pilha": pa("entrada", "peças por pilha", minimo=1, inteiro=True), "magazines": pa("entrada", "magazines", minimo=1, maximo=4, inteiro=True),
                      "chegada_empilhadeira_min": pa("entrada", "tempo para a empilhadeira", minimo=0), "troca_min": pa("entrada", "tempo para trocar", minimo=0)},
          "saida": None}
    disp = sum(t["duracao_min"] - t["pausa_min"] for t in turnos)
    calc = {"tempo_disponivel_dia_min": disp,
            "takt_s": round(disp * 60 / linha["demanda_pecas_dia"], 3) if linha["demanda_pecas_dia"] and disp else None}
    return {"formato": FORMATO_TRANSFER, "tipo_linha": "transfer", "origem": str(caminho).replace("\\", "/").split("/")[-1], "linha": linha, "turnos": turnos,
            "transfer": X, "interpress": {"quantidade": nip, "observacao": pd("interpress", "observação", texto=True)}, "prensas": prensas,
            "destacker": D, "abastecimento": ab, "saida": S, "calculado": calc}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(2)
    dados, erros = ler(sys.argv[1])
    if erros:
        print("A planilha tem %d ponto(s) para corrigir:" % len(erros))
        for e in erros: print("  - " + e)
        sys.exit(1)
    with open(sys.argv[2], "w", encoding="utf-8") as f: json.dump(dados, f, ensure_ascii=False, indent=2)
    c = dados["calculado"]
    print("Arquivo da linha gravado: %s" % sys.argv[2])
    partes = "%d prensas (linha transfer)" % len(dados["prensas"]) if "prensas" in dados else "%d estações" % len(dados["estacoes"])
    print("  %s · %d turno(s) · tempo disponível %s min/dia · takt %.2f s" % (partes, len(dados["turnos"]), c["tempo_disponivel_dia_min"], c["takt_s"]))
