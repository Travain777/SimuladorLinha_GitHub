@echo off
chcp 65001 >nul
rem Simulador de Linha - confere os motores com as contas feitas a mao.
rem 1) eventos (linha de estacoes) 2) sincronismo (S2) 3) simulacao da linha transfer (S3) 4) comunicacao com o CLP, so leitura (S5) 5) validacao com dados ficticios (E6)
cd /d "%~dp0"
node motor\testes.mjs
echo.
node motor\testes_sincronismo.mjs
echo.
echo A simulacao da linha transfer leva uns 15 segundos...
node motor\testes_transfer.mjs
echo.
node ferramentas\testes_clp.mjs
echo.
echo A validacao (E6) leva uns 20 segundos...
node motor\testes_validacao.mjs
echo.
pause
