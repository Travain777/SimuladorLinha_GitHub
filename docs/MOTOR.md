# Motor de eventos — como ele enxerga a linha (etapas E2 e E3, 03/11/2026)

Arquivo: `motor/simulador.js` (JavaScript sem bibliotecas — roda no navegador, junto com o 3D, e no Node para testes).
O motor lê o arquivo da linha (`simulador-linha/1`) e avança o tempo de evento em evento: começo de ciclo, fim de ciclo,
falha, reparo, fim de lote, troca de ferramenta, pedido e chegada da empilhadeira.

## Regras do modelo
| Assunto | Como é simulado |
|---|---|
| Unidade | O **golpe** (um blank). Peças = golpes × peças por golpe. |
| Ciclo | Sorteado em distribuição **triangular** (mínimo, mais comum, máximo). |
| Estoque entre estações | `estoque_depois` golpes. Com **0**, a estação de trás fica **bloqueada** segurando a peça até a da frente pegar (como prensas com transfer). |
| Falhas | Pelo **tempo trabalhado**: tempo até a falha e tempo de reparo sorteados com média MTBF e MTTR (distribuição exponencial). A peça do ciclo continua depois do reparo. Reparo começa na hora (sem fila de manutentores). |
| Refugo | No fim do ciclo, cada peça tem a chance `refugo_pct` de sair como ruim. |
| Troca de ferramenta | Quando a 1ª estação solta o último golpe do lote, a linha **esvazia**; vazia, fica parada `setup_min`; depois começa o lote seguinte. |
| Abastecimento | Pilhas de blanks nos magazines da 1ª estação; racks na última. Cada troca pede uma empilhadeira (fila por ordem de pedido), ocupada durante a chegada + troca. Com **0 empilhadeiras** o abastecimento não é simulado (sempre abastecido). |
| Turnos e pausas | Simula só o **tempo disponível** (turnos − pausas), um dia após o outro; na pausa tudo para junto. |
| Repetível | Sorteio com **semente**: mesma semente → mesmo resultado. |

## Estados de cada máquina (somam 100% do tempo disponível)
**Produzindo** · **Faltou peça** (esperando a de trás; na 1ª estação, sem blank) · **Bloqueada** (peça pronta sem lugar na frente; na última, sem rack) ·
**Quebrada** (falha até o fim do reparo) · **Troca de ferramenta** (esvaziando a linha ou parada na troca).

**Gargalo** = a estação que mais tempo fica produzindo + quebrada (a mais ocupada).

## OEE (etapa E3)
Ciclo ideal de cada estação = **ciclo mínimo** da planilha.
| Parte | Conta |
|---|---|
| Disponibilidade | (tempo planejado − quebrada − troca de ferramenta) ÷ tempo planejado |
| Desempenho | golpes feitos (bons + refugo) × ciclo ideal ÷ tempo operando — falta de peça, bloqueio e ciclo lento entram aqui |
| Qualidade | golpes bons ÷ golpes feitos |
| OEE da estação | disponibilidade × desempenho × qualidade |
| OEE da linha | golpes bons na saída × ciclo ideal da linha ÷ tempo planejado (ciclo ideal da linha = o maior ciclo mínimo ÷ máquinas em paralelo) |

**Perdas em minutos** (somam o tempo planejado): bom, refugo, ciclo acima do ideal, faltou peça, bloqueada, quebrada, troca de ferramenta.

## Relatório
`rodar.mjs` grava `<linha>_resultado.json` e `<linha>_relatorio.html` (abre no navegador sem internet; Ctrl+P → Salvar como PDF):
números principais, tempo de cada estação por estado, OEE por estação, onde o gargalo perde tempo, dados usados e como foi calculado.

## Conferência
1. **Conta à mão** (`motor/testes.mjs`, 14 casos): ciclo fixo, máquina mais lenta manda, disponibilidade MTBF/(MTBF+MTTR), refugo, lote e troca,
   lei de Little, 1 e 2 magazines, média da triangular, máquinas em paralelo, repetibilidade, OEE com quebras e refugo, desempenho
   com ciclo sorteado e perdas somando o tempo planejado. Rodar: `TESTAR_MOTOR.bat`.
