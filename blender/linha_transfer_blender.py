# -*- coding: utf-8 -*-
"""Simulador de Linha — LINHA TRANSFER NO BLENDER (etapa S6, 04/11/2026). Feito para o Blender 5.1.
Monta a cena genérica da Linha T (fictícia, mesmas medidas e nomes do simulador) e aplica a animação exportada
pelo simulador quadro a quadro (ferramentas/exportar_animacao.mjs). Os números vêm SÓ do simulador: aqui só se mostra.
Pode gravar o .blend e gerar o vídeo (EEVEE). Não abre nem altera nenhum outro arquivo seu.

Uso (o GERAR_VIDEO_BLENDER.bat faz tudo):
  blender --background --factory-startup --python linha_transfer_blender.py -- --animacao ARQ.json
          [--blend saida.blend] [--video saida.mp4] [--fbx saida.fbx] [--resolucao 1920x1080] [--amostras 32] [--quadros N] [--camera geral|prensa|destacker]
  --fbx: cena animada para o Unreal 4.27 (malhas + movimento; as luzes de estado e os textos não vão no FBX)
"""
import bpy, bmesh, json, math, os, sys
from bpy_extras import anim_utils

# ---------------------------------------------------------------- argumentos
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(nome, padrao=None):
    return argv[argv.index(nome) + 1] if nome in argv and argv.index(nome) + 1 < len(argv) else padrao
ANIM = arg("--animacao"); BLEND = arg("--blend"); VIDEO = arg("--video"); FOTO = arg("--foto"); FBX = arg("--fbx")
RES = [int(x) for x in arg("--resolucao", "1920x1080").lower().split("x")]
AMOSTRAS = int(arg("--amostras", "32")); CAMERA = arg("--camera", "geral")
if not ANIM: print("Falta --animacao <arquivo.json>"); sys.exit(2)
dados = json.load(open(ANIM, encoding="utf-8"))
QUADROS = dados["quadros"][: int(arg("--quadros", "0")) or None]
L = dados["layout"]; P, YT = L["P"], L["Y_TRAB"]

# ---------------------------------------------------------------- cena limpa (sem mexer em nenhum arquivo)
bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene
cena.unit_settings.system = "METRIC"
col = bpy.data.collections.new("Linha_T"); cena.collection.children.link(col)
def B(x, y, z):            # simulador (x ao longo da linha, y para cima, z para a frente) → Blender (z para cima)
    return (x, -z, y)

# ---------------------------------------------------------------- materiais
def material(nome, cor, metal=0.0, rugosidade=0.5, cor_do_objeto=False, emissao=0.0):
    m = bpy.data.materials.new(nome)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*cor, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rugosidade
    if cor_do_objeto:                                   # a cor vem do objeto (animada: luzes de estado, peça ruim em vermelho)
        info = nt.nodes.new("ShaderNodeObjectInfo")
        nt.links.new(info.outputs["Color"], b.inputs["Base Color"])
        if emissao: nt.links.new(info.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = emissao
    return m
def hexcor(h): h = h.lstrip("#"); return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))
M = {
    "corpo": material("Pintura_maquina", hexcor("8b939b"), 0.35, 0.42), "escuro": material("Escuro", hexcor("363b40"), 0.3, 0.55),
    "claro": material("Claro", hexcor("c7ccd1"), 0.5, 0.35), "amarelo": material("Amarelo_seguranca", hexcor("e0ac00"), 0.1, 0.45),
    "chapa": material("Chapa", (1, 1, 1), 0.9, 0.22, cor_do_objeto=True), "barra": material("Barra_transfer", hexcor("b8bec4"), 0.85, 0.25),
    "esteira": material("Borracha", hexcor("26292c"), 0.0, 0.8), "papelao": material("Papelao", hexcor("a47c52"), 0.0, 0.85),
    "vermelho": material("Cacamba_refugo", hexcor("b3261e"), 0.1, 0.5), "uniforme": material("Uniforme", hexcor("3f6fb0"), 0.0, 0.7),
    "luz": material("Luz_de_estado", (1, 1, 1), 0.0, 0.3, cor_do_objeto=True, emissao=4.0), "faixa": material("Faixa_piso", hexcor("c9a400"), 0.0, 0.6),
    "texto": material("Texto", (1, 1, 1), 0.0, 0.5),
}
pisoM = material("Piso_concreto", hexcor("5a5d61"), 0.0, 0.85)
{   # um pouco de textura no piso
    "x": 0}
