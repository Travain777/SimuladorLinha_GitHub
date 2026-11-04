# Simulador de Linha

Simulador de linhas de prensas com o **sincronismo real**. Cobre o tempo de cada eixo do transfer, o golpe de cada prensa, as falhas (MTBF/MTTR), a troca de ferramenta, o refugo e a botoeira da operadora, e calcula o OEE.
Roda num PC com Windows, sem internet. Usa só o Node.js e o three.js, que já vem dentro do projeto.
Fase 2 do Projeto Cursos Industriais.

> Todas as linhas e números deste repositório são **fictícios**: a Linha T (transfer de 8 prensas) e a Linha A (prensas em linha).
> Os dados reais da validação ficam só na pasta `privado/`, que nunca sobe (veja `.gitignore`).

## Começar
1. Instale o Node.js LTS.
2. Duplo clique em **`ABRIR_PAINEL.bat`**. O painel reúne todos os .bat em botões, e cada página do simulador tem a aba **Atalhos** para ir às outras.
3. Para conferir os motores, rode o `TESTAR_MOTOR.bat` (100 casos contra a conta feita à mão). O `CONFERIR_SIMPY.bat` compara com um segundo modelo independente e precisa de Python.

## O que tem
| Parte | Onde | O que faz |
| --- | --- | --- |
| Sincronismo (S2) | `motor/sincronismo.js` | Ciclo do transfer: Y avança → X avança → Y recua → X volta enquanto as prensas golpeiam → OK em PMS |
| Simulação transfer (S3) | `motor/simulador_transfer.js` | 17 posições, quebras, lote e troca, refugo, botoeira, empilhadeira, OEE; reprodução de turno real (E6) |
| Linha de estações (E2) | `motor/simulador.js` | Estações com estoques, falhas e empilhadeira |
| Telas | `tela/` | 3D da linha transfer e da Linha A, formulários de todos os dados, cenários A × B, painel |
| Ponte com o CLP (S5) | `ferramentas/clp/`, `ferramentas/servidor.mjs` | Modbus TCP e SLMP (Mitsubishi), **só leitura**; CLP de mentira para testar |
| Blender e Unreal (S6) | `blender/`, `ferramentas/ponte_unreal.mjs` | Cena, vídeo e FBX com os tempos do simulador; Blender e Unreal 4.27 ao vivo |
| Validação (E6) | `motor/validacao.js`, `ferramentas/validar.mjs` | Compara com o apontamento real e com a gravação do CLP; meta ±5% em peças |
| Pacote de visita (E8) | `ferramentas/montar_pacote_visita.mjs` | Pasta para levar ao cliente, um clique, sem internet |

Os detalhes estão em `docs/` (formato da linha, motor, comunicação com o CLP, Blender/Unreal, validação, pacote de visita) e no `LEIA-ME.txt`.

## Regras do projeto
- O programa **só lê** o CLP: não existe função de escrita (NR-12). Ligar numa linha real, só com autorização da empresa.
- Demonstração e vídeo, só com dados fictícios.
- Todo dado tem formulário para alterar. Ao salvar por cima, a versão anterior é guardada.

three.js © its authors, licença MIT (`lib/three/LICENSE.txt`).
