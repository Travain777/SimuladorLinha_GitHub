@echo off
chcp 65001 >nul
rem Simulador de Linha - arraste a planilha preenchida em cima deste arquivo.
cd /d "%~dp0"
if "%~1"=="" (
  set "PLAN=modelos\Planilha_Linha_MODELO.xlsx"
) else (
  set "PLAN=%~1"
)
for %%F in ("%PLAN%") do set "SAIDA=%%~dpnF.json"
set "PY=py -3"
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
%PY% ferramentas\planilha_para_json.py "%PLAN%" "%SAIDA%"
echo.
pause