nt = pisoM.node_tree; ruido = nt.nodes.new("ShaderNodeTexNoise"); ruido.inputs["Scale"].default_value = 40
ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (*hexcor("4e5155"), 1); ramp.color_ramp.elements[1].color = (*hexcor("63666a"), 1)
nt.links.new(ruido.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])

# ---------------------------------------------------------------- malhas (feitas direto na memória, com chanfro)
def objeto(nome, malha, mat, loc=(0, 0, 0), pai=None, chanfro=0.006):
    o = bpy.data.objects.new(nome, malha); col.objects.link(o); o.location = loc
    if mat: o.data.materials.append(mat)
    if pai: o.parent = pai
    if chanfro:
        b = o.modifiers.new("chanfro", "BEVEL"); b.width = chanfro; b.segments = 2; b.limit_method = "ANGLE"
    return o
def malha_caixas(nome, caixas):          # várias caixas numa malha só: (w, h, d, x, y, z) nas medidas do simulador
    bm = bmesh.new()
    for (w, h, d, x, y, z) in caixas:
        r = bmesh.ops.create_cube(bm, size=1.0)
        bx, by, bz = B(x, y, z)
        for v in r["verts"]: v.co.x = v.co.x * w + bx; v.co.y = v.co.y * d + by; v.co.z = v.co.z * h + bz
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free(); return me
def caixa(nome, w, h, d, mat, x=0, y=0, z=0, pai=None, chanfro=0.006):
    return objeto(nome, malha_caixas(nome, [(w, h, d, 0, 0, 0)]), mat, B(x, y, z), pai, chanfro)
def cilindro(nome, r, h, mat, x=0, y=0, z=0, eixo="y", pai=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=r, radius2=r, depth=h)
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    o = objeto(nome, me, mat, B(x, y, z), pai, 0.004)
    if eixo == "z": o.rotation_euler = (math.pi / 2, 0, 0)       # eixo z do simulador = eixo y do Blender
    if eixo == "x": o.rotation_euler = (0, math.pi / 2, 0)
    return o
def vazio(nome, x=0, y=0, z=0, pai=None):
    e = bpy.data.objects.new(nome, None); col.objects.link(e); e.location = B(x, y, z); e.empty_display_size = 0.2
    if pai: e.parent = pai
    return e
luzes = {}
def lampada(chave, x, y, z, pai=None, r=0.06):
    cilindro(chave + "_haste", 0.012, 0.25, M["escuro"], x, y + 0.125, z, pai=pai)
    l = cilindro(chave + "_Luz", r, r * 2.2, M["luz"], x, y + 0.25 + r * 1.1, z, pai=pai); l["chave"] = chave; luzes[chave] = l; return l

# ---------------------------------------------------------------- piso, faixas
piso = caixa("Piso", 80, 0.02, 30, pisoM, L["xFim"] / 2, -0.01, 0, chanfro=0)
xa, xb = L["destacker"]["x"] - 8, L["saida"]["mesa_x"] + 4
for z in (-1.6, 2.2, 3.2, 5.6): caixa("Faixa_%s" % z, xb - xa, 0.003, 0.08, M["faixa"], (xa + xb) / 2, 0.002, z, chanfro=0)

