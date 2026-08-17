import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Exporta um elemento HTML (tabela/div) para um arquivo PDF, 
 * com paginação dinâmica baseada no DOM e extração de layout absoluto.
 */
export async function exportTableToPdf(elementRef, filename = 'export.pdf', options = {}) {
  if (!elementRef) return

  try {
    const originalScrollY = window.scrollY
    const originalScrollX = window.scrollX
    window.scrollTo(0, 0)

    // Expandir o container e todos os seus pais para exibir todo o conteúdo sem cortes (clipping)
    const ancestors = []
    if (!options.skipAncestorExpansion) {
      let currentParent = elementRef.parentElement
      while (currentParent) {
        ancestors.push({
          element: currentParent,
          styles: {
            overflow: currentParent.style.overflow,
            overflowX: currentParent.style.overflowX,
            overflowY: currentParent.style.overflowY,
            height: currentParent.style.height,
            maxHeight: currentParent.style.maxHeight
          }
        })
        currentParent.style.overflow = 'visible'
        currentParent.style.overflowX = 'visible'
        currentParent.style.overflowY = 'visible'
        currentParent.style.height = 'auto'
        currentParent.style.maxHeight = 'none'
        currentParent = currentParent.parentElement
      }
    }

    const currentScrollWidth = elementRef.scrollWidth + 'px'

    const originalStyles = {
      position: elementRef.style.position,
      top: elementRef.style.top,
      left: elementRef.style.left,
      zIndex: elementRef.style.zIndex,
      overflow: elementRef.style.overflow,
      height: elementRef.style.height,
      maxHeight: elementRef.style.maxHeight,
      width: elementRef.style.width,
      maxWidth: elementRef.style.maxWidth,
      flex: elementRef.style.flex,
      minHeight: elementRef.style.minHeight,
      background: elementRef.style.background
    }

    // EXTRAÇÃO NUCLEAR: Força o elemento a se comportar como um overlay absoluto gigante 
    // ignorando completamente flexbox, grids, e limites de viewports da tela
    elementRef.style.position = 'absolute'
    elementRef.style.top = '0'
    elementRef.style.left = '0'
    elementRef.style.zIndex = '99999'
    elementRef.style.width = currentScrollWidth
    elementRef.style.background = '#f8fafc'
    elementRef.style.overflow = 'visible'
    elementRef.style.height = 'auto'
    elementRef.style.maxHeight = 'none'
    elementRef.style.maxWidth = 'none'
    elementRef.style.flex = 'none'
    elementRef.style.minHeight = '0'

    const originalElementScrollTop = elementRef.scrollTop
    const originalElementScrollLeft = elementRef.scrollLeft
    elementRef.scrollTop = 0
    elementRef.scrollLeft = 0

    await new Promise(resolve => setTimeout(resolve, 100)) // Tempo extra para reflow absoluto

    let orientation = options.forceOrientation || 'p'
    if (!options.forceOrientation && elementRef.scrollWidth > 900) {
      orientation = 'l'
    }

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = options.margin !== undefined ? options.margin : 0
    const printWidth = pageWidth - (margin * 2)
    const pxToMm = printWidth / elementRef.scrollWidth

    // --- GERAR CABEÇALHO E RODAPÉ DINAMICAMENTE ---
    const headerDiv = document.createElement('div')
    headerDiv.style.width = currentScrollWidth
    headerDiv.innerHTML = `
      <div style="background: #0f172a; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <img src="${window.location.origin}/logo_plataforma_transparent.png" style="height: 48px;" crossorigin="anonymous" />
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -0.01em;">Análise de Desempenho de <span style="color: #f97316;">Usinas Fotovoltaicas</span></span>
            <span style="font-size: 13px; color: #94a3b8; font-weight: 500; margin-top: 2px;">por Fotovoltaica UFSC</span>
          </div>
        </div>
        <div style="background: #1e293b; border: 1px solid #334155; padding: 12px 24px; border-radius: 8px; color: #e2e8f0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🏭</span> Usina: <strong style="color: #fff;">${options.usinaName || 'N/D'}</strong>
        </div>
      </div>
    `
    
    const footerDiv = document.createElement('div')
    footerDiv.style.width = currentScrollWidth
    footerDiv.innerHTML = `
      <div style="background: #ffffff; border-top: 2px solid #f1f5f9; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif;">
        <div style="font-size: 14px; color: #64748b; font-weight: 500;">
          Exportado em: <strong>${new Date().toLocaleString('pt-BR')}</strong>
        </div>
        <div style="font-size: 14px; color: #64748b; font-weight: 600;">
          Plataforma de Análise de Desempenho
        </div>
      </div>
    `

    document.body.appendChild(headerDiv)
    document.body.appendChild(footerDiv)
    const headerCanvas = await html2canvas(headerDiv, { scale: 2, useCORS: true })
    const footerCanvas = await html2canvas(footerDiv, { scale: 2, useCORS: true })
    document.body.removeChild(headerDiv)
    document.body.removeChild(footerDiv)

    const headerImgData = headerCanvas.toDataURL('image/png')
    const footerImgData = footerCanvas.toDataURL('image/png')
    const headerHeight = printWidth * (headerCanvas.height / headerCanvas.width)
    const footerHeight = printWidth * (footerCanvas.height / footerCanvas.width)

    // Selecionar linhas para paginação exata
    const tbodyRows = Array.from(elementRef.querySelectorAll('tbody tr'))

    if (tbodyRows.length > 0) {
      // --- PAGINAÇÃO PERFEITA VIA DOM CHUNKING ---
      
      const rowHeightsPx = tbodyRows.map(r => r.getBoundingClientRect().height)
      const originalDisplays = tbodyRows.map(r => r.style.display)

      tbodyRows.forEach(r => r.style.display = 'none')
      const baseHeightPx = elementRef.getBoundingClientRect().height
      tbodyRows.forEach((r, i) => r.style.display = originalDisplays[i])

      let currentRowIdx = 0
      let pageIndex = 0

      while (currentRowIdx < tbodyRows.length) {
        if (pageIndex > 0) pdf.addPage()

        const isFirstPage = pageIndex === 0
        const currentHeaderHeight = isFirstPage ? headerHeight : 0
        const tableAreaY = margin + currentHeaderHeight

        if (isFirstPage) {
          pdf.addImage(headerImgData, 'PNG', margin, margin, printWidth, headerHeight)
        }

        let remainingRowsHeightPx = 0
        for (let i = currentRowIdx; i < tbodyRows.length; i++) {
          remainingRowsHeightPx += rowHeightsPx[i]
        }

        const availableTableHeightMmWithoutFooter = pageHeight - margin - tableAreaY
        const availableTableHeightMmWithFooter = pageHeight - margin - footerHeight - tableAreaY

        // Sem margem artificial de segurança. Vamos usar 100% do espaço e reescalar a imagem no final se o canvas esticar.
        const safeTableHeightMmWithoutFooter = availableTableHeightMmWithoutFooter
        const safeTableHeightMmWithFooter = availableTableHeightMmWithFooter

        const availableRowsHeightPxWithoutFooter = (safeTableHeightMmWithoutFooter / pxToMm) - baseHeightPx
        const availableRowsHeightPxWithFooter = (safeTableHeightMmWithFooter / pxToMm) - baseHeightPx

        let isLastPage = false
        let availableRowsHeightPx = availableRowsHeightPxWithoutFooter
        let currentAvailableTableHeightMm = availableTableHeightMmWithoutFooter

        if (remainingRowsHeightPx <= availableRowsHeightPxWithFooter) {
          isLastPage = true
          availableRowsHeightPx = availableRowsHeightPxWithFooter
          currentAvailableTableHeightMm = availableTableHeightMmWithFooter
        }

        tbodyRows.forEach(r => r.style.display = 'none')

        let chunkHeightPx = 0
        let rowsShown = 0
        let lastValidBreakPoint = -1

        const rowLevels = tbodyRows.map(r => parseInt(r.getAttribute('data-level') || '2', 10))

        while (currentRowIdx < tbodyRows.length) {
          const rHeight = rowHeightsPx[currentRowIdx]
          const lvl = rowLevels[currentRowIdx]
          const nextLvl = currentRowIdx + 1 < tbodyRows.length ? rowLevels[currentRowIdx + 1] : -1

          // Se for o último tracker antes de começar uma nova stringbox ou inversor,
          // marcamos como o local perfeito para quebrar a página (se precisarmos depois).
          if (lvl === 2 && (nextLvl === 0 || nextLvl === 1)) {
            lastValidBreakPoint = currentRowIdx
          }

          if (rowsShown > 0 && chunkHeightPx + rHeight > availableRowsHeightPx) {
            // O espaço acabou! Vamos tentar a Quebra Inteligente
            if (lastValidBreakPoint !== -1 && lastValidBreakPoint < currentRowIdx) {
               let heightToRollback = 0
               for (let j = lastValidBreakPoint + 1; j < currentRowIdx; j++) {
                  heightToRollback += rowHeightsPx[j]
               }
               
               // Se a stringbox atual que está sendo cortada não for absurdamente gigante (menor que 800px)
               // E se retroceder não esvaziar demais a página atual (garantindo pelo menos 300px impressos)
               if (heightToRollback < 800 && (chunkHeightPx - heightToRollback) > 300) {
                  // Esconde novamente a stringbox que ia ficar fatiada pela metade
                  for (let j = lastValidBreakPoint + 1; j < currentRowIdx; j++) {
                     tbodyRows[j].style.display = 'none'
                  }
                  // Retorna o ponteiro para iniciar essa stringbox fresca na próxima página
                  currentRowIdx = lastValidBreakPoint + 1
                  break
               }
            }
            // Se não der para fazer a quebra inteligente, quebra normal onde estiver
            break
          }

          tbodyRows[currentRowIdx].style.display = originalDisplays[currentRowIdx] || ''
          chunkHeightPx += rHeight
          rowsShown++
          currentRowIdx++
        }

        await new Promise(resolve => setTimeout(resolve, 50))

        const canvas = await html2canvas(elementRef, {
          scale: options.scale || 2,
          useCORS: true,
          backgroundColor: '#f8fafc',
          windowWidth: elementRef.scrollWidth,
          windowHeight: elementRef.scrollHeight
        })

        const imgData = canvas.toDataURL('image/png')
        let imgHeightMm = printWidth * (canvas.height / canvas.width)
        let imgWidthMm = printWidth

        // Se o html2canvas distorceu/esticou a imagem verticalmente, reescalar proporcionalmente
        if (imgHeightMm > currentAvailableTableHeightMm) {
          const scale = currentAvailableTableHeightMm / imgHeightMm
          imgHeightMm = currentAvailableTableHeightMm
          imgWidthMm = printWidth * scale
        }

        const xOffset = margin + (printWidth - imgWidthMm) / 2
        pdf.addImage(imgData, 'PNG', xOffset, tableAreaY, imgWidthMm, imgHeightMm)
        
        if (isLastPage) {
          pdf.addImage(footerImgData, 'PNG', margin, pageHeight - margin - footerHeight, printWidth, footerHeight)
        }
        
        if (margin > 0) {
          pdf.setFillColor(255, 255, 255)
          pdf.rect(0, pageHeight - margin, pageWidth, margin, 'F')
        }
        
        pageIndex++
      }

      tbodyRows.forEach((r, i) => r.style.display = originalDisplays[i])

    } else {
      // --- FALLBACK ---
      const canvas = await html2canvas(elementRef, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc',
        windowWidth: elementRef.scrollWidth,
        windowHeight: elementRef.scrollHeight
      })

      const imgData = canvas.toDataURL('image/png')
      let printHeight = printWidth * (canvas.height / canvas.width)

      const tableAreaY = margin + headerHeight
      let remainingTableHeight = printHeight
      let drawnTableHeight = 0
      let pageIndex = 0

      while (remainingTableHeight > 0) {
        if (pageIndex > 0) pdf.addPage()

        const isFirstPage = pageIndex === 0
        let currentTableAreaY = isFirstPage ? tableAreaY : margin
        
        let currentAvailableHeightWithoutFooter = pageHeight - margin - currentTableAreaY
        let currentAvailableHeightWithFooter = pageHeight - margin - footerHeight - currentTableAreaY
        
        let isLastPage = false
        if (remainingTableHeight <= currentAvailableHeightWithFooter) {
          isLastPage = true
        }
        
        let currentAvailableHeight = isLastPage ? currentAvailableHeightWithFooter : currentAvailableHeightWithoutFooter
        let tableHeightToDraw = Math.min(remainingTableHeight, currentAvailableHeight)

        if (isFirstPage) {
          pdf.addImage(headerImgData, 'PNG', margin, margin, printWidth, headerHeight)
        }

        const imageY = currentTableAreaY - drawnTableHeight
        if (tableHeightToDraw > 0) {
          pdf.addImage(imgData, 'PNG', margin, imageY, printWidth, printHeight)
        }

        const bottomMaskY = currentTableAreaY + tableHeightToDraw
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, bottomMaskY, pageWidth, pageHeight - bottomMaskY, 'F')
        
        if (pageIndex > 0 && margin > 0) {
          pdf.rect(0, 0, pageWidth, currentTableAreaY, 'F')
        }

        if (isLastPage) {
          pdf.addImage(footerImgData, 'PNG', margin, pageHeight - margin - footerHeight, printWidth, footerHeight)
        }

        remainingTableHeight -= tableHeightToDraw
        drawnTableHeight += tableHeightToDraw
        pageIndex++
      }
    }

    Object.assign(elementRef.style, originalStyles)
    ancestors.forEach(a => {
      Object.assign(a.element.style, a.styles)
    })
    elementRef.scrollTop = originalElementScrollTop
    elementRef.scrollLeft = originalElementScrollLeft
    window.scrollTo(originalScrollX, originalScrollY)

    pdf.save(filename)
  } catch (err) {
    console.error('Erro ao gerar PDF:', err)
    alert('Não foi possível gerar o PDF da tabela no momento.')
  }
}

