# Formato do arquivo da linha — `simulador-linha/1`

Etapa E1 do Simulador de Linha (03/11/2026). O cliente preenche a **planilha** (`modelos/Planilha_Linha_MODELO.xlsx`);
o conversor (`ferramentas/planilha_para_json.py`) confere tudo e grava o **arquivo da linha** (JSON), que é o que o simulador lê.
Nada é inventado no caminho: o JSON tem exatamente os números da planilha.

## Partes do arquivo

| Parte | O que guarda |
|---|---|
| `formato` | Sempre `simulador-linha/1` (versão do formato). |
| `origem` | Nome da planilha de onde veio. |
| `linha` | `nome`, `produto`, `pecas_por_golpe`, `demanda_pecas_dia`, `lote_pecas`, `setup_min` (troca de ferramenta), `dias_simulados`, `semente`. |
| `turnos` | Lista: `nome`, `inicio`, `fim` (HH:MM; passa da meia-noite se `fim` < `inicio`), `pausa_min`, `duracao_min`. |
| `estacoes` | Lista na ordem do fluxo (ver abaixo). |
| `abastecimento` | `empilhadeiras`; `entrada` (pilhas de blanks na 1ª estação); `saida` (racks na última). |
| `calculado` | `tempo_disponivel_dia_min`, `takt_s` e `estacoes_mais_lentas_que_o_takt` (aviso rápido, antes de simular). |

### Cada estação
| Campo | Significado |
|---|---|
| `ordem` | 1, 2, 3… sem pular. A 1ª é `alimentacao`, a última é `saida`, as outras `processo`. |
| `id` | Código `EST_...` — o **mesmo nome do objeto no Unreal e no Blender** (etapa E9). |
| `ciclo_s` | `min`, `mais_comum`, `max` em segundos. O simulador sorteia cada ciclo numa distribuição triangular com esses três valores. |
| `paralelas` | Máquinas iguais fazendo a mesma etapa. |
| `estoque_depois` | Peças que cabem até a próxima estação. `0` = ligadas direto (a de trás espera a da frente liberar, como prensas com transfer). |
| `falhas` | `mtbf_min` (tempo médio de trabalho entre falhas) e `mttr_min` (tempo médio de reparo), ou `null` = sem falhas. |
| `refugo_pct` | % de peças ruins que saem desta estação (não seguem para a próxima). |

### Abastecimento
- **Entrada:** `pecas_por_pilha`, `magazines` (1 = a linha para na troca; 2 = troca uma enquanto a outra alimenta), `chegada_empilhadeira_min`, `troca_min`.
- **Saída:** `pecas_por_rack`, `posicoes` (1 ou 2), `chegada_empilhadeira_min`, `troca_min`.
- **`empilhadeiras`:** quantas atendem entrada e saída juntas — com 1, uma troca pode ficar esperando a outra.

## Unidades
Ciclos em **segundos**; falhas, reparos, trocas e pausas em **minutos**; horários `HH:MM`.

## Conferências feitas pelo conversor
Campos obrigatórios, números válidos, `mínimo ≤ mais comum ≤ máximo`, MTBF e MTTR juntos, códigos `EST_` únicos e sem espaço,
ordem 1, 2, 3…, primeira estação de alimentação e última de saída, turnos com pausa menor que o turno, abastecimento completo.
Se houver erro, o conversor lista **aba, linha e o que corrigir** e não grava o arquivo.

---

# Formato da linha transfer — `simulador-linha/2` (etapa S1, 04/11/2026)

Para linhas em que **o CLP do transfer é o mestre** (servo com encoder, ciclo de 360°). O ciclo é calculado pelos movimentos,
não sorteado por máquina: **Y avança → X avança → Y recua → X volta ‖ prensas golpeiam juntas → OK das prensas em PMS**.
O destacker pega o próximo blank enquanto as prensas golpeiam e só troca de magazine quando o atual esvazia.

Dá para preencher de três jeitos, que dão o mesmo arquivo: **formulários** (`ABRIR_FORMULARIOS.bat`), **planilha**
(`modelos/Planilha_Linha_TRANSFER_MODELO.xlsx` + `CONVERTER_PLANILHA.bat`) ou editando o JSON. Exemplo: `modelos/linha_T_transfer_FICTICIA.json`.

| Parte | O que guarda |
|---|---|
| `formato`, `tipo_linha` | `simulador-linha/2` e `transfer`. |
| `linha`, `turnos` | Iguais ao formato /1. |
| `transfer` | `id`, `nome`; `eixo_x` e `eixo_y` com `curso_mm`, `vel_mm_s`, `acel_mm_s2`; `confirmacao_s` (sinal de fim de movimento entre passos); `falhas` (`mtbf_min`, `mttr_min`) ou `null`. |
| `interpress` | `quantidade` (entrada + entre as prensas + saída; 8 prensas = 9) e `observacao`. Os Y de todos andam juntos. |
| `prensas` | Lista na ordem: `id`, `nome`, `capacidade_t`, `spm_volante` (golpes/min do volante; 1 golpe = 1 volta PMS→PMI→PMS), `curso_mm`, `embreagem_s`, `freio_s`, `falhas`, `refugo_pct`. |
| `destacker` | `id`, `nome`, `pega_s` (mín., mais comum, máx.), `troca_magazine_s` (A ↔ B), `falhas`. |
| `abastecimento` | `empilhadeiras` e `entrada` (pilhas dos magazines), como no /1. `saida` = `null` (não há rack: a saída é a esteira). |
| `saida` | `id`, `nome`, `esteira_s`; `operadora`: `tempo_peca_s` (mín., mais comum, máx.), `acha_defeito_pct`, `parada_botoeira_min` (mín., mais comum, máx.). A mesa **nunca** para a linha por estar cheia; a linha só para pela botoeira (peça com defeito) ou por defeito de manutenção. |
| `calculado` | `tempo_disponivel_dia_min`, `takt_s`. O ciclo da linha é calculado pelo motor de sincronismo (etapa S2). |

**Unidades:** cursos em mm, velocidades em mm/s, acelerações em mm/s², tempos de movimento em s; falhas, reparos, trocas e pausas em min.

**Conferência:** a mesma regra vale no formulário, no servidor e no conversor (`motor/formato.js` e `ferramentas/planilha_para_json.py`):
números válidos, `mínimo ≤ mais comum ≤ máximo`, MTBF e MTTR juntos, códigos `EST_` únicos e sem espaço, aviso se os interpress não forem prensas + 1.

**Salvar pelo formulário:** só grava `.json` dentro de `modelos/`. Antes de gravar por cima, a versão anterior vai para
`_reprovados/modelos/<nome>__<data-hora>.json`. Com erro, não grava.
