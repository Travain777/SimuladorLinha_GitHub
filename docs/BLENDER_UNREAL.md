# Blender e Unreal — a Linha T com os tempos do simulador (etapa S6, 04/11/2026)

**Princípio:** os números saem só do simulador. O Blender e o Unreal só mostram — o mesmo ciclo (3,345 s na Linha T), a Prensa 1 chegando por último ao PMS,
as mesmas paradas. A cena é a **Linha T genérica (fictícia)**, com os mesmos nomes do simulador (`EST_Prensa_1`, `EST_Transfer_Barra_Frente`…),
própria para vídeo no LinkedIn. O seu `PRENSAS TRANSFER1.blend` (parecido com a linha real) **não é aberto nem alterado**; fica para uso interno, se quiser.

## 1. Vídeo e cena no Blender — `GERAR_VIDEO_BLENDER.bat`
1. O simulador exporta a animação quadro a quadro (`ferramentas/exportar_animacao.mjs`, 30 quadros/s): eixos X e Y, altura de cada martelo pelo ângulo,
   volantes, peças, carro do destacker, pilhas dos magazines e a situação da linha.
2. O Blender 5.1 (`blender/linha_transfer_blender.py`, sem abrir janela) monta a cena, aplica a animação e grava:
   - `blender\linha_T_cena_<data>.blend` — a cena animada (abre no Blender e toca na linha do tempo);
   - `videos\linha_T_<data>.mp4` — vídeo EEVEE 1920×1080;
   - `unreal\linha_T_<data>.fbx` — a cena animada para o Unreal.
3. Ajustes no próprio .bat: `DURACAO` (segundos de vídeo), `VEL` (1 = tempo real; 0,25 = câmera lenta) e o caminho do Blender
   (`C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`).
4. Outras câmeras: `--camera prensa` ou `--camera destacker` na linha do Blender dentro do .bat.

## 2. Blender ao vivo — `BLENDER_AO_VIVO.bat`
- Abre a última cena gerada e roda `blender/blender_ao_vivo.py`: o Blender lê o servidor do simulador ~20 vezes por segundo
  (`/api/ao-vivo/cena`) e mexe barras, martelos, volantes, pilhas, luzes de estado e a faixa da situação.
- A fonte é o CLP pela ponte da S5 (**só leitura**). Para testar: `ABRIR_CLP_DE_MENTIRA.bat` antes.
- O mapa de sinais usado está no começo do script (`MAPA = "modelos/linha_T_sinais_modbus.json"`). Para parar: rode o script de novo (Text Editor → Run Script);
  a animação gravada volta.
- No ao vivo não aparecem as peças (o CLP não informa peça por peça).

## 3. Unreal 4.27 — gravado (FBX)
1. Crie um projeto novo (sugestão: `E:\SimuladorLinhaUE`, em branco) — para não misturar com o Fabrica3Game.
2. Crie a pasta `Content/SimuladorLinha` e um mapa vazio `LinhaT` nela.
3. **File → Import Into Level…** → escolha `unreal\linha_T_<data>.fbx` → em *Scene Import Options* deixe **Create Level Actors** e importe.
   Os atores ficam com os nomes do simulador.
4. Para tocar a animação: crie um **Level Sequence**, arraste os atores para ele e, com o botão direito na lista de atores, **Import…** o mesmo FBX
   (o Sequencer liga a animação pelos nomes). Play.
5. Luzes de estado e textos não vão no FBX: no gravado eles ficam só no vídeo do Blender.

## 4. Unreal 4.27 — ao vivo (Remote Control API) — `UNREAL_AO_VIVO.bat`
1. No Unreal: **Edit → Plugins → Remote Control API** → ligar → reiniciar o editor. Ele abre o servidor em `http://localhost:30010`.
2. Deixe o mapa `LinhaT` aberto, com os atores importados do FBX.
3. `UNREAL_AO_VIVO.bat`: `ferramentas/ponte_unreal.mjs` manda as posições (barras, martelos, carro, pilhas) ~20 vezes por segundo, num pacote só (`/remote/batch`).
   `FONTE=simulacao` reproduz a simulação em tempo real; `FONTE=clp` usa o que a ponte da S5 lê do CLP.
4. Configuração em `blender/unreal_ponte.json`: endereço do Unreal, caminho do mapa (`/Game/SimuladorLinha/LinhaT.LinhaT`) e, se o Unreal der outro nome a algum ator,
   a troca em `atores` (ex.: `"EST_Prensa_1_Martelo": "EST_Prensa_1_Martelo_2"`).
5. `node ferramentas/ponte_unreal.mjs --teste` mostra o primeiro pacote sem mandar nada (para conferir os nomes).

## Conversão de eixos
Simulador: x ao longo da linha, y para cima, z para a frente (metros). Blender: (x, −z, y). Unreal: X = x·100, Y = z·100, Z = y·100 (centímetros).

## O que ainda falta (pendências da S6)
- Rodar no seu PC: o vídeo e a cena foram testados aqui com o Blender 5.1 em modo texto; no Unreal nada pôde ser testado daqui.
- Unreal ao vivo: os nomes internos dos atores e o giro dos volantes precisam ser conferidos depois do import.
- Aparência: materiais e luz simples — fica para o final (E7, vídeos).
