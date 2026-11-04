# -*- coding: utf-8 -*-
"""Simulador de Linha — etapa S1 (04/11/2026): cria a planilha modelo da LINHA TRANSFER (CLP do transfer é o mestre).
Os valores de exemplo vêm do arquivo da linha T fictícia, para a planilha e o formulário mostrarem os mesmos números.
Uso: python criar_planilha_transfer.py <linha_T.json> <saida.xlsx>"""
import sys, json
from datetime import time
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation

d = json.load(open(sys.argv[1], encoding="utf-8"))
SAIDA = sys.argv[2]
F = "Arial"
ESCURO = PatternFill("solid", start_color="1E2226")
AMARELO = PatternFill("solid", start_color="FFF2B3")
CINZA = PatternFill("solid", start_color="EDEDED")
SECAO = PatternFill("solid", start_color="F2B705")
fino = Side(style="thin", color="BFBFBF")
BORDA = Border(left=fino, right=fino, top=fino, bottom=fino)


def cab(ws, linha, textos, larguras=None):
    for i, t in enumerate(textos, 1):
        c = ws.cell(row=linha, column=i, value=t)
        c.font = Font(name=F, bold=True, color="FFFFFF", size=10); c.fill = ESCURO; c.border = BORDA
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    if larguras:
        for i, w in enumerate(larguras, 1): ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    ws.row_dimensions[linha].height = 42


def entrada(c, valor, fmt=None):
    c.value = valor; c.fill = AMARELO; c.border = BORDA; c.font = Font(name=F, size=10, color="0000FF")
    c.alignment = Alignment(vertical="center", wrap_text=True)
    if fmt: c.number_format = fmt


def texto(c, valor, bold=False, size=10, cor=None):
    c.value = valor; c.font = Font(name=F, bold=bold, size=size, color=cor); c.alignment = Alignment(vertical="top", wrap_text=True)


def aba_parametros(ws, itens):
    """Aba Parâmetro | Valor | Unidade | Explicação. Item com valor None e fmt "SECAO" = título de seção."""
    cab(ws, 1, ["Parâmetro", "Valor", "Unidade", "Explicação"], [40, 18, 12, 72])
    for i, (nome, valor, un, expl, fmt) in enumerate(itens, 2):
        if fmt == "SECAO":
            c = ws.cell(row=i, column=1, value=nome); c.font = Font(name=F, bold=True, size=10, color="1E2226")
            for col in range(1, 5): ws.cell(row=i, column=col).fill = SECAO
            continue
        texto(ws.cell(row=i, column=1), nome, bold=True)
        if isinstance(valor, str) and not fmt: entrada(ws.cell(row=i, column=2), valor)
        else: entrada(ws.cell(row=i, column=2), valor, fmt)
        texto(ws.cell(row=i, column=3), un); texto(ws.cell(row=i, column=4), expl)
    ws.freeze_panes = "A2"


L, X, D, S = d["linha"], d["transfer"], d["destacker"], d["saida"]
wb = Workbook()

