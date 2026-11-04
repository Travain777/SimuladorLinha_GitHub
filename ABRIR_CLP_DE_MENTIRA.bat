@echo off
chcp 65001 >nul
rem Simulador de Linha - CLP DE MENTIRA (etapa S5): um "CLP" de teste neste PC (so 127.0.0.1) que roda a Linha T em tempo real
rem e responde Modbus TCP (porta 5020) ou SLMP Mitsubishi (porta 5021). So responde leituras.
rem Uso: duplo clique (Modbus) ou arraste um mapa de sinais (.json) em cima deste .bat.
rem Para a "linha real" ficar 5%% mais lenta que o modelo (ver o desvio na Comparacao): troque MAIS_LENTO abaixo para 5.
cd /d "%~dp0"
set "MAPA=%~1"
if "%MAPA%"=="" set "MAPA=modelos\linha_T_sinais_modbus.json"
set "MAIS_LENTO=0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
node ferramentas\clp_de_mentira.mjs "%MAPA%" --mais-lento %MAIS_LENTO%
pause
