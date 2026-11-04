# -*- coding: utf-8 -*-
"""Simulador de Linha — etapa E1 (03/11/2026): cria a planilha modelo que o cliente preenche.
Exemplo preenchido: linha A (prensas em linha com destacker e transfer), números FICTÍCIOS.
Uso: python criar_planilha_modelo.py <saida.xlsx>"""
import sys
from datetime import time
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation

SAIDA = sys.argv[1]
F = "Arial"
ESCURO = PatternFill("solid", start_color="1E2226")
AMARELO = PatternFill("solid", start_color="FFF2B3")      # célula para o cliente preencher
CINZA = PatternFill("solid", start_color="EDEDED")        # calculado (não mexer)
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

wb = Workbook()

# ------------------------------------------------------------------ LEIA-ME
ws = wb.active; ws.title = "LEIA-ME"
ws.column_dimensions["A"].width = 4; ws.column_dimensions["B"].width = 100
linhas = [
    ("Simulador de Linha — planilha de dados da linha", True, 16),
    ("Preencha uma aba de cada vez. O simulador lê esta planilha e calcula peças por hora, gargalo e OEE.", False, 10),
    ("", False, 10),
    ("COMO PREENCHER", True, 11),
    ("• Células AMARELAS com número AZUL: preencha ou troque pelos dados da sua linha.", False, 10),
    ("• Células CINZA: são calculadas sozinhas. Não precisa mexer.", False, 10),
    ("• Passe o mouse sobre o título de cada coluna para ver a explicação.", False, 10),
    ("• Use os tempos medidos (cronoanálise, registro do CLP, histórico de paradas). Sem tempos medidos o resultado mostra só tendências.", False, 10),
    ("", False, 10),
    ("AS ABAS", True, 11),
    ("1. Linha — nome, peça, demanda, lote e troca de ferramenta.", False, 10),
    ("2. Turnos — horário de cada turno e o tempo de pausa.", False, 10),
    ("3. Estações — uma linha por máquina, na ordem do fluxo: tempos de ciclo, estoque depois dela, falhas e refugo.", False, 10),
    ("4. Abastecimento — pilhas de blanks na entrada, racks na saída e empilhadeiras.", False, 10),
    ("", False, 10),
    ("EXEMPLO", True, 11),
    ("A planilha já vem preenchida com uma linha de prensas FICTÍCIA (destacker, 4 prensas em linha e fim de linha). Todos os números são inventados, só para mostrar o formato.", False, 10),
    ("Para a sua linha, troque os valores amarelos e apague ou acrescente estações na aba Estações.", False, 10),
    ("", False, 10),
    ("UNIDADES", True, 11),
    ("Tempos de ciclo em segundos (s). Falhas, reparos, trocas e pausas em minutos (min). Horários no formato 06:00.", False, 10),
]
for i, (t, b, s) in enumerate(linhas, 1):
    texto(ws.cell(row=i, column=2), t, bold=b, size=s)
ws["B1"].font = Font(name=F, bold=True, size=16, color="1E2226")
legenda = [(AMARELO, "Dado da linha (preencher)", "0000FF"), (CINZA, "Calculado (não mexer)", "000000")]
for j, (fill, t, cor) in enumerate(legenda):
    r = len(linhas) + 2 + j
    ws.cell(row=r, column=1).fill = fill; ws.cell(row=r, column=1).border = BORDA
    texto(ws.cell(row=r, column=2), t, cor=cor)

# ------------------------------------------------------------------ Linha
ws = wb.create_sheet("Linha")
cab(ws, 1, ["Parâmetro", "Valor", "Unidade", "Explicação"], [34, 18, 12, 70])
param = [
    ("Nome da linha", "Linha A — prensas em linha (FICTÍCIA)", "", "Como a linha é chamada na fábrica.", None),
    ("Peça / produto", "Painel lateral (exemplo)", "", "A peça simulada. Uma planilha por peça.", None),
    ("Peças por golpe", 1, "peças", "Quantas peças saem a cada ciclo das prensas (1 ou 2, se a matriz for dupla).", "0"),
    ("Demanda por dia", 10000, "peças/dia", "Quantas peças boas a produção precisa entregar por dia.", "#,##0"),
    ("Tamanho do lote", 1500, "peças", "Peças produzidas entre duas trocas de ferramenta.", "#,##0"),
    ("Troca de ferramenta (setup)", 20, "min", "Tempo com a linha parada para trocar as matrizes, do último golpe bom ao primeiro golpe bom.", "0.0"),
    ("Dias a simular", 5, "dias", "Quantos dias de produção o simulador roda (mais dias = resultado mais estável).", "0"),
    ("Semente", 1, "", "Número que fixa o sorteio. A mesma semente dá sempre o mesmo resultado.", "0"),
]
for i, (nome, valor, un, expl, fmt) in enumerate(param, 2):
    texto(ws.cell(row=i, column=1), nome, bold=True)
    entrada(ws.cell(row=i, column=2), valor, fmt)
    texto(ws.cell(row=i, column=3), un); texto(ws.cell(row=i, column=4), expl)
