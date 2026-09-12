import re

filepath = r"E:\Antigravity\Causa Raiz\frontend\src\components\FluxogramaView.jsx"
with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()

# Replace the inner map block
old_block = r"\{summaryTableData\.map\(\(row, i\) => \{.*?\n\s*\}\)\}"
new_block = """{summaryTableData.map((row, i) => {
                        const total = row.stats.reduce((a, b) => a + b, 0);
                        const windowSize = capacityTestDailyResults && Object.keys(capacityTestDailyResults).length > 0 && capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]]?.astmWindow ? capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]].astmWindow : 5;
                        
                        const renderCell = (idx, defaultColor) => {
                          const val = row.stats[idx];
                          const pct = total > 0 ? val / total : 0;
                          
                          const rgbBases = [
                            '239, 68, 68',
                            '245, 158, 11',
                            '16, 185, 129',
                            '59, 130, 246'
                          ];
                          
                          const opacity = pct > 0 ? (pct * 0.6).toFixed(2) : '0';
                          const bgColor = pct > 0 ? `rgba(${rgbBases[idx]}, ${opacity})` : 'transparent';
                          const textColor = pct > 0 ? defaultColor : 'var(--text-muted)';
                          const displayVal = summaryViewMode === 'percent' && total > 0 ? (pct * 100).toFixed(1) + '%' : val;
                          
                          return (
                            <td key={idx} style={{ padding: '12px 16px', textAlign: 'center', background: bgColor, color: textColor, fontWeight: pct > 0 ? '600' : '400' }}>
                              {total === 0 ? '-' : displayVal}
                            </td>
                          );
                        };

                        return (
                          <tr key={i} style={{ borderBottom: i === summaryTableData.length - 1 ? 'none' : '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: '500' }}>{getMetricName(row.name, windowSize, language)}</td>
                            {renderCell(0, '#991b1b')}
                            {renderCell(1, '#854d0e')}
                            {renderCell(2, '#166534')}
                            {renderCell(3, '#1e3a8a')}
                          </tr>
                        );
                      })}"""

if re.search(old_block, text, re.DOTALL):
    text = re.sub(old_block, new_block, text, flags=re.DOTALL)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(text)
    print("Patched table conditional formatting!")
else:
    print("Could not find table map block!")
