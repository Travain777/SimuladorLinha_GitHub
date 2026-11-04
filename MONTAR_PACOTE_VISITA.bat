@echo off
chcp 65001 >nul
rem Simulador de Linha - monta o PACOTE DE VISITA (etapa E8) numa pasta NOVA ao lado desta: SimuladorLinha_Visita (_2, _3...).
rem So entram as linhas ficticias, os motores, as telas e os .bat da demonstracao. NUNCA entram privado, registros nem _reprovados.
rem Confere nomes proibidos e enderecos de internet. Depois: abra ABRIR_DEMONSTRACAO.bat dentro da pasta nova.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js. Instale o Node.js LTS e rode de novo.
  pause
  exit /b 1
)
node ferramentas\montar_pacote_visita.mjs
pause