r = len(param) + 2
calc = [
    ("Tempo disponível por dia", "=SUMPRODUCT(MOD(Turnos!C2:C7-Turnos!B2:B7,1))*24*60-SUM(Turnos!D2:D7)", "min", "Soma dos turnos menos as pausas (aba Turnos).", "#,##0"),
    ("Takt (ritmo pedido)", "=IFERROR(B{d}*60/B5,\"\")", "s", "Tempo disponível dividido pela demanda: a linha precisa entregar uma peça boa a cada takt.", "0.00"),
]
for j, (nome, form, un, expl, fmt) in enumerate(calc):
    rr = r + j
    texto(ws.cell(row=rr, column=1), nome, bold=True)
    c = ws.cell(row=rr, column=2, value=form.replace("{d}", str(r))); c.fill = CINZA; c.border = BORDA
    c.font = Font(name=F, size=10); c.number_format = fmt
    texto(ws.cell(row=rr, column=3), un); texto(ws.cell(row=rr, column=4), expl)
ws.freeze_panes = "A2"

# ------------------------------------------------------------------ Turnos
ws = wb.create_sheet("Turnos")
cab(ws, 1, ["Turno", "Início", "Fim", "Pausas (min)", "Observação"], [16, 12, 12, 14, 60])
turnos = [("1º turno", time(6, 0), time(14, 0), 60, "Refeição e ginástica laboral (exemplo)"),
          ("2º turno", time(14, 0), time(22, 0), 60, "Refeição (exemplo)")]
for i in range(2, 8):                     # 6 linhas para turnos (as vazias não contam)
    t = turnos[i - 2] if i - 2 < len(turnos) else ("", None, None, None, "")
    entrada(ws.cell(row=i, column=1), t[0] or None)
    entrada(ws.cell(row=i, column=2), t[1], "hh:mm"); entrada(ws.cell(row=i, column=3), t[2], "hh:mm")
    entrada(ws.cell(row=i, column=4), t[3], "0"); texto(ws.cell(row=i, column=5), t[4])
ws["B1"].comment = Comment("Hora de início do turno, ex.: 06:00", "Simulador")
ws["C1"].comment = Comment("Hora de fim. Se passar da meia-noite (ex.: 22:00 até 06:00), o cálculo já entende.", "Simulador")
ws["D1"].comment = Comment("Minutos em que a linha para por pausa programada dentro do turno.", "Simulador")
ws.freeze_panes = "A2"

# ------------------------------------------------------------------ Estações
ws = wb.create_sheet("Estações")
colunas = [
    ("Ordem", 8, "Posição no fluxo: 1 é a primeira máquina."),
    ("Código", 18, "Nome curto sem espaço, começando por EST_ (ex.: EST_Prensa_1). É o mesmo nome do objeto no Unreal e no Blender."),
    ("Nome", 26, "Nome da máquina como a fábrica chama."),
    ("Tipo", 15, "alimentação (primeira), processo, saída (última)."),
    ("Ciclo mínimo (s)", 12, "O ciclo mais rápido medido, em segundos."),
    ("Ciclo mais comum (s)", 12, "O ciclo que mais aparece nas medições."),
    ("Ciclo máximo (s)", 12, "O ciclo mais lento medido (sem contar parada)."),
    ("Máquinas iguais em paralelo", 12, "Quantas máquinas iguais fazem esta mesma etapa ao mesmo tempo (normalmente 1)."),
    ("Estoque depois (peças)", 12, "Quantas peças cabem entre esta máquina e a próxima. 0 = ligadas direto (sincronizadas, como prensas com transfer)."),
    ("Tempo médio entre falhas (min)", 14, "MTBF: de quanto em quanto tempo de trabalho a máquina quebra, em média. Vazio = sem falhas."),
    ("Tempo médio de reparo (min)", 14, "MTTR: quanto tempo leva, em média, do pedido até a máquina voltar."),
    ("Refugo (%)", 10, "Porcentagem de peças ruins que saem desta máquina."),
    ("Observação", 40, "Qualquer detalhe que ajude a entender a máquina."),
]
cab(ws, 1, [c[0] for c in colunas], [c[1] for c in colunas])
for i, c in enumerate(colunas, 1):
    ws.cell(row=1, column=i).comment = Comment(c[2], "Simulador")
