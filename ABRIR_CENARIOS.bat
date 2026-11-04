@echo off
chcp 65001 >nul
rem Simulador de Linha - cenarios A x B (etapa E5): A = a linha como esta, B = o que voce mudar, lado a lado.
rem Uso: duplo clique (abre a Linha T) ou arraste um arquivo da linha (.json) em cima deste .bat.
cd /d "%~dp0"
set "ARQ=%~1"
if "%ARQ%"=="" set "ARQ=modelos\linha_T_transfer_FICTICIA.json"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
echo Abrindo os cenarios A x B com: %ARQ%
node ferramentas\servidor.mjs "%ARQ%" --cenarios
pause
