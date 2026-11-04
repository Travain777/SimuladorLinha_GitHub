@echo off
chcp 65001 >nul
rem Simulador de Linha - compara a ULTIMA gravacao da ponte do CLP (pasta registros, so leitura) com o simulador (etapa E6).
rem Ou arraste uma gravacao (.jsonl) em cima deste .bat. A linha comparada e a do mapa de sinais que gravou.
rem Teste sem maquina: arraste conferencia\gravacao_TESTE_ficticia.jsonl.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
set GR=%~1
if "%GR%"=="" set GR=ultima
node ferramentas\validar.mjs --gravacao "%GR%"
pause
