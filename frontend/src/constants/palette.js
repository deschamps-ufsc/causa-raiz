// Paleta expandida — espectro completo, 15 colunas × 6 linhas
// Coluna 0 = Tons de Cinza. Colunas 1-14 = espectro cromático.
// Linha 0 = cor base (mais forte); linhas 1-5 = tints progressivos.
// Tint: round(ch + (255-ch)*f), fatores: 0.2, 0.4, 0.6, 0.8, 0.90
export const EXCEL_THEME = [
  // Tons de Cinza (Preto no topo)
  ['#000000','#333333','#666666','#999999','#CCCCCC','#F2F2F2'],
  // Vermelho Escuro  #C62828  (198,40,40)
  ['#C62828','#D15353','#DD7E7E','#E8A9A9','#F4D4D4','#F9E9E9'],
  // Vermelho Vivo    #E53935  (229,57,53)
  ['#E53935','#EA605D','#F08887','#F5AFAE','#FAD7D6','#FCEAEA'],
  // Rosa-Magenta     #D81B60  (216,27,96)
  ['#D81B60','#E04880','#E8769F','#F0A3BF','#F7D1DE','#FBE8EF'],
  // Laranja          #EF6C00  (239,108,0)
  ['#EF6C00','#F28A33','#F6A866','#F9C599','#FCE2CC','#FEF0E5'],
  // Ambar            #F9A825  (249,168,37)
  ['#F9A825','#FAB851','#FBCB7C','#FCDDA8','#FDEFD4','#FEF7EA'],
  // Amarelo          #F9CC00  (249,204,0)
  ['#F9CC00','#FAD633','#FBE066','#FCEAA9','#FDF5CC','#FEFAE5'],
  // Verde-Limao      #7CB342  (124,179,66)
  ['#7CB342','#96C267','#B1D18D','#CBE0B3','#E4EFD8','#F1F7ED'],
  // Verde            #2E7D32  (46,125,50)
  ['#2E7D32','#58975B','#83B185','#ADCBAF','#D6E4D7','#EAF1EB'],
  // Teal             #00695C  (0,105,92)
  ['#00695C','#33877D','#66A59E','#99C3BF','#CCE1DF','#E5F0EE'],
  // Ciano            #00838F  (0,131,143)
  ['#00838F','#339BA5','#66B3BB','#99CBD1','#CCE2E6','#E5F0F1'],
  // Azul Claro       #0277BD  (2,119,189)
  ['#0277BD','#3492CA','#68ADD7','#9AC8E4','#CCE3F1','#E5F0F7'],
  // Azul             #1565C0  (21,101,192)
  ['#1565C0','#4383CC','#71A2D9','#9EC1E6','#CCE0F2','#E5EFF7'],
  // Indigo           #283593  (40,53,147)
  ['#283593','#535DA8','#7F87BE','#AAB1D4','#D4D6EA','#E9EAF4'],
  // Roxo             #6A1B9A  (106,27,154)
  ['#6A1B9A','#8748AE','#A576C3','#C2A3D7','#DFD1EB','#EEE7F5'],
]

// Sequência de cores para auto-atribuição às séries
export const COLORS = [
  '#C62828','#EF6C00','#F9A825','#F9CC00','#7CB342','#2E7D32',
  '#00695C','#0277BD','#1565C0','#283593','#6A1B9A','#D81B60',
  '#E53935','#00838F','#F9A825','#4472C4',
]

// Opções de espessura de linha
export const LINE_WIDTHS = [1, 1.5, 2.5, 3.5, 5]
export const DEFAULT_LINE_WIDTH = 1.5

// Opções de estilo de linha
export const LINE_DASHES = [
  { id: 'solid', label: 'Contínua',   dashArray: 'none' },
  { id: 'dash',  label: 'Tracejada',  dashArray: '4, 3' },
  { id: 'dot',   label: 'Pontilhada', dashArray: '2, 2' },
]
export const DEFAULT_LINE_DASH = 'solid'
