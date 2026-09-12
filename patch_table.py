import re

filepath = r"E:\Antigravity\Causa Raiz\frontend\src\components\FluxogramaView.jsx"
with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()

old_table = """                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-card)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: '600' }}>Métrica</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: '600' }}>Abaixo da Tolerância</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: '600' }}>Abaixo da Meta</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: '600' }}>Acima da Meta</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: '600' }}>Acima da Tolerância</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryTableData.map((row, i) => {
                        const total = row.stats.reduce((a, b) => a + b, 0);
                        const formatValue = (val) => summaryViewMode === 'percent' && total > 0 ? ((val / total) * 100).toFixed(1) + '%' : val;
                        return (
                          <tr key={i} style={{ borderBottom: i === summaryTableData.length - 1 ? 'none' : '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: '500' }}>{row.name}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#991b1b', fontWeight: row.stats[0] > 0 ? '700' : '400' }}>{formatValue(row.stats[0])}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#854d0e', fontWeight: row.stats[1] > 0 ? '700' : '400' }}>{formatValue(row.stats[1])}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#166534', fontWeight: row.stats[2] > 0 ? '700' : '400' }}>{formatValue(row.stats[2])}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#1e3a8a', fontWeight: row.stats[3] > 0 ? '700' : '400' }}>{formatValue(row.stats[3])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>"""

new_table = """                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-card)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: '600' }}>{UI_TRANSLATIONS["Métrica"] ? UI_TRANSLATIONS["Métrica"][language] : "Métrica"}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: '#ef4444', fontWeight: '600' }}>{UI_TRANSLATIONS["Abaixo da Tolerância"] ? UI_TRANSLATIONS["Abaixo da Tolerância"][language] : "Abaixo da Tolerância"}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: '#f59e0b', fontWeight: '600' }}>{UI_TRANSLATIONS["Abaixo da Meta"] ? UI_TRANSLATIONS["Abaixo da Meta"][language] : "Abaixo da Meta"}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: '#10b981', fontWeight: '600' }}>{UI_TRANSLATIONS["Acima da Meta"] ? UI_TRANSLATIONS["Acima da Meta"][language] : "Acima da Meta"}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: '#3b82f6', fontWeight: '600' }}>{UI_TRANSLATIONS["Acima da Tolerância"] ? UI_TRANSLATIONS["Acima da Tolerância"][language] : "Acima da Tolerância"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryTableData.map((row, i) => {
                        const total = row.stats.reduce((a, b) => a + b, 0);
                        const formatValue = (val) => summaryViewMode === 'percent' && total > 0 ? ((val / total) * 100).toFixed(1) + '%' : val;
                        const windowSize = capacityTestDailyResults && Object.keys(capacityTestDailyResults).length > 0 && capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]]?.astmWindow ? capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]].astmWindow : 5;
                        return (
                          <tr key={i} style={{ borderBottom: i === summaryTableData.length - 1 ? 'none' : '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: '500' }}>{getMetricName(row.name, windowSize, language)}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: row.stats[0] > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: row.stats[0] > 0 ? '700' : '400' }}>{formatValue(row.stats[0])}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: row.stats[1] > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: row.stats[1] > 0 ? '700' : '400' }}>{formatValue(row.stats[1])}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: row.stats[2] > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: row.stats[2] > 0 ? '700' : '400' }}>{formatValue(row.stats[2])}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: row.stats[3] > 0 ? '#3b82f6' : 'var(--text-muted)', fontWeight: row.stats[3] > 0 ? '700' : '400' }}>{formatValue(row.stats[3])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>"""

# Normalize unicode encoding issues first
import unicodedata

def normalize(t):
    return t.replace('é', 'e').replace('ê', 'e').replace('â', 'a').replace('ã', 'a').replace('ç', 'c').replace('í', 'i')

text_norm = normalize(text)
old_table_norm = normalize(old_table)

# The script that dumped the file had MǸtrica and Tolerǽncia. 
# We'll use a regex that ignores those weird characters!
pattern = r'<table style=\{\{\s*width:\s*\'100%\',\s*borderCollapse:\s*\'collapse\',\s*fontSize:\s*\'13px\'\s*\}\}>.*?summaryTableData\.map.*?</table>'

if re.search(pattern, text, re.DOTALL):
    text = re.sub(pattern, new_table.replace('Métrica', 'Métrica').replace('Tolerância', 'Tolerância'), text, flags=re.DOTALL)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(text)
    print("Patched table!")
else:
    print("Could not find table pattern!")