# ---------------------------------------------------------------- interpress e prensas
prensas = {}
for p in L["posicoes"]:
    x = p["x"]
    if p["tipo"] == "interpress":
        g = vazio(p["id"], x, 0, 0)
        caixa(p["id"] + "_ninho", 0.36, 0.05, 0.36, M["escuro"], 0, YT - 0.035, 0, pai=g)
        caixa(p["id"] + "_coluna", 0.12, YT - 0.06, 0.12, M["corpo"], 0, (YT - 0.06) / 2, 0, pai=g)
        caixa(p["id"] + "_servoY", 0.14, 0.14, 0.14, M["escuro"], 0, 0.42, 0.16, pai=g)
        continue
    curso, topo = p["curso_m"], YT + 0.12 + p["curso_m"] + 0.5
    g = vazio(p["id"], x, 0, 0)
    caixa(p["id"] + "_mesa", 0.8, YT - 0.08, 1.4, M["corpo"], 0, (YT - 0.08) / 2, 0, pai=g)
    caixa(p["id"] + "_ferramenta_baixo", 0.6, 0.06, 0.5, M["escuro"], 0, YT - 0.05, 0, pai=g)
    objeto(p["id"] + "_colunas", malha_caixas(p["id"] + "_colunas", [(0.14, topo - YT + 0.1, 0.2, sx * 0.33, (YT + topo) / 2, sz * 0.55) for sx in (-1, 1) for sz in (-1, 1)]), M["corpo"], (0, 0, 0), g)
    caixa(p["id"] + "_coroa", 0.8, 0.6, 1.42, M["corpo"], 0, topo + 0.3, 0, pai=g)
    vol = cilindro(p["id"] + "_Volante", 0.32, 0.12, M["escuro"], 0, topo + 0.3, -0.78, eixo="z", pai=g)
    caixa(p["id"] + "_raio_volante", 0.5, 0.05, 0.02, M["amarelo"], 0, 0, 0, pai=vol, chanfro=0).location = (0, 0, -0.065)   # marca para ver o giro
    mart = vazio(p["id"] + "_Martelo", 0, YT + 0.012 + curso, 0, pai=g)
    caixa(p["id"] + "_martelo", 0.7, 0.32, 0.6, M["claro"], 0, 0.23, 0, pai=mart)
    caixa(p["id"] + "_ferramenta_cima", 0.6, 0.07, 0.5, M["escuro"], 0, 0.035, 0, pai=mart)
    objeto(p["id"] + "_cortina", malha_caixas(p["id"] + "_cortina", [(0.03, 0.9, 0.03, sx * 0.38, YT + 0.4, 0.72) for sx in (-1, 1)]), M["amarelo"], (0, 0, 0), g)
    lampada(p["id"], 0.3, topo + 0.6, 0.55, pai=g)
    prensas[p["id"]] = {"martelo": mart, "volante": vol, "y_pmi": YT + 0.012}; mart["y_pmi"] = YT + 0.012
    # placa com o nome (P1, P2…)
    t = bpy.data.curves.new(p["id"] + "_nome", "FONT"); t.body = p["nome"].split(" — ")[0].replace("Prensa ", "P"); t.size = 0.22; t.align_x = "CENTER"
    to = bpy.data.objects.new(p["id"] + "_Nome", t); col.objects.link(to); to.data.materials.append(M["texto"]); to.parent = g
    to.location = B(0, topo + 0.12, 0.72); to.rotation_euler = (math.pi / 2, 0, 0)

# ---------------------------------------------------------------- transfer: barras com fingers e acionamento
N = L["N"]; T = L["transfer"]; barras = []
for lado, nome in ((-1, "EST_Transfer_Barra_Tras"), (1, "EST_Transfer_Barra_Frente")):
    cx = [(T["comprimento"], 0.04, 0.03, T["comprimento"] / 2 - P, 0, 0)] + [(0.08, 0.02, 0.05, i * P, 0, -lado * 0.03) for i in range(N)]
    o = objeto(nome, malha_caixas(nome, cx), M["barra"], (0, 0, 0)); o["lado"] = lado; o["y_trab"] = YT; barras.append(o)
caixa("EST_Transfer_Acionamento", 0.5, 0.5, 1.1, M["escuro"], T["x_acionamento"], YT - 0.25, 0)
lampada("transfer", T["x_acionamento"], YT, 0.35)

# ---------------------------------------------------------------- destacker com magazines A e B
D = L["destacker"]; gx = D["x"]; dg = vazio("EST_Destacker", gx, 0, 0)
for sz in (-1, 1):
    caixa("EST_Destacker_base_%d" % sz, 0.6, 0.3, 0.5, M["escuro"], 0, 0.15, sz * 0.55, pai=dg)
    objeto("EST_Destacker_guias_%d" % sz, malha_caixas("g", [(0.025, 1.1, 0.025, sx * 0.28, 0.85, sz * 0.55 + 0.26) for sx in (-1, 1)]), M["amarelo"], (0, 0, 0), dg)
