@echo off
chcp 65001 >nul
rem Simulador de Linha - abre a tela 3D (etapa E4). Precisa do Node.js (o mesmo do SIMULAR.bat).
rem Uso: duplo clique (abre a linha A fictícia) ou arraste um arquivo da linha (.json) em cima deste .bat.
cd /d "%~dp0"
set "ARQ=%~1"
if "%ARQ%"=="" set "ARQ=modelos\linha_A_prensas_FICTICIA.json"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
echo Abrindo a tela 3D com: %ARQ%
node ferramentas\servidor.mjs "%ARQ%"
pause
