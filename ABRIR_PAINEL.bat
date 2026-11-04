@echo off
chcp 65001 >nul
rem Simulador de Linha - PAINEL: todos os .bat do projeto em botoes, numa pagina so. Precisa do Node.js.
rem As telas abrem no navegador; os botoes de .bat abrem cada .bat numa janela propria (so neste PC).
rem Em qualquer pagina do simulador, a aba "Atalhos" na borda direita leva as outras. Para encerrar: feche esta janela.
cd /d "%~dp0"
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
node ferramentas\servidor.mjs --painel
pause