objeto("EST_Destacker_portico", malha_caixas("p", [(0.08, 2.1, 0.08, sx * 0.4 + (1.3 if sx > 0 else 0), 1.05, sz * 0.95) for sx in (-1, 1) for sz in (-1, 1)] + [(2.4, 0.12, 2.0, 0.65, 2.1, 0)]), M["corpo"], (0, 0, 0), dg)
carro = vazio("EST_Destacker_Carro", gx, 1.95, 0)
caixa("carro", 0.22, 0.14, 0.22, M["claro"], 0, 0, 0, pai=carro); cilindro("carro_haste", 0.02, 0.6, M["escuro"], 0, -0.35, 0, pai=carro); caixa("ventosas", 0.4, 0.03, 0.3, M["escuro"], 0, -0.66, 0, pai=carro)
lampada("destacker", gx + 0.5, 2.16, 0.8)
mags = []
for k, mg in enumerate(D["magazines"]):
    o = caixa("EST_Destacker_Mag_" + "AB"[k % 2], 0.42, 1.0, 0.33, M["chapa"], mg["x"], 0.8, mg["z"], chanfro=0.004); o.color = (0.82, 0.85, 0.88, 1); mags.append(o)

# ---------------------------------------------------------------- saída: esteira, mesa, operadora, caixas
S = L["saida"]; x0, xe = S["esteira_x0"], S["esteira_x1"]
caixa("EST_Saida_Esteira", xe - x0, 0.06, 0.5, M["esteira"], (x0 + xe) / 2, YT - 0.03, 0)
pes = []; xx = x0 + 0.2
while xx < xe: pes += [(0.04, YT - 0.06, 0.04, xx, (YT - 0.06) / 2, sz * 0.22) for sz in (-1, 1)]; xx += 0.8
objeto("EST_Saida_Esteira_pes", malha_caixas("pes", pes), M["escuro"], (0, 0, 0))
mx = S["mesa_x"]; caixa("EST_Saida_Mesa", 1.2, 0.05, 0.9, M["claro"], mx, 0.85, 0)
objeto("EST_Saida_Mesa_pes", malha_caixas("mp", [(0.04, 0.83, 0.04, mx + sx * 0.55, 0.415, sz * 0.4) for sx in (-1, 1) for sz in (-1, 1)]), M["escuro"], (0, 0, 0))
op = vazio("Operadora", mx, 0, -0.75)
cilindro("Operadora_corpo", 0.17, 0.9, M["uniforme"], 0, 0.95, 0, pai=op); cilindro("Operadora_perna_E", 0.06, 0.8, M["escuro"], -0.06, 0.4, 0, pai=op); cilindro("Operadora_perna_D", 0.06, 0.8, M["escuro"], 0.06, 0.4, 0, pai=op)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.12); me = bpy.data.meshes.new("cab"); bm.to_mesh(me); bm.free(); objeto("Operadora_cabeca", me, M["claro"], B(0, 1.55, 0), op, 0)
for i in range(3): caixa("Caixa_%d" % i, 0.5, 0.35, 0.4, M["papelao"], mx - 0.5 + i * 0.55, 0.175, 0.9)
caixa("Cacamba_refugo", 0.5, 0.45, 0.4, M["vermelho"], mx + 0.9, 0.225, 0.75)
lampada("mesa", mx + 0.55, 0.87, -0.35, r=0.05)

# ---------------------------------------------------------------- textos de situação (só um aparece por vez) e título
def texto(nome, corpo, x, y, z, tam, cor=(1, 1, 1)):
    t = bpy.data.curves.new(nome, "FONT"); t.body = corpo; t.size = tam; t.align_x = "CENTER"; t.extrude = 0.004
    o = bpy.data.objects.new(nome, t); col.objects.link(o)
    m = material("Mat_" + nome, cor, 0, 0.4); b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Emission Color"].default_value = (*cor, 1); b.inputs["Emission Strength"].default_value = 1.5
    o.data.materials.append(m); o.location = B(x, y, z); o.rotation_euler = (math.pi / 2, 0, 0); return o
