# Comunicação com o CLP — ponte ao vivo (etapa S5, 04/11/2026)

**O programa SÓ LÊ o CLP.** O código de comunicação não tem nenhuma função de escrita:
- Modbus TCP: só as funções 1 (coils), 2 (entradas discretas), 3 (holding registers) e 4 (input registers). As funções de escrita (5, 6, 15, 16) são recusadas antes de sair do PC.
- SLMP / MC (Mitsubishi, quadro 3E binário): só o comando 0401 (leitura em bloco). Não existe escrita (1401) nem RUN/STOP remoto.
- Conferido em `ferramentas/testes_clp.mjs` (15 casos, no `TESTAR_MOTOR.bat`).

Ligar na linha real **só com autorização da empresa**. Para testar, use o **CLP de mentira** (`ABRIR_CLP_DE_MENTIRA.bat`), que roda a simulação
da Linha T em tempo real e responde em 127.0.0.1 (Modbus porta 5020, SLMP porta 5021). Ele usa outra semente (o sorteio não é o mesmo do modelo)
e pode ficar mais lento que o modelo (`MAIS_LENTO` no .bat) para ver o desvio na Comparação.

## Como usar
1. `ABRIR_CLP_DE_MENTIRA.bat` (ou, na linha real autorizada, nada: o CLP já está lá).
2. `ABRIR_TELA_3D_TRANSFER.bat` → no alto, **Espelho do CLP** ou **Comparação** → escolha o mapa de sinais → **Ligar**.
3. O que a ponte lê vai para `registros/ao_vivo_<data-hora>.jsonl` (uma linha a cada mudança e pelo menos uma por segundo) — para a validação real (E6).

## Mapa de sinais (`simulador-sinais/1`, com formulário em `ABRIR_FORMULARIOS.bat`)
- `conexao`: `protocolo` (modbus | slmp), `endereco_ip`, `porta`, `unidade` (Modbus), `intervalo_ms`, `tempo_max_ms`.
- `linha`: o arquivo da linha que é o modelo (ex.: `modelos/linha_T_transfer_FICTICIA.json`).
- `sinais`: `id`, `nome`, `tipo` (registro | registro32 | bit), `endereco`, `escala`, `unidade`. Endereço vazio = não lê.
  - Modbus: `HR0`, `IR5` (registros), `C0`, `DI3` (bits). SLMP: `D100`, `W1A`, `R10` (palavras), `M10`, `X1F`, `Y20`, `B5` (bits). X, Y, B e W em hexadecimal.
  - `registro32` = dois registros, palavra baixa primeiro. Valor = número lido × escala (ex.: escala 0,1 quando o CLP manda décimos).

| Sinal (`id`) | O que a tela faz com ele |
|---|---|
| `situacao` | 0 produzindo · 1 quebra · 2 botoeira · 3 troca de ferramenta · 4 faltou blank · 5 enchendo · 6 esvaziando — faixa, luzes e Comparação |
| `comp_parada` | máquina quebrada: 1 transfer, 2 destacker, 3 = prensa 1 … — luz amarela nela |
| `angulo_transfer` | ângulo do encoder do transfer (0–360°): move martelos, X e Y quando não há posição; mostrador e carta |
| `passo` | passo do ciclo (1 a 4) |
| `x_mm`, `y_mm` | posição real dos eixos (se existir, a tela usa no lugar da conta pelo ângulo) |
| `golpes` | contador de ciclos completos — ciclo real medido golpe a golpe na Comparação |
| `pecas_saida` | contador de peças que saíram — peças na esteira e peças/hora reais |
| `botoeiras` | contador de paradas pela botoeira |
| `magazine_atual`, `blanks_mag_A`, `blanks_mag_B` | magazine em uso e altura das pilhas |
| `em_ciclo`, `prensa_pms_1…` | transfer em ciclo; prensa em PMS (a que ainda não voltou acende como produzindo) |

## Comparação real × modelo
- **Ciclo médio em produção**: tempo em produção entre o primeiro e o último golpe visto ÷ golpes. Modelo = ciclo médio do sincronismo com a variação do destacker.
  Meta do plano: desvio de até **5%**. Com menos de 20 golpes não dá veredito.
- **Peças por hora e paradas** (% do tempo por motivo) contra o resultado da simulação — só valem com **pelo menos 1 hora** de observação.
- O mesmo registro gravado serve para a E6 (validação real), sem publicar nada.