# ------------------------------------------------------------------ LEIA-ME
ws = wb.active; ws.title = "LEIA-ME"
ws.column_dimensions["A"].width = 4; ws.column_dimensions["B"].width = 104
linhas = [
    ("Simulador de Linha — planilha da LINHA TRANSFER", True, 16),
    ("Para linhas em que o CLP do transfer é o mestre: Y avança → X avança → Y recua → X volta enquanto as prensas golpeiam → OK das prensas em PMS.", False, 10),
    ("Os mesmos dados também podem ser alterados nos formulários (ABRIR_FORMULARIOS.bat).", False, 10),
    ("", False, 10),
    ("COMO PREENCHER", True, 11),
    ("• Células AMARELAS com número AZUL: preencha ou troque pelos dados da sua linha. Células CINZA são calculadas.", False, 10),
    ("• Passe o mouse sobre o título das colunas da aba Prensas para ver a explicação.", False, 10),
    ("• Use tempos medidos (parâmetros dos servos, CLP, cronoanálise, histórico de paradas).", False, 10),
    ("", False, 10),
    ("AS ABAS", True, 11),
    ("1. Linha — nome, peça, demanda, lote e troca de ferramenta.", False, 10),
    ("2. Turnos — horário de cada turno e o tempo de pausa.", False, 10),
    ("3. Transfer — eixos X e Y (curso, velocidade, aceleração), confirmação entre passos e falhas.", False, 10),
    ("4. Prensas — uma linha por prensa, na ordem: golpes por minuto do volante, curso, embreagem, freio, falhas e refugo.", False, 10),
    ("5. Destacker e Saída — interpress, destacker (magazines A e B), esteira, mesa e operadora com botoeira.", False, 10),
    ("6. Abastecimento — pilhas de blanks dos magazines e empilhadeiras.", False, 10),
    ("", False, 10),
    ("EXEMPLO", True, 11),
    ("Vem preenchida com a Linha T FICTÍCIA (transfer de 8 prensas). Todos os números são inventados, só para mostrar o formato.", False, 10),
    ("", False, 10),
    ("UNIDADES", True, 11),
    ("Cursos em mm, velocidades em mm/s, acelerações em mm/s², tempos de movimento em segundos (s). Falhas, reparos, trocas e pausas em minutos (min).", False, 10),
]
for i, (t, b, s) in enumerate(linhas, 1): texto(ws.cell(row=i, column=2), t, bold=b, size=s)
ws["B1"].font = Font(name=F, bold=True, size=16, color="1E2226")
for j, (fill, t, cor) in enumerate([(AMARELO, "Dado da linha (preencher)", "0000FF"), (CINZA, "Calculado (não mexer)", "000000")]):
    r = len(linhas) + 2 + j
    ws.cell(row=r, column=1).fill = fill; ws.cell(row=r, column=1).border = BORDA; texto(ws.cell(row=r, column=2), t, cor=cor)

# ------------------------------------------------------------------ Linha
ws = wb.create_sheet("Linha")
aba_parametros(ws, [
    ("Nome da linha", L["nome"], "", "Como a linha é chamada na fábrica.", None),
    ("Peça / produto", L["produto"], "", "A peça simulada. Uma planilha por peça.", None),
    ("Peças por golpe", L["pecas_por_golpe"], "peças", "Quantas peças saem a cada golpe (2 se a ferramenta for dupla).", "0"),
    ("Demanda por dia", L["demanda_pecas_dia"], "peças/dia", "Quantas peças boas a produção precisa entregar por dia.", "#,##0"),
    ("Tamanho do lote", L["lote_pecas"], "peças", "Peças entre duas trocas de ferramenta. A linha esvazia, troca e enche de novo.", "#,##0"),
    ("Troca de ferramenta (setup)", L["setup_min"], "min", "Tempo com a linha parada para trocar as ferramentas.", "0.0"),
    ("Dias a simular", L["dias_simulados"], "dias", "Quantos dias de produção o simulador roda.", "0"),
    ("Semente", L["semente"], "", "Fixa o sorteio: a mesma semente dá sempre o mesmo resultado.", "0"),
])
r = 10
texto(ws.cell(row=r, column=1), "Tempo disponível por dia", bold=True)
c = ws.cell(row=r, column=2, value="=SUMPRODUCT(MOD(Turnos!C2:C7-Turnos!B2:B7,1))*24*60-SUM(Turnos!D2:D7)"); c.fill = CINZA; c.border = BORDA; c.number_format = "#,##0"
texto(ws.cell(row=r, column=3), "min"); texto(ws.cell(row=r, column=4), "Soma dos turnos menos as pausas (aba Turnos).")
texto(ws.cell(row=r + 1, column=1), "Takt (ritmo pedido)", bold=True)
c = ws.cell(row=r + 1, column=2, value='=IFERROR(B10*60/B5,"")'); c.fill = CINZA; c.border = BORDA; c.number_format = "0.00"
texto(ws.cell(row=r + 1, column=3), "s"); texto(ws.cell(row=r + 1, column=4), "Tempo disponível dividido pela demanda.")

# ------------------------------------------------------------------ Turnos
ws = wb.create_sheet("Turnos")
cab(ws, 1, ["Turno", "Início", "Fim", "Pausas (min)", "Observação"], [16, 12, 12, 14, 60])
hora = lambda s: time(int(s[:2]), int(s[3:5]))
for i in range(2, 8):
    t = d["turnos"][i - 2] if i - 2 < len(d["turnos"]) else None
    entrada(ws.cell(row=i, column=1), t["nome"] if t else None)
    entrada(ws.cell(row=i, column=2), hora(t["inicio"]) if t else None, "hh:mm"); entrada(ws.cell(row=i, column=3), hora(t["fim"]) if t else None, "hh:mm")
    entrada(ws.cell(row=i, column=4), t["pausa_min"] if t else None, "0")