2. **Modelo independente em SimPy** (`conferencia/modelo_simpy.py`, escrito do zero em Python): `conferencia/comparar.py` roda as duas
   implementações com 40 sementes cada e compara as médias (vazão, refugo, trocas, empilhadeira, cada estado e o OEE de cada estação).
   Critério: dentro do limite (vazão 1%, estados/OEE 1 ponto) ou dentro do ruído do sorteio (2,5 erros-padrão).
   Resultado de 03/11/2026: **52 de 52** na linha A e **52 de 52** na variante com 1 magazine e 1 rack
   (`conferencia/conferencia_linha_A.txt`, `conferencia/conferencia_variante.txt`).
   A conferência achou e corrigiu um erro de contagem (peça passada direto para a máquina da frente não era contada como feita — afetava só o OEE).

## Limites desta versão
- Fila de manutenção (quando 2 máquinas quebram juntas e só há 1 manutentor) ainda não entra.
- Micro-paradas e troca de bobina não entram (podem ser somadas ao ciclo máximo ou viram campos novos).
- Uma peça por planilha (um produto na linha).

## Registro de eventos para a tela 3D (etapa E4)
Com `simular(arquivo, { registrar: true })` o motor guarda cada acontecimento com o tempo `t` (segundos de produção):
`estado` (máquina mudou de estado), `inicio` (começou o ciclo da peça `un`, duração `dur`), `fila` (peça entrou ou saiu — `sai` — do estoque antes da estação),
`mag` / `pilha_trocada` (blanks no magazine), `rack` / `rack_trocado` (golpes no rack), `empilhadeira` (saiu para o pedido, com `ida_s` e `troca_s`),
`saida`, `refugo`, `falha`, `reparo`, `fim_lote`, `troca_inicio`, `troca_fim`.
Registrar não muda nenhum resultado (os 14 testes continuam iguais). A tela 3D (`tela/`) só desenha o que está no registro.
Um dia da linha A tem cerca de 300 mil eventos (0,6 s para calcular).

## Motor de sincronismo da linha transfer (etapa S2, 04/11/2026) — `motor/sincronismo.js`
O CLP do transfer é o mestre (servo com encoder, 360°). Um ciclo:
1. **Y avança** (fingers de todos os interpress encaixam) + confirmação
2. **X avança** (todas as peças andam uma estação) + confirmação
3. **Y recua** (fingers soltam e saem da ferramenta) + confirmação
4. **Em paralelo:** X volta para zero ‖ as prensas descem e sobem juntas ‖ o destacker põe o próximo blank → vale o **mais demorado** + confirmação

- **Eixo (servo), perfil trapezoidal:** tempo = curso ÷ v + v ÷ a. Se curso < v²/a (não chega em v): tempo = 2·√(curso ÷ a).
- **Golpe da prensa mecânica:** embreagem + 60 ÷ golpes por minuto do volante + freio. Ângulo: 0° na embreagem, 0°→360° na volta, 360° no freio. Altura do martelo ≈ curso/2 × (1 + cos θ).
- **Ciclo** = soma dos 4 passos; **golpes/min** = 60 ÷ ciclo. O passo 4 diz **quem segura a linha** (X volta, golpe da prensa mais lenta ou destacker) e a **folga** dos outros.
- **Próximo limite:** quanto o ciclo cai se o que segura melhorar até o segundo mais demorado (incluindo a segunda prensa mais lenta).
- **Variação do destacker:** com a pega triangular (mín., mais comum, máx.), a conta exata dá em quantos ciclos o destacker atrasa a linha e o ciclo médio.
- **Enchimento:** posições = interpress + prensas; a primeira peça sai depois desse número de ciclos.
- `SIMULAR.bat` com um arquivo `simulador-linha/2` mostra o ciclo e grava `<nome>_relatorio.html` com a **carta de tempos**.
- Conferência: `motor/testes_sincronismo.mjs` — 31 contas à mão, todas certas (também no `TESTAR_MOTOR.bat`).
- Ainda não entram (etapa S3): quebras, troca de ferramenta, magazines/empilhadeira, botoeira da operadora, refugo.

