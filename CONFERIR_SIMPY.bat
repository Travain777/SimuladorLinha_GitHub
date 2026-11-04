@echo off
chcp 65001 >nul
rem Simulador de Linha - compara os motores com os modelos independentes em SimPy (40 sementes por cenario).
rem Precisa: pip install simpy. Leva uns 4 minutos.
cd /d "%~dp0"
set "PY=py -3"
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
%PY% conferencia\comparar.py modelos\linha_A_prensas_FICTICIA.json 40 conferencia\conferencia_linha_A.txt
%PY% conferencia\comparar.py conferencia\linha_A_variante_1mag_1rack.json 40 conferencia\conferencia_variante.txt
%PY% conferencia\comparar_transfer.py modelos\linha_T_transfer_FICTICIA.json 40 conferencia\conferencia_linha_T.txt
%PY% conferencia\comparar_transfer.py conferencia\linha_T_variante_1mag.json 40 conferencia\conferencia_linha_T_variante.txt
echo.
pause
