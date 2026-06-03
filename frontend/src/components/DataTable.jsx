import { useMemo, memo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table'

export function formatSeriesName(name) {
  if (!name) return name;
  const nameLower = name.toLowerCase();
  if (nameLower === 'gpoa') return 'Gpoa';
  if (nameLower === 'grear') return 'Grear';
  if (nameLower === 'geff') return 'Geff';
  if (nameLower === 'tamb') return 'Tamb';
  if (nameLower === 'tmod') return 'Tmod';
  if (nameLower === 'tcel') return 'Tcel';
  if (nameLower === 'sujidade') return 'Sujidade';
  if (nameLower === 'energia') return 'Energia';
  return name;
}

/** Interpola cor entre verde e vermelho com base no valor normalizado [0,1] */
function valueColor(norm) {
  if (norm === null || isNaN(norm)) return 'transparent'
  // Verde → Amarelo → Vermelho
  const r = norm < 0.5 ? Math.round(norm * 2 * 255) : 255
  const g = norm < 0.5 ? 200 : Math.round((1 - norm) * 2 * 200)
  return `rgba(${r},${g},50,0.25)`
}

/**
 * Tabela interativa com TanStack Table v8.
 * Colunas: timestamp + cada série. Células coloridas por valor normalizado.
 */
export default memo(function DataTable({ data, seriesDict = {} }) {
  if (!data || !data.timestamps?.length) return null

  const seriesNames = Object.keys(data.series)

  // Calcular min/max por série para normalização de cor
  const ranges = useMemo(() => {
    const r = {}
    seriesNames.forEach((name) => {
      const vals = data.series[name].filter((v) => v !== null && v !== undefined)
      r[name] = { min: Math.min(...vals), max: Math.max(...vals) }
    })
    return r
  }, [data])

  // Montar rows
  const rows = useMemo(() =>
    data.timestamps.map((ts, i) => {
      const row = { _ts: ts }
      seriesNames.forEach((name) => { row[name] = data.series[name][i] })
      return row
    })
  , [data])

  // Definir colunas TanStack
  const columns = useMemo(() => [
    {
      id: '_ts',
      header: 'Timestamp',
      accessorKey: '_ts',
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {getValue()?.slice(0, 19).replace('T', ' ')}
        </span>
      ),
      enableSorting: false,
    },
    ...seriesNames.map((name) => {
      const sinfo = seriesDict[name] || {}
      return {
        id: name,
        header: () => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, verticalAlign: 'top' }}>
            {sinfo.elemento && (
              <span style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', lineHeight: 1.1, fontWeight: 700 }}>
                {sinfo.elemento}
              </span>
            )}
            <div style={{ 
              fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3, 
              whiteSpace: 'normal', wordBreak: 'keep-all', display: 'block' 
            }}>
              {[sinfo.skid, sinfo.inversor, sinfo.estacao, sinfo.stringbox].filter(Boolean).join(' · ')}
            </div>
            {Object.keys(sinfo).length > 2 && <div style={{ height: 1, background: 'var(--border)', margin: '1px 0 3px 0' }} />}
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', display: 'block', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.2' }} title={name}>
              {formatSeriesName(name)}
            </span>
          </div>
        ),
        accessorFn: (row) => row[name],
      cell: ({ getValue }) => {
        const val = getValue()
        if (val === null || val === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>
        const { min, max } = ranges[name] || {}
        const norm = max !== min ? (val - min) / (max - min) : 0.5
        return (
          <span style={{
            display: 'block', textAlign: 'right', fontFamily: 'monospace',
            fontSize: 12, padding: '2px 6px', borderRadius: 4,
            background: valueColor(norm), color: 'var(--text-primary)',
          }}>
            {typeof val === 'number' ? val.toFixed(3) : val}
          </span>
        )
      },
    }
  }),
  ], [seriesNames, ranges, seriesDict])

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tabela */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <table style={{ width: 'max-content', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{
                      padding: '8px 8px', textAlign: 'left', cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'normal',
                      userSelect: 'none', color: 'var(--text-secondary)',
                      minWidth: header.id === '_ts' ? '160px' : '100px', maxWidth: header.id === '_ts' ? '180px' : '160px',
                      verticalAlign: 'top'
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() ? (header.column.getIsSorted() === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, ri) => (
              <tr
                key={row.id}
                style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ padding: '4px 8px', borderBottom: '1px solid rgba(31,41,55,0.6)', whiteSpace: 'nowrap', maxWidth: cell.column.id === '_ts' ? '180px' : '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <span>
          Apenas rolagem (sem paginação) — {rows.length.toLocaleString('pt-BR')} linhas
        </span>
      </div>
    </div>
  )
}
)