ws.freeze_panes = "A2"

# ------------------------------------------------------------------ Transfer
ws = wb.create_sheet("Transfer")
f = X.get("falhas") or {}
aba_parametros(ws, [
    ("TRANSFER — CLP MESTRE (servo com encoder, 360°)", None, "", "", "SECAO"),
    ("Código", X["id"], "", "Começa por EST_ e não tem espaço (mesmo nome no Unreal e no Blender).", None),
    ("Nome", X["nome"], "", "", None),
    ("EIXO X — avança e volta (cremalheira)", None, "", "", "SECAO"),
    ("Curso do X (passo)", X["eixo_x"]["curso_mm"], "mm", "Distância entre duas estações: o quanto a barra leva as peças a cada ciclo.", "0"),
    ("Velocidade do X", X["eixo_x"]["vel_mm_s"], "mm/s", "Velocidade máxima programada no servo.", "0"),
    ("Aceleração do X", X["eixo_x"]["acel_mm_s2"], "mm/s²", "Aceleração (e frenagem) programada no servo.", "0"),
    ("EIXO Y — fingers entram e saem (todos os interpress juntos)", None, "", "", "SECAO"),
    ("Curso do Y", X["eixo_y"]["curso_mm"], "mm", "Quanto os fingers andam para encaixar na peça.", "0"),
    ("Velocidade do Y", X["eixo_y"]["vel_mm_s"], "mm/s", "", "0"),
    ("Aceleração do Y", X["eixo_y"]["acel_mm_s2"], "mm/s²", "", "0"),
    ("CICLO", None, "", "", "SECAO"),
    ("Confirmação entre passos", X["confirmacao_s"], "s", "Tempo do sensor / sinal de fim de movimento antes do passo seguinte.", "0.00"),
    ("FALHAS DO TRANSFER", None, "", "", "SECAO"),
    ("Tempo médio entre falhas (MTBF)", f.get("mtbf_min"), "min", "Vazio nos dois = sem falhas.", "0"),
    ("Tempo médio de reparo (MTTR)", f.get("mttr_min"), "min", "", "0.0"),
])

# ------------------------------------------------------------------ Prensas
ws = wb.create_sheet("Prensas")
colunas = [
    ("Ordem", 8, "Posição na linha: 1 é a primeira prensa."),
    ("Código", 18, "Começa por EST_ (ex.: EST_Prensa_1)."),
    ("Nome", 28, "Nome e operação da prensa."),
    ("Capacidade (t)", 12, "Força da prensa em toneladas."),
    ("Golpes por minuto do volante", 14, "Ritmo da prensa em golpes contínuos. Um golpe = uma volta (PMS 0° → PMI 180° → PMS)."),
    ("Curso do martelo (mm)", 12, "Do PMS ao PMI."),
    ("Embreagem (s)", 11, "Tempo para a embreagem acoplar depois da liberação do transfer."),
    ("Freio (s)", 11, "Tempo para o freio parar o martelo no PMS."),
    ("Tempo médio entre falhas (min)", 14, "MTBF. Vazio = sem falhas."),
    ("Tempo médio de reparo (min)", 14, "MTTR."),
    ("Refugo (%)", 10, "Porcentagem de peças ruins que saem desta prensa."),
]
cab(ws, 1, [c[0] for c in colunas], [c[1] for c in colunas])
for i, c in enumerate(colunas, 1): ws.cell(row=1, column=i).comment = Comment(c[2], "Simulador")
for r in range(2, 22):
    p = d["prensas"][r - 2] if r - 2 < len(d["prensas"]) else None
    vals = [p["ordem"], p["id"], p["nome"], p["capacidade_t"], p["spm_volante"], p["curso_mm"], p["embreagem_s"], p["freio_s"],
            (p["falhas"] or {}).get("mtbf_min"), (p["falhas"] or {}).get("mttr_min"), p["refugo_pct"]] if p else [None] * 11
    for col, v in enumerate(vals, 1):
        entrada(ws.cell(row=r, column=col), v, {1: "0", 4: "0", 5: "0.0", 6: "0", 7: "0.00", 8: "0.00", 9: "0", 10: "0.0", 11: "0.00"}.get(col))
dv = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True, error="Use um número maior ou igual a zero.", errorTitle="Número")
ws.add_data_validation(dv); dv.add("D2:K21")
ws.freeze_panes = "D2"

