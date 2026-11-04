@echo off
chcp 65001 >nul
rem Simulador de Linha - VALIDACAO com a linha real (etapa E6). Meta: diferenca de ate 5%% em pecas por turno.
rem Duplo clique: valida privado\apontamento_real.json. Ou arraste outro apontamento (.json) em cima deste .bat.
rem O relatorio vai para a pasta privado (tem dados da empresa: nao publicar).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
set AP=%~1
if "%AP%"=="" set AP=privado\apontamento_real.json
node ferramentas\validar.mjs "%AP%"
pause