nomes_comp = {}
for pz in dados["prensas"]: nomes_comp[pz["id"]] = pz["nome"].split(" — ")[0]
nomes_comp[T["id"]] = "Transfer"; nomes_comp[D["id"]] = "Destacker"
COR = {"produzindo": hexcor("2a78d6"), "faltou": hexcor("eb6834"), "quebrada": hexcor("eda100"), "troca": hexcor("e87ba4"), "parada": hexcor("5d5f63"), "botoeira": hexcor("d93025")}
def rotulo(q):
    s = q["situacao"]
    return {"produzindo": ("PRODUZINDO", "produzindo"), "enchendo": ("ENCHENDO A LINHA", "produzindo"), "esvaziando": ("ESVAZIANDO PARA A TROCA", "troca"),
            "quebrada": ("QUEBRA: " + nomes_comp.get(q["comp"], "máquina"), "quebrada"), "botoeira": ("BOTOEIRA — peça com defeito", "botoeira"),
            "troca": ("TROCA DE FERRAMENTA", "troca"), "faltou": ("FALTOU BLANK", "faltou")}.get(s, (s.upper(), "parada"))
textos = {}
xc = (gx + mx) / 2
# todas as situações já existem na cena (o modo ao vivo do Blender usa as mesmas): uma aparece por vez
todas = [{"situacao": s_, "comp": None} for s_ in ("produzindo", "enchendo", "esvaziando", "botoeira", "troca", "faltou")] + [{"situacao": "quebrada", "comp": k} for k in nomes_comp]
for q in todas + QUADROS:
    txt, cor = rotulo(q)
    if txt not in textos:
        textos[txt] = texto("Situacao_" + str(len(textos)), txt, xc, 4.0, 0, 0.42, COR[cor]); textos[txt]["rotulo"] = txt
        if q["situacao"] == "quebrada": textos[txt]["comp"] = q["comp"]
        textos[txt]["situacao"] = q["situacao"]
titulo = dados["linha"].replace(" (FICTÍCIA)", "") + ("  ·  FICTÍCIA" if dados.get("ficticia") else "")
texto("Titulo", titulo, xc, 4.65, 0, 0.3)
texto("Ciclo", "ciclo do transfer %.3f s  ·  %.2f golpes/min  ·  quem segura: %s" % (dados["ciclo_s"], dados["golpes_por_minuto"], dados["segura"]), xc, 3.6, 0, 0.17, (0.8, 0.8, 0.8))

# ---------------------------------------------------------------- peças (um conjunto fixo de objetos reaproveitados)
max_pecas = max((len(q["pecas"]) for q in QUADROS), default=0)
me_peca = malha_caixas("peca", [(L["peca"]["comprimento"], L["peca"]["espessura"], L["peca"]["largura"], 0, 0, 0)])
pecas_obj = [objeto("Peca_%02d" % (i + 1), me_peca, M["chapa"], (0, 0, -5), chanfro=0) for i in range(max_pecas)]

# ---------------------------------------------------------------- animação (keyframes direto nas curvas: rápido)
nq = len(QUADROS)
cena.render.fps = dados["fps"]; cena.frame_start = 1; cena.frame_end = max(1, nq)
def animar(obj, caminho, indice, valores, constante=False):
    if obj.animation_data is None: obj.animation_data_create()
    ad = obj.animation_data
    if ad.action is None:
        a = bpy.data.actions.new(obj.name + "_anim"); s = a.slots.new(id_type="OBJECT", name=obj.name); ad.action = a; ad.action_slot = s
    cb = anim_utils.action_ensure_channelbag_for_slot(ad.action, ad.action_slot)
    fc = cb.fcurves.new(caminho, index=indice); fc.keyframe_points.add(len(valores))
    co = [0.0] * (2 * len(valores))
    for i, v in enumerate(valores): co[2 * i] = i + 1; co[2 * i + 1] = v
    fc.keyframe_points.foreach_set("co", co)
    fc.keyframe_points.foreach_set("interpolation", [0 if constante else 1] * len(valores))   # 0 = constante, 1 = linear
    fc.update()
# barras: X e Y
for b in barras:
    animar(b, "location", 0, [q["barra"]["x"] for q in QUADROS])
    animar(b, "location", 1, [-b["lado"] * q["barra"]["z"] for q in QUADROS])
    animar(b, "location", 2, [YT + 0.02] * nq)