# ------------------------------------------------------------------ Destacker e Saída
ws = wb.create_sheet("Destacker e Saída")
op = S["operadora"]; fd = D.get("falhas") or {}
aba_parametros(ws, [
    ("INTERPRESS", None, "", "", "SECAO"),
    ("Quantidade de interpress", d["interpress"]["quantidade"], "un.", "Entrada + entre as prensas + saída (8 prensas = 9).", "0"),
    ("Observação dos interpress", d["interpress"].get("observacao", ""), "", "", None),
    ("DESTACKER — magazines A e B", None, "", "", "SECAO"),
    ("Código do destacker", D["id"], "", "", None),
    ("Nome do destacker", D["nome"], "", "", None),
    ("Pega do blank — mínimo", D["pega_s"]["min"], "s", "Tempo para pegar o blank do magazine e colocar no interpress de entrada (acontece enquanto as prensas golpeiam).", "0.00"),
    ("Pega do blank — mais comum", D["pega_s"]["mais_comum"], "s", "", "0.00"),
    ("Pega do blank — máximo", D["pega_s"]["max"], "s", "", "0.00"),
    ("Troca de magazine A ↔ B", D["troca_magazine_s"], "s", "Quando o magazine esvazia, o destacker passa para o outro.", "0.0"),
    ("Destacker — tempo médio entre falhas", fd.get("mtbf_min"), "min", "Vazio nos dois = sem falhas.", "0"),
    ("Destacker — tempo médio de reparo", fd.get("mttr_min"), "min", "", "0.0"),
    ("SAÍDA — esteira, mesa e operadora", None, "", "", "SECAO"),
    ("Código da saída", S["id"], "", "", None),
    ("Nome da saída", S["nome"], "", "", None),
    ("Tempo na esteira até a mesa", S["esteira_s"], "s", "A mesa nunca para a linha por estar cheia.", "0.0"),
    ("Operadora por peça — mínimo", op["tempo_peca_s"]["min"], "s", "Tempo para pegar, conferir e colocar na caixa.", "0.00"),
    ("Operadora por peça — mais comum", op["tempo_peca_s"]["mais_comum"], "s", "", "0.00"),
    ("Operadora por peça — máximo", op["tempo_peca_s"]["max"], "s", "", "0.00"),
    ("Peças com defeito que a operadora acha", op["acha_defeito_pct"], "%", "Quando acha, aperta a botoeira e a linha para.", "0"),
    ("Parada pela botoeira — mínimo", op["parada_botoeira_min"]["min"], "min", "Quanto tempo a linha fica parada depois da botoeira.", "0.0"),
    ("Parada pela botoeira — mais comum", op["parada_botoeira_min"]["mais_comum"], "min", "", "0.0"),
    ("Parada pela botoeira — máximo", op["parada_botoeira_min"]["max"], "min", "", "0.0"),
])

# ------------------------------------------------------------------ Abastecimento
ws = wb.create_sheet("Abastecimento")
e = d["abastecimento"]["entrada"]
aba_parametros(ws, [
    ("ENTRADA — pilhas de blanks nos magazines", None, "", "", "SECAO"),
    ("Peças por pilha de blanks", e["pecas_por_pilha"], "peças", "Quantos blanks vêm em cada pilha.", "#,##0"),
    ("Magazines (pilhas na máquina)", e["magazines"], "", "2 = troca uma pilha enquanto a outra alimenta.", "0"),
    ("Tempo para a empilhadeira chegar", e["chegada_empilhadeira_min"], "min", "Do pedido (magazine vazio) até a empilhadeira chegar.", "0.0"),
    ("Tempo para trocar a pilha", e["troca_min"], "min", "Tirar o palete vazio e colocar a pilha nova.", "0.0"),
    ("EMPILHADEIRAS", None, "", "", "SECAO"),
    ("Empilhadeiras para esta linha", d["abastecimento"]["empilhadeiras"], "", "0 = o abastecimento não é simulado.", "0"),
])

for w in wb.worksheets:
    w.sheet_view.showGridLines = w.title != "LEIA-ME"
    w.page_setup.orientation = "landscape"; w.page_setup.paperSize = w.PAPERSIZE_A4
    w.page_setup.fitToWidth = 1; w.page_setup.fitToHeight = 0; w.sheet_properties.pageSetUpPr.fitToPage = True
wb.save(SAIDA)
print("ok", SAIDA)
