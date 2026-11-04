# Pacote de visita (etapa E8, 04/11/2026)

**Para que serve:** levar a demonstração no seu PC até o cliente. Abre com um clique, sem internet, com as linhas fictícias prontas.

## Montar — `MONTAR_PACOTE_VISITA.bat`
- Cria uma pasta **nova** ao lado do projeto: `E:\SimuladorLinha_Visita`. Se ela já existir, cria `_2`, `_3`… **Nunca grava por cima.**
- **Entra:**
  - motores, telas, three.js local, ferramentas, documentação, scripts do Blender/Unreal, conferência SimPy e os testes fictícios;
  - de `modelos\`, **só** as linhas fictícias, os mapas do CLP de mentira e as planilhas modelo;
  - os .bat da demonstração.
- **Nunca entra:** `privado\` (dados reais), `registros\` (gravações do CLP), `_reprovados\`, vídeos, cenas e FBX gerados, e os .bat do apontamento real.
- **Os relatórios são gerados na hora, dentro do pacote:**
  - Linha T e Linha A;
  - o exemplo de validação, com faixa azul "EXEMPLO FICTÍCIO".
- **Conferências automáticas antes de terminar** (o resultado fica em `pacote.json`):
  - procura nomes da empresa e marcas reais em todos os arquivos de texto;
  - procura endereços de internet nas telas;
  - procura apontamento que não seja fictício.

## Abrir na visita — `ABRIR_DEMONSTRACAO.bat` (dentro da pasta do pacote)
- Liga o CLP de mentira numa janela minimizada. Ele responde só neste PC (127.0.0.1), só a leituras, e está 5 % mais lento que o modelo para a Comparação mostrar o desvio.
- Abre a **página de entrada**: linha em 3D, ao vivo com o CLP, dados da linha, cenários A × B, relatórios, exemplo de validação e Linha A.
- Precisa do Node.js instalado. Se for levar para um PC sem Node, ponha uma pasta `node` com o `node.exe` dentro da pasta do pacote: o .bat usa ela.
- Para encerrar: feche as janelas pretas.