# martelos e volantes
for k, pz in enumerate(dados["prensas"]):
    pr = prensas[pz["id"]]
    animar(pr["martelo"], "location", 2, [pr["y_pmi"] + q["martelos"][k] for q in QUADROS])
    vol = [q["volantes"][k] for q in QUADROS]; acc, ant, cont = [], vol[0], 0.0      # desenrola o giro (sem pular de 360 para 0)
    for v in vol: d = (v - ant) % 360; cont += d; ant = v; acc.append(math.radians(vol[0] + cont))
    animar(pr["volante"], "rotation_euler", 1, acc)     # gira em volta do próprio eixo
# carro do destacker e pilhas
cx_, cy_, cz_ = zip(*[B(q["carro"]["x"], q["carro"]["y"], q["carro"]["z"]) for q in QUADROS])
for i, v in enumerate((cx_, cy_, cz_)): animar(carro, "location", i, list(v))
for k, m in enumerate(mags):
    h = [0.02 + 1.0 * (q["pilhas"][k] if k < len(q["pilhas"]) else 1) for q in QUADROS]
    animar(m, "scale", 2, h); animar(m, "location", 2, [0.3 + x / 2 for x in h])
# peças: cada peça ganha um objeto enquanto aparece
vaga = {}; livres = list(range(max_pecas)); pos = [[None] * nq for _ in range(max_pecas)]
for f, q in enumerate(QUADROS):
    vistos = set()
    for (pid, x, y, z, ruim) in q["pecas"]:
        if pid not in vaga: vaga[pid] = livres.pop(0)
        pos[vaga[pid]][f] = (x, y, z, ruim); vistos.add(pid)
    for pid in [p for p in vaga if p not in vistos]: livres.append(vaga.pop(pid))
for i, o in enumerate(pecas_obj):
    seq = pos[i]; ult = (0, -5, 0, 0)
    loc = [];  esc = []; cor = []
    for s_ in seq:
        if s_ is None: loc.append(B(ult[0], -5, 0)); esc.append(0.0); cor.append(0.85)
        else: ult = s_; loc.append(B(s_[0], s_[1], s_[2])); esc.append(1.0); cor.append(1.0 if not s_[3] else 2.0)
    for j in range(3): animar(o, "location", j, [l[j] for l in loc])
    for j in range(3): animar(o, "scale", j, esc, constante=True)
    animar(o, "color", 0, [0.86 if c < 2 else 0.85 for c in cor], True); animar(o, "color", 1, [0.88 if c < 2 else 0.05 for c in cor], True); animar(o, "color", 2, [0.9 if c < 2 else 0.04 for c in cor], True)
# luzes de estado e texto da situação
def estado_luz(q, chave):
    s = q["situacao"]; todas = "produzindo" if s in ("produzindo", "enchendo", "esvaziando") else ("troca" if s in ("troca",) else "parada")
    if s == "esvaziando": todas = "produzindo"
    if s == "quebrada" and q["comp"] and (q["comp"] == chave or (chave == "transfer" and q["comp"] == T["id"]) or (chave == "destacker" and q["comp"] == D["id"])): return "quebrada"
    if chave == "mesa": return "botoeira" if s == "botoeira" else "produzindo"
    if chave == "destacker" and s == "faltou": return "faltou"
    return todas
for chave, l in luzes.items():
    cores = [COR[estado_luz(q, chave)] for q in QUADROS]
    for j in range(3): animar(l, "color", j, [c[j] for c in cores], True)
for txt, o in textos.items():
    vis = [1.0 if rotulo(q)[0] == txt else 0.0 for q in QUADROS]
    for j in range(3): animar(o, "scale", j, vis, True)

# ---------------------------------------------------------------- luz, mundo e câmera
mundo = bpy.data.worlds.new("Mundo"); cena.world = mundo
try: mundo.use_nodes = True
except Exception: pass
bg = mundo.node_tree.nodes.get("Background")
if bg: bg.inputs[0].default_value = (0.08, 0.085, 0.095, 1); bg.inputs[1].default_value = 0.9
def luz(nome, tipo, energia, loc, rot=(0, 0, 0), tam=None):
    d = bpy.data.lights.new(nome, tipo); d.energy = energia
    if tam and tipo == "AREA": d.size = tam
    o = bpy.data.objects.new(nome, d); col.objects.link(o); o.location = loc; o.rotation_euler = rot; return o
