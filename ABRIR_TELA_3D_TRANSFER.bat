@echo off
chcp 65001 >nul
rem Simulador de Linha - abre a LINHA TRANSFER em 3D (etapa S4): eixos X e Y, martelos pelo angulo, paradas da simulacao.
rem Uso: duplo clique (abre a Linha T ficticia) ou arraste um arquivo de linha transfer (.json) em cima deste .bat.
cd /d "%~dp0"
set "ARQ=%~1"
if "%ARQ%"=="" set "ARQ=modelos\linha_T_transfer_FICTICIA.json"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
echo Abrindo a linha transfer em 3D com: %ARQ%
node ferramentas\servidor.mjs "%ARQ%"
pause
