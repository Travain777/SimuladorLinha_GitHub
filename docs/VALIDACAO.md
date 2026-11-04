# Validação com a linha real (etapa E6, 04/11/2026)

**Meta do plano:** diferença de até **5 % em peças por turno**. **Nada é publicado**, e os dados reais só entram com autorização da empresa.

## Onde ficam os dados reais: pasta `privado\`
- `privado\linha_real.json` — os tempos da linha real (o mesmo formulário da linha transfer). Ele começou como cópia da Linha T fictícia, já com o X de 670 mm e o Y de 85 mm que você informou. **O resto precisa ser preenchido.** Enquanto mais da metade dos números for igual à Linha T, o relatório avisa.
- `privado\apontamento_real.json` — os turnos e as paradas.
- `privado\validacao_*.html / .json` — os relatórios.
- A pasta `privado\` (e também `registros\`, com as gravações do CLP) **nunca entra** em vídeo, demonstração nem no pacote de visita (E8).
- Ao salvar por cima, a versão anterior vai para `_reprovados\privado\`.

## Como preencher — `APONTAMENTO_REAL.bat`
**Turnos:** uma linha por turno.
- Código (T1, T2…), data, turno.
- **Tempo trabalhado**: turno menos pausas e refeição.
- **Começou com a linha cheia?**
- Peças boas e refugo.
- **Usar na conta?** Use "não" para um turno fora do normal: ele fica guardado, mas não entra na conta.

**Paradas:** uma linha por parada.
- Turno, motivo (quebra/manutenção, botoeira, faltou blank, troca de ferramenta ou outra), equipamento (transfer, destacker, prensa 1 a 12, outro) e minutos.
- "Começou aos" é opcional. Em branco, o simulador espalha as paradas por igual no turno.
- **Parada que passou de um turno para o outro:** lance em cada turno só a parte dele. No turno seguinte ela começa aos 0 min; se era troca, esse turno começou com a linha vazia.

**Troca de ferramenta:** responda se os minutos apontados contam também esvaziar e encher a linha.
- "sim": da última à primeira peça boa. O simulador desconta esvaziar e encher, que ele mesmo faz.
- "não": só a linha parada trocando.

**Quantidade:** 10 turnos ou mais deixam a comparação firme; com menos de 5 o formulário avisa.

## O que a validação faz — botão "Validar com o simulador" ou `VALIDAR_LINHA_REAL.bat`
1. **Reprodução** — cada turno real é simulado com **as mesmas paradas e trocas** que aconteceram. Nada é sorteado, só a pega do destacker.
   - O que sobra de diferença é do **ciclo do modelo**: prensa mais lenta, eixos, destacker.
   - Sai também o **ciclo real estimado** (ciclo do modelo × peças do simulador ÷ peças reais).
2. **Previsão** — o simulador roda o mesmo tempo dos turnos, sorteando falhas (MTBF/MTTR), refugo e botoeira do arquivo da linha, em 40 sementes.
   - As peças boas reais têm que cair dentro da faixa simulada.
   - A tabela "perdas por motivo" mostra qual perda está fora: quebra, botoeira, troca ou falta de blank.
3. **Gravação do CLP** (`VALIDAR_GRAVACAO_CLP.bat`) — usa o que a ponte da S5 gravou em `registros\`, **só leitura**:
   - mede o ciclo golpe a golpe;
   - reconhece as paradas e as trocas pela "situação";
   - reproduz tudo no simulador e compara as peças que saíram (ou os golpes).

**Como ler o resultado:**
- Reprodução fora da meta → ajuste os **tempos do ciclo** no formulário da linha.
- Reprodução dentro e previsão fora → ajuste **as perdas** (MTBF/MTTR, refugo, lote/troca).
- As duas dentro → o modelo está validado para estes turnos.

## Conferido com dados fictícios — `motor\testes_validacao.mjs` (14 casos, no `TESTAR_MOTOR.bat`)
- **Modelo igual à "linha real"** (12 turnos de uma Linha T simulada com outra semente):
  - reprodução: 0,03 % de diferença;
  - previsão dentro da faixa (+1,3 %);
  - gravação: 0,00 %, com ciclo medido de 3,377 s contra 3,369 s do modelo.
- **"Linha real" com a Prensa 1 a 29 gpm e o modelo dizendo 32:**
  - a reprodução **acusa +5,13 %, fora da meta**, e estima o ciclo real em 3,542 s (o verdadeiro é 3,541 s);
  - a gravação também acusa (+5,14 %).
  - A previsão sozinha deu +4,5 % e não pegaria o erro. **Por isso a reprodução é a prova principal.**
- **Para testar sem dado real:**
  - arraste `conferencia\apontamento_TESTE_ficticio.json` (ou `..._P1_lenta.json`) no `VALIDAR_LINHA_REAL.bat`;
  - arraste `conferencia\gravacao_TESTE_ficticia.jsonl` no `VALIDAR_GRAVACAO_CLP.bat`.

## Limites
- A reprodução só é tão boa quanto o apontamento: paradas esquecidas aparecem como "o simulador fez mais peças".
- Num turno que começa no meio do enchimento, o simulador começa com a linha vazia ou cheia; pode sobrar uma diferença pequena nesse turno.
- Sem autorização para ligar no CLP, a validação é só pelo apontamento.
