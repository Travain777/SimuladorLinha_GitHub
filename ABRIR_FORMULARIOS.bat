@echo off
chcp 65001 >nul
rem Simulador de Linha - abre os formularios para alterar os dados da linha (etapa S1). Precisa do Node.js.
rem Uso: duplo clique (abre a lista da pasta modelos) ou arraste um arquivo da linha (.json) em cima deste .bat.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
echo Abrindo os formularios. Ao salvar por cima, a versao anterior vai para _reprovados\modelos.
node ferramentas\servidor.mjs %1 --formulario
pause
