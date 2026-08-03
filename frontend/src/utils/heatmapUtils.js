export function generatePivotData(data, selectedDates, colCat, rowCat1, rowCat2, rowCat3, aggType, elemento) {
  if (!data || data.length === 0) return null

  const filteredData = selectedDates.length > 0 ? data.filter(r => selectedDates.includes(r.date)) : data
  if (filteredData.length === 0) return null

  // 1. Extrair todas as chaves de coluna existentes no recordset
  const colsSet = new Set()
  filteredData.forEach(r => { if (r[colCat]) colsSet.add(r[colCat]) })
  const cols = [...colsSet].sort()

  // 2. Construir árvore
  const rootMap = new Map()
  const getOrCreate = (map, label, lvl) => {
    if (!map.has(label)) {
      let type = 'inversor'
      if (lvl === 1) type = 'stringbox'
      if (lvl === 2) type = rowCat3 ? 'tracker' : 'string'
      if (lvl === 3) type = 'string'
      const node = { label, values: {}, children: new Map(), isLeaf: false, level: lvl, type }
      for (let c of cols) node.values[c] = { integral: 0, avg_sum: 0, kwp: 0, yield: null, count: 0, serieName: '' }
      map.set(label, node)
    }
    return map.get(label)
  }

  filteredData.forEach(r => {
    const c = r[colCat]
    if (!c) return
    
    const h1 = r[rowCat1] || 'S/N'
    const h2 = rowCat2 ? (r[rowCat2] || 'S/N') : null
    const h3 = rowCat3 ? (r[rowCat3] || 'S/N') : null
    
    let leafId = r.serie || '?'
    const elLower = elemento ? elemento.toLowerCase() : ''
    const isStringVar = elLower.includes('string') || elLower.includes('cc') || elLower.includes('dc')
    
    if (isStringVar) {
      if (r.string) {
        leafId = `String ${r.string}`
      } else {
        const strMatch = leafId.match(/(?:string|str)\D*(\d+)/i)
        if (strMatch) {
          leafId = `String ${parseInt(strMatch[1], 10)}`
        } else {
          const numMatch = leafId.match(/(\d+)$/)
          if (numMatch) {
            leafId = `String ${parseInt(numMatch[1], 10)}`
          } else {
            leafId = `String ${leafId.split(/[._]/).pop()}`
          }
        }
      }
    } else {
      leafId = leafId.split('.').pop()
    }

    const n1 = getOrCreate(rootMap, h1, 0)
    
    let parentForLeaf = n1
    if (rowCat2) {
      parentForLeaf = getOrCreate(n1.children, h2, 1)
    }
    if (rowCat3 && parentForLeaf.level === 1) {
      parentForLeaf = getOrCreate(parentForLeaf.children, h3, 2)
    }

    const leaf = getOrCreate(parentForLeaf.children, leafId, parentForLeaf.level + 1)
    leaf.isLeaf = true
    leaf.type = 'string'

    const addVal = (node, name) => {
      if (node.values[c]) {
        node.values[c].integral += r.integral || 0
        node.values[c].avg_sum += r.avg_val || 0
        node.values[c].kwp += r.kwp || 0
        node.values[c].count += 1
        if (name !== undefined) {
           node.values[c].serieName = name
        }
      }
    }

    addVal(n1, ``)
    if (rowCat2) {
      addVal(n1.children.get(h2), `Total ${h2}`)
    }
    if (rowCat3 && h2 && h3) {
      const n2 = n1.children.get(h2)
      if (n2) addVal(n2.children.get(h3), `Total ${h3}`)
    }
    addVal(leaf, r.serie)
  })

  // 3. Converter Map -> Array recursivamente e calcular o Yield (Integral / kWp)
  let allYields = [] // Usado para calcular o Desvio Global

  const mapToArray = (map, prefix = '') => {
    return Array.from(map.values()).map(n => {
      const path = prefix ? `${prefix}|${n.label}` : n.label
      // Calcula o Yield do Nó
      for (let c of cols) {
        const v = n.values[c]
        if (v.count > 0) {
          v.displayVal = aggType === 'media' ? (v.avg_sum / v.count) : v.integral
          v.displayKwp = aggType === 'media' ? (v.kwp / v.count) : v.kwp
        }
        if (v.count > 0 && v.displayKwp > 0) {
          v.yield = v.displayVal / v.displayKwp
          if (n.isLeaf) allYields.push(v.yield)
        }
      }
      
      return {
        ...n,
        path,
        children: n.children && n.children.size > 0 ? mapToArray(n.children, path) : null
      }
    }).sort((a,b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
  }

  const tree = mapToArray(rootMap)

  allYields = allYields.filter(y => y > 0)
  allYields.sort((a,b) => a - b)
  const globalMean = allYields.length > 0 ? allYields.reduce((a,b)=>a+b,0)/allYields.length : 0
  const globalMax = allYields.length > 0 ? Math.max(...allYields) : 0

  const getDesvioColor = (val, mean=globalMean) => {
    if (val == null || !mean) return { bg: 'transparent', text: '#94a3b8' }
    const pct = (val / mean - 1) * 100
    
    const interpolate = (c1, c2, factor) => Math.round(c1 + (c2 - c1) * Math.max(0, Math.min(1, factor)))
    
    const green = [99, 190, 123]
    const yellow = [255, 235, 132]
    const lightRed = [248, 105, 107]
    const pureRed = [255, 0, 0]

    let r, g, b, f = 0

    if (pct <= -20) { 
        [r,g,b] = pureRed 
    }
    else if (pct <= -5) { 
        [r,g,b] = lightRed 
    }
    else if (pct >= 5) { 
        [r,g,b] = green 
    }
    else if (pct > 0) {
        f = pct / 5
        r = interpolate(yellow[0], green[0], f)
        g = interpolate(yellow[1], green[1], f)
        b = interpolate(yellow[2], green[2], f)
    } else {
        f = (pct - (-5)) / 5
        r = interpolate(lightRed[0], yellow[0], f)
        g = interpolate(lightRed[1], yellow[1], f)
        b = interpolate(lightRed[2], yellow[2], f)
    }
    
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    const text = brightness > 125 ? '#1e293b' : '#ffffff'

    return { bg: `rgb(${r},${g},${b})`, text }
  }

  return {
    cols: Array.from(cols).sort(),
    tree,
    globalMean,
    globalMax,
    getDesvioColor
  }
}

export function generateFlatRows(pivotData, expandedPaths, showRows) {
  if (!pivotData) return []
  const flatten = (nodes, lvl=0, parentPrefix='') => {
    let res = []
    for (const node of nodes) {
      if (showRows[node.type]) {
        const displayLabel = parentPrefix ? `${parentPrefix} - ${node.label}` : node.label
        res.push({...node, level: lvl, displayLabel})
      }
      if ((expandedPaths.has(node.path) || !showRows[node.type]) && node.children) {
        let nextPrefix = parentPrefix
        if (!showRows[node.type]) {
          nextPrefix = parentPrefix ? `${parentPrefix} - ${node.label}` : node.label
        } else {
          nextPrefix = ''
        }
        res = res.concat(flatten(node.children, showRows[node.type] ? lvl+1 : lvl, nextPrefix))
      }
    }
    return res
  }
  return flatten(pivotData.tree)
}