## Simulação da linha transfer (etapa S3, 04/11/2026) — `motor/simulador_transfer.js`
Ciclo a ciclo, com o tempo de cada ciclo do motor de sincronismo (S2) e os acontecimentos da linha:
- **Posições:** interpress e prensas alternados (9 + 8 = 17). Cada "X avança" leva todas as peças uma posição; a da última vai para a esteira. Linha vazia → as primeiras 17 voltas não tiram peça (**enchimento**).
- **Destacker:** põe o blank no passo 4 com pega sorteada (triangular). Magazine vazio → passa para o outro (+ troca A↔B na pega daquele ciclo) e pede a empilhadeira (fila, chegada + troca). Os dois vazios → a linha espera (**faltou blank**).
- **Falhas:** transfer, destacker e cada prensa, pelo tempo trabalhado (MTBF) e reparo sorteado (MTTR). **Qualquer falha para a linha toda.**
- **Lote:** depois do último blank do lote a linha esvazia (sem blank novo), fica parada na troca de ferramenta e enche de novo.
- **Refugo:** no golpe, cada prensa pode estragar a peça (refugo %). A peça ruim segue até a mesa.
- **Saída:** esteira → mesa → operadora (tempo sorteado). A **mesa nunca para a linha**. Peça ruim achada (% que ela acha) → **botoeira** → a linha para (tempo sorteado). Não achada → "defeito que passou".
- **OEE:** ciclo ideal = ciclo do sincronismo com o destacker no mínimo. Disponibilidade = tempo rodando ÷ planejado; desempenho = peças × ciclo ideal ÷ tempo rodando; qualidade = boas ÷ peças. As perdas (bom, troca, quebras, botoeira, faltou blank, ciclo acima do ideal, enchimento, refugo) somam o tempo planejado.
- **Conferência:** `motor/testes_transfer.mjs` — 18 casos com conta à mão (enchimento, lote, falhas, botoeira, magazines, operadora lenta, perdas, OEE), todos dentro do limite.
  `conferencia/modelo_simpy_transfer.py` — modelo independente em SimPy; 40 sementes em cada: linha T 9 de 9 e variante (1 magazine, operadora mais lenta) 9 de 9 comparações dentro do limite.
- **Simplificações (para conferir com a linha real):** a falha acontece no fim do ciclo em que o tempo trabalhado vence; a parada da botoeira começa no início do ciclo seguinte; as prensas golpeiam todo ciclo, mesmo sem peça (enchimento/esvaziamento).

## Reprodução de um turno real (etapa E6)
`simularTransfer(arq, { horas, comecar_cheia, reproducao: { paradas, trocas } })`
- `comecar_cheia: true` — a linha começa com peça nas 17 posições.
- `reproducao.paradas: [{ motivo: "quebrada"|"botoeira"|"faltou_blank"|"outra", comp, min, inicio_min }]`
  - Com `inicio_min`, a parada fica nessa hora.
  - Sem hora, as paradas são espalhadas por igual no turno.
- `reproducao.trocas: [{ setup_min, inicio_min }]` — na hora da troca a linha para de pôr blank, esvazia, troca e enche.
- Com a reprodução ligada, **nada é sorteado** além da pega do destacker: nem quebras, nem refugo, nem botoeira, nem falta de blank.
- Conferido à mão nos casos 14 a 18 de `testes_transfer.mjs`. Exemplos:
  - linha cheia: ciclos = tempo ÷ ciclo;
  - com paradas: (tempo − paradas) ÷ ciclo;
  - começando vazia: menos 17;
  - com troca: (tempo − setup) ÷ ciclo − 17.
- A validação (`motor/validacao.js`) está explicada em `docs/VALIDACAO.md`.
