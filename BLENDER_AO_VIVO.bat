@echo off
chcp 65001 >nul
rem Simulador de Linha - Blender AO VIVO (etapa S6): abre a ultima cena gerada e o Blender passa a seguir o CLP
rem (pela ponte da S5, SO LEITURA). Para testar sem maquina, abra antes o ABRIR_CLP_DE_MENTIRA.bat.
rem Precisa de uma cena gerada pelo GERAR_VIDEO_BLENDER.bat. Para parar no Blender: rode o script de novo (Text Editor > Run).
cd /d "%~dp0"
set "BLENDER=C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
if not exist "%BLENDER%" ( echo Nao achei o Blender em "%BLENDER%". Corrija a linha set "BLENDER=..." neste .bat. & pause & exit /b 1 )
set "CENA="
for /f "delims=" %%f in ('dir /b /o-d "blender\linha_T_cena_*.blend" 2^>nul') do if not defined CENA set "CENA=blender\%%f"
if not defined CENA ( echo Nenhuma cena ainda. Rode primeiro o GERAR_VIDEO_BLENDER.bat. & pause & exit /b 1 )
echo Abrindo o servidor do simulador (janela separada)...
start "Simulador - servidor" cmd /c "set SEM_NAVEGADOR=1&& node ferramentas\servidor.mjs"
timeout /t 2 >nul
echo Abrindo %CENA% no Blender, ao vivo...
"%BLENDER%" "%CENA%" --python blender\blender_ao_vivo.py
