@echo off
chcp 65001 >nul
rem Simulador de Linha - formulario do APONTAMENTO REAL (etapa E6, validacao). Precisa do Node.js.
rem Os dados reais ficam SO na pasta privado deste PC: nunca vao para video, demonstracao ou pacote.
rem No formulario: preencha os turnos e as paradas, Salvar, depois "Validar com o simulador".
rem Os tempos reais da linha: escolha "Linha real" na lista de arquivos do mesmo formulario.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
echo Abrindo o apontamento real (PRIVADO). Ao salvar por cima, a versao anterior vai para _reprovados\privado.
node ferramentas\servidor.mjs privado\apontamento_real.json --formulario
pause