export async function exportTableToPng(elementRef, filename = 'export.png', options = {}) {
  if (!elementRef) return

  try {
    const originalScrollY = window.scrollY
    const originalScrollX = window.scrollX
    window.scrollTo(0, 0)

    const ancestors = []
    if (!options.skipAncestorExpansion) {
      let currentParent = elementRef.parentElement
      while (currentParent) {
        ancestors.push({
          element: currentParent,
          styles: {
            overflow: currentParent.style.overflow,
            overflowX: currentParent.style.overflowX,
            overflowY: currentParent.style.overflowY,
            height: currentParent.style.height,
            maxHeight: currentParent.style.maxHeight
          }
        })
        currentParent.style.overflow = 'visible'
        currentParent.style.overflowX = 'visible'
        currentParent.style.overflowY = 'visible'
        currentParent.style.height = 'auto'
        currentParent.style.maxHeight = 'none'
        currentParent = currentParent.parentElement
      }
    }

    const currentScrollWidth = elementRef.scrollWidth + 'px'

    const originalStyles = {
      position: elementRef.style.position,
      top: elementRef.style.top,
      left: elementRef.style.left,
      zIndex: elementRef.style.zIndex,
      overflow: elementRef.style.overflow,
      height: elementRef.style.height,
      maxHeight: elementRef.style.maxHeight,
      width: elementRef.style.width,
      maxWidth: elementRef.style.maxWidth,
      flex: elementRef.style.flex,
      minHeight: elementRef.style.minHeight,
      background: elementRef.style.background
    }

    elementRef.style.position = 'absolute'
    elementRef.style.top = '0'
    elementRef.style.left = '0'
    elementRef.style.zIndex = '99999'
    elementRef.style.width = currentScrollWidth
    elementRef.style.background = '#f8fafc'
    elementRef.style.overflow = 'visible'
    elementRef.style.height = 'auto'
    elementRef.style.maxHeight = 'none'
    elementRef.style.maxWidth = 'none'
    elementRef.style.flex = 'none'
    elementRef.style.minHeight = '0'

    const originalElementScrollTop = elementRef.scrollTop
    const originalElementScrollLeft = elementRef.scrollLeft
    elementRef.scrollTop = 0
    elementRef.scrollLeft = 0

    await new Promise(resolve => setTimeout(resolve, 150))

    const mainCanvas = await html2canvas(elementRef, { 
      scale: options.scale || 2, 
      useCORS: true, 
      logging: false,
      backgroundColor: '#ffffff'
    })

    Object.assign(elementRef.style, originalStyles)
    elementRef.scrollTop = originalElementScrollTop
    elementRef.scrollLeft = originalElementScrollLeft

    ancestors.forEach(({ element, styles }) => {
      Object.assign(element.style, styles)
    })
    
    window.scrollTo(originalScrollX, originalScrollY)

    const link = document.createElement('a')
    link.href = mainCanvas.toDataURL('image/png')
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

  } catch (error) {
    console.error('Erro ao exportar PNG:', error)
    if (error && error.message && error.message.toLowerCase().includes('canvas')) {
      alert('Ocorreu um erro ao gerar o PNG. A tabela empilhada pode ser muito grande para o limite de tamanho de imagem do navegador. Por favor, tente exportar como PDF ou selecione menos dias.')
    } else {
      alert(`Ocorreu um erro ao gerar o PNG: ${error ? error.message : 'Erro Desconhecido'}\n\nSe a tabela for muito grande, tente exportar como PDF.`)
    }
  }
}
