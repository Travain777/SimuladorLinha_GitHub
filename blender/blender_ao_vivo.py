# -*- coding: utf-8 -*-
"""Simulador de Linha — BLENDER AO VIVO (etapa S6, 04/11/2026). Para o Blender 5.1, dentro da cena gerada pelo simulador
(blender/linha_T_cena_*.blend). Lê o servidor do simulador ~20 vezes por segundo e mexe a cena junto:
barras do transfer (X e Y), martelos pelo ângulo, volantes, pilhas, luzes de estado e a faixa da situação.
A fonte é o CLP pela ponte da S5 (SÓ LEITURA) — para testar, o CLP de mentira. O Blender não fala com o CLP: só com o simulador.
Uso: BLENDER_AO_VIVO.bat (ou, no Blender, abrir este arquivo no Text Editor e clicar em Run Script). Rodar de novo = parar."""
import bpy, json, math, urllib.request

SERVIDOR = "http://localhost:8091"
MAPA = "modelos/linha_T_sinais_modbus.json"      # mapa de sinais da S5 (troque por linha_T_sinais_slmp.json para SLMP)
COR = {"produzindo": "2a78d6", "faltou": "eb6834", "quebrada": "eda100", "troca": "e87ba4", "parada": "5d5f63", "botoeira": "d93025"}
def rgb(h): return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (1,)

def pedir(caminho, corpo=None):
    req = urllib.request.Request(SERVIDOR + caminho, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"}, method="POST" if corpo is not None else "GET")
    with urllib.request.urlopen(req, timeout=1.0) as r: return json.loads(r.read().decode("utf-8"))

ESTADO = {"ligado": False}

def aplicar(c):
    ob = bpy.data.objects; info = ESTADO["info"]
    for nome in ("EST_Transfer_Barra_Tras", "EST_Transfer_Barra_Frente"):
        b = ob.get(nome)
        if b: b.location = (c["barra"]["x"], -b["lado"] * c["barra"]["z"], info["y_trab"] + 0.02)
    for m in c["martelos"]:
        mt = ob.get(m["id"] + "_Martelo")
        if mt: mt.location.z = mt["y_pmi"] + m["altura_m"]
    for v in c["volantes"]:
        vo = ob.get(v["id"] + "_Volante")
        if vo: vo.rotation_euler[1] = math.radians(v["graus"])
    for k, letra in enumerate("AB"):
        mg = ob.get("EST_Destacker_Mag_" + letra)
        if mg and k < len(c["pilhas"]): h = 0.02 + c["pilhas"][k]; mg.scale.z = h; mg.location.z = 0.3 + h / 2
    s = c["situacao"]; todas = "produzindo" if s in ("produzindo", "enchendo", "esvaziando") else ("troca" if s == "troca" else "parada")
    for l in ESTADO["luzes"]:
        ch = l["chave"]; est = todas
        if s == "quebrada" and c.get("comp") and (c["comp"] == ch or (ch == "transfer" and c["comp"] == info["transfer"]) or (ch == "destacker" and c["comp"] == info["destacker"])): est = "quebrada"
        elif ch == "mesa": est = "botoeira" if s == "botoeira" else "produzindo"
        elif ch == "destacker" and s == "faltou": est = "faltou"
        l.color = rgb(COR[est])
    for t in ESTADO["textos"]:
        vis = t.get("situacao") == s and (s != "quebrada" or t.get("comp") == c.get("comp"))
        t.scale = (1, 1, 1) if vis else (0, 0, 0)

def status(txt):
    print("Simulador ao vivo:", txt)
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type == "VIEW_3D": a.header_text_set("Simulador ao vivo · " + txt + "   (rode o script de novo para parar)")

def passo():                                     # roda ~20 vezes por segundo (bpy.app.timers)
    if not ESTADO["ligado"]: return None
    try:
        c = pedir("/api/ao-vivo/cena")
        if not c.get("ok"):
            status(c.get("erro", "?") + " — ligando a ponte…")
            try: pedir("/api/ao-vivo/iniciar", {"mapa": MAPA})
            except Exception: pass
            return 1.0
        aplicar(c); ESTADO["n"] += 1
        if ESTADO["n"] % 10 == 0: status("%s · %.0f° · golpes %s" % (c["situacao"], c["grau_transfer"], c.get("golpes")))
    except Exception as e:
        status("sem resposta do servidor do simulador (" + str(e)[:60] + ") — abra o BLENDER_AO_VIVO.bat"); return 2.0
    return 0.05

def ligar():
    info = json.loads(bpy.context.scene.get("simulador", "{}") or "{}")
    if not info: print("Abra a cena gerada pelo simulador (blender/linha_T_cena_*.blend)."); return
    ESTADO.update(ligado=True, info=info, n=0, guardado={},
                  luzes=[o for o in bpy.data.objects if "chave" in o.keys()], textos=[o for o in bpy.data.objects if "rotulo" in o.keys()])
    for o in bpy.data.objects:                   # o ao vivo manda: tira a animação gravada (volta quando parar)
        if o.animation_data and o.animation_data.action: ESTADO["guardado"][o.name] = (o.animation_data.action, o.animation_data.action_slot); o.animation_data.action = None
        if o.name.startswith("Peca_"): o.scale = (0, 0, 0)          # o CLP não diz peça por peça
    try: pedir("/api/ao-vivo/iniciar", {"mapa": MAPA})
    except Exception: pass
    bpy.app.timers.register(passo, first_interval=0.2); status("ligando…")

def desligar():
    ESTADO["ligado"] = False
    for nome, (a, sl) in ESTADO.get("guardado", {}).items():
        o = bpy.data.objects.get(nome)
        if o: o.animation_data.action = a; o.animation_data.action_slot = sl
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type == "VIEW_3D": a.header_text_set(None)
    print("Simulador ao vivo: desligado (a animação gravada voltou).")

if __name__ == "__main__":
    import builtins
    anterior = getattr(builtins, "_simulador_ao_vivo", None)
    if anterior and anterior.get("ligado"):
        ESTADO.update(anterior); desligar(); builtins._simulador_ao_vivo = None     # rodar de novo = parar
    else: ligar(); builtins._simulador_ao_vivo = ESTADO