estacoes = [
    (1, "EST_Destacker", "Destacker (alimentador de blanks)", "alimentação", 3.8, 4.0, 4.6, 1, 2, 240, 6, 0, "2 magazines de pilha; troca pela empilhadeira (aba Abastecimento)"),
    (2, "EST_Lavadora", "Lavadora e oleadeira", "processo", 3.5, 3.6, 3.9, 1, 1, 600, 10, 0, "Esteira contínua"),
    (3, "EST_Centralizador", "Mesa centralizadora", "processo", 3.4, 3.5, 3.8, 1, 0, 480, 5, 0, ""),
    (4, "EST_Prensa_1", "Prensa 1 — embutimento", "processo", 4.2, 4.3, 4.7, 1, 0, 300, 12, 0.5, "Ciclo inclui o transfer até a prensa 2"),
    (5, "EST_Prensa_2", "Prensa 2 — corte", "processo", 4.0, 4.1, 4.4, 1, 0, 420, 10, 0.2, "Ciclo inclui o transfer"),
    (6, "EST_Prensa_3", "Prensa 3 — furação", "processo", 4.0, 4.1, 4.3, 1, 0, 480, 9, 0.2, "Ciclo inclui o transfer"),
    (7, "EST_Prensa_4", "Prensa 4 — calibração", "processo", 4.0, 4.1, 4.3, 1, 3, 500, 9, 0.1, "Esteira de saída com 3 peças"),
    (8, "EST_FimDeLinha", "Fim de linha (inspeção e rack)", "saída", 3.9, 4.2, 5.0, 1, 0, 0, 0, 0.3, "2 operadores; racks trocados pela empilhadeira"),
]
LINHAS_EST = 25
for r in range(2, 2 + LINHAS_EST):
    e = estacoes[r - 2] if r - 2 < len(estacoes) else [None] * 13
    for col in range(1, 14):
        v = e[col - 1]
        if col in (10, 11) and v == 0: v = None          # sem falhas: deixa vazio
        fmt = {1: "0", 5: "0.00", 6: "0.00", 7: "0.00", 8: "0", 9: "0", 10: "0", 11: "0.0", 12: "0.0"}.get(col)
        if col == 13: texto(ws.cell(row=r, column=col), v)
        else: entrada(ws.cell(row=r, column=col), v if v != "" else None, fmt)
dv_tipo = DataValidation(type="list", formula1='"alimentação,processo,saída"', allow_blank=True,
                         error="Use: alimentação, processo ou saída.", errorTitle="Tipo de estação")
dv_num = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                        error="Use um número maior ou igual a zero.", errorTitle="Número")
ws.add_data_validation(dv_tipo); ws.add_data_validation(dv_num)
dv_tipo.add(f"D2:D{1 + LINHAS_EST}")
dv_num.add(f"E2:L{1 + LINHAS_EST}")
ws.freeze_panes = "D2"

# ------------------------------------------------------------------ Abastecimento
ws = wb.create_sheet("Abastecimento")
cab(ws, 1, ["Item", "Valor", "Unidade", "Explicação"], [38, 14, 12, 70])
abast = [
    ("ENTRADA — blanks no destacker", None, "", "", None),
    ("Peças por pilha de blanks", 800, "peças", "Quantos blanks vêm em cada pilha.", "#,##0"),
    ("Magazines (pilhas na máquina)", 2, "", "1 = a linha para a cada troca de pilha; 2 = troca uma pilha enquanto a outra alimenta.", "0"),
    ("Tempo para a empilhadeira chegar", 5, "min", "Do pedido (pilha acabando) até a empilhadeira chegar à máquina.", "0.0"),
    ("Tempo para trocar a pilha", 4, "min", "Tirar o palete vazio e colocar a pilha nova.", "0.0"),
    ("SAÍDA — racks no fim de linha", None, "", "", None),
    ("Peças por rack", 120, "peças", "Quantas peças cabem em cada rack.", "#,##0"),
    ("Posições de rack", 2, "", "1 = a linha para a cada troca de rack; 2 = enche um rack enquanto o outro é trocado.", "0"),
    ("Tempo para a empilhadeira chegar", 5, "min", "Do pedido (rack cheio) até a empilhadeira chegar.", "0.0"),
    ("Tempo para trocar o rack", 3, "min", "Tirar o rack cheio e colocar um vazio.", "0.0"),
    ("EMPILHADEIRAS", None, "", "", None),
    ("Empilhadeiras para esta linha", 1, "", "Quantas empilhadeiras atendem a entrada E a saída. Com 1 só, uma troca pode esperar a outra.", "0"),
]
for i, (nome, valor, un, expl, fmt) in enumerate(abast, 2):
    if valor is None and fmt is None:
        c = ws.cell(row=i, column=1, value=nome); c.font = Font(name=F, bold=True, size=10, color="1E2226")
        for col in range(1, 5): ws.cell(row=i, column=col).fill = PatternFill("solid", start_color="F2B705")
        continue
    texto(ws.cell(row=i, column=1), nome, bold=True)
    entrada(ws.cell(row=i, column=2), valor, fmt)
    texto(ws.cell(row=i, column=3), un); texto(ws.cell(row=i, column=4), expl)

for w in wb.worksheets:
    w.sheet_view.showGridLines = False if w.title == "LEIA-ME" else True
    # impressão: deitada, a aba inteira na largura de uma folha A4
    w.page_setup.orientation = "landscape"; w.page_setup.paperSize = w.PAPERSIZE_A4
    w.page_setup.fitToWidth = 1; w.page_setup.fitToHeight = 0; w.sheet_properties.pageSetUpPr.fitToPage = True
wb.save(SAIDA)
print("ok", SAIDA)