luz("Sol", "SUN", 3.0, (0, 0, 20), (math.radians(50), 0, math.radians(30)))
for i, xx in enumerate((gx, xc, mx)): luz("Luz_teto_%d" % i, "AREA", 900, (xx, -1.5, 7), tam=6)
alvo = vazio("Alvo_camera", 0, 0, 0)
cam_d = bpy.data.cameras.new("Camera"); cam_d.lens = 30; cam = bpy.data.objects.new("Camera", cam_d); col.objects.link(cam); cena.camera = cam
tr = cam.constraints.new("TRACK_TO"); tr.target = alvo
comprimento = mx - gx + 2
if CAMERA == "prensa":
    seg = next((p for p in L["posicoes"] if p["tipo"] == "prensa"), None); alvo.location = B(seg["x"] + 0.3, 1.1, 0); cam.location = B(seg["x"] + 2.4, 2.1, 4.8)
elif CAMERA == "destacker":
    alvo.location = B(gx + 1.0, 1.0, 0); cam.location = B(gx + 3.0, 2.8, 5.2)
else:                                   # enquadra a linha inteira, do destacker à mesa
    alvo.location = B(xc, 1.4, 0.4)
    hfov = 2 * math.atan(18 / cam_d.lens) if RES[0] >= RES[1] else 2 * math.atan(18 / cam_d.lens * RES[0] / RES[1])
    dist = (comprimento / 2) / math.tan(hfov / 2) * 1.02
    d = (-0.1, 0.5, 0.82); n = math.sqrt(sum(v * v for v in d)); d = [v / n for v in d]
    cam.location = B(xc + d[0] * dist, 1.4 + d[1] * dist, 0.4 + d[2] * dist)

# guarda o que o modo ao vivo precisa saber sobre a cena
cena["simulador"] = json.dumps({"prensas": [p["id"] for p in dados["prensas"]], "transfer": T["id"], "destacker": D["id"], "saida": S["id"], "y_trab": YT})

# ---------------------------------------------------------------- render
r = cena.render
r.engine = "BLENDER_EEVEE"; r.resolution_x, r.resolution_y = RES; r.resolution_percentage = 100
try: cena.eevee.taa_render_samples = AMOSTRAS
except Exception: pass
try: cena.view_settings.view_transform = "AgX"
except Exception: pass
if BLEND:
    os.makedirs(os.path.dirname(os.path.abspath(BLEND)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND)); print("Cena gravada:", BLEND)
if FBX:
    os.makedirs(os.path.dirname(os.path.abspath(FBX)), exist_ok=True)
    for o in bpy.data.objects: o.select_set(o.type in ("MESH", "EMPTY") and not o.name.startswith(("Piso", "Faixa")))
    bpy.ops.export_scene.fbx(filepath=os.path.abspath(FBX), use_selection=True, object_types={"MESH", "EMPTY"}, use_mesh_modifiers=True,
                             apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS", axis_forward="X", axis_up="Z",
                             bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=True, bake_anim_simplify_factor=0.0, add_leaf_bones=False)
    print("FBX para o Unreal:", FBX)
if FOTO:
    cena.frame_set(int(arg("--quadro-foto", "1"))); r.filepath = os.path.abspath(FOTO)
    r.image_settings.file_format = "PNG"; bpy.ops.render.render(write_still=True); print("Foto:", FOTO)
if VIDEO:
    r.filepath = os.path.abspath(VIDEO)
    if hasattr(r.image_settings, "media_type"): r.image_settings.media_type = "VIDEO"
    r.image_settings.file_format = "FFMPEG"; r.ffmpeg.format = "MPEG4"; r.ffmpeg.codec = "H264"; r.ffmpeg.constant_rate_factor = "HIGH"
    print("Gerando o vídeo (%d quadros)..." % nq); bpy.ops.render.render(animation=True); print("Vídeo:", VIDEO)
print("Pronto:", nq, "quadros,", max_pecas, "peças, ", len(textos), "situações")
