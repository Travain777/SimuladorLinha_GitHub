@echo off
chcp 65001 >nul
rem Simulador de Linha - manda as posicoes da Linha T para o Unreal 4.27 ao vivo (etapa S6), pelo plugin Remote Control API.
rem Antes: no Unreal, ligue o plugin "Remote Control API", importe o FBX (veja docs\BLENDER_UNREAL.md) e deixe o mapa aberto.
rem FONTE: simulacao (reproduz a simulacao em tempo real) ou clp (o que a ponte da S5 le do CLP - ligue a ponte antes).
cd /d "%~dp0"
set "FONTE=simulacao"
if "%FONTE%"=="clp" start "Simulador - servidor" cmd /c "set SEM_NAVEGADOR=1&& node ferramentas\servidor.mjs"
node ferramentas\ponte_unreal.mjs --fonte %FONTE%
pause
