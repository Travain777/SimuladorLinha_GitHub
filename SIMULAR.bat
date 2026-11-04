@echo off
chcp 65001 >nul
rem Simulador de Linha - arraste o arquivo da linha (.json) em cima deste arquivo.
cd /d "%~dp0"
if "%~1"=="" (
  set "ARQ=modelos\linha_A_prensas_FICTICIA.json"
) else (
  set "ARQ=%~1"
)
for %%F in ("%ARQ%") do set "RES=%%~dpnF_resultado.json"
for %%F in ("%ARQ%") do set "REL=%%~dpnF_relatorio.html"
node motor\rodar.mjs "%ARQ%" "%RES%"
if errorlevel 1 (
  echo Nao consegui rodar. O Node.js esta instalado? (nodejs.org)
) else (
  start "" "%REL%"
)
echo.
pause
