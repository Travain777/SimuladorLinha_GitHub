@echo off
chcp 65001 >nul
rem Simulador de Linha - gera no Blender 5.1 a cena da Linha T com a animacao do simulador (etapa S6):
rem   blender\linha_T_cena_<data>.blend  (cena animada, para abrir no Blender)
rem   videos\linha_T_<data>.mp4           (video EEVEE 1920x1080)
rem   unreal\linha_T_<data>.fbx           (cena animada para importar no Unreal 4.27)
rem Os numeros vem SO do simulador. Nenhum arquivo seu do Blender e aberto ou alterado.
rem Ajuste aqui: DURACAO (segundos de video) e VEL (1 = tempo real, 0.25 = camera lenta).
cd /d "%~dp0"
set "BLENDER=C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
set "LINHA=%~1"
if "%LINHA%"=="" set "LINHA=modelos\linha_T_transfer_FICTICIA.json"
set "DURACAO=40"
set "VEL=1"
if not exist "%BLENDER%" (
  echo Nao achei o Blender em "%BLENDER%". Abra este .bat no Bloco de Notas e corrija a linha set "BLENDER=...".
  pause
  exit /b 1
)
for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "QUANDO=%%a"
if not exist videos mkdir videos
if not exist unreal mkdir unreal
echo 1/2 Exportando a animacao do simulador...
node ferramentas\exportar_animacao.mjs "%LINHA%" --duracao %DURACAO% --vel %VEL% --saida "blender\linha_T_animacao_%QUANDO%.json"
if errorlevel 1 ( pause & exit /b 1 )
echo 2/2 Montando a cena no Blender e gerando o video (pode levar alguns minutos)...
"%BLENDER%" --background --factory-startup --python blender\linha_transfer_blender.py -- --animacao "blender\linha_T_animacao_%QUANDO%.json" --blend "blender\linha_T_cena_%QUANDO%.blend" --fbx "unreal\linha_T_%QUANDO%.fbx" --video "videos\linha_T_%QUANDO%.mp4"
echo.
echo Pronto: videos\linha_T_%QUANDO%.mp4 · blender\linha_T_cena_%QUANDO%.blend · unreal\linha_T_%QUANDO%.fbx
start "" "videos"
pause
