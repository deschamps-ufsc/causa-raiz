import re

filepath = r"E:\Antigravity\Causa Raiz\frontend\src\components\FluxogramaView.jsx"
with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()

# Replace calculateStats definition
old_calc = r"""const calculateStats = \(key, targetKey, tol, isTargetFixed = false\) => \{
      const stats = \[0, 0, 0, 0\];
      displayRows\.forEach\(row => \{
        let val = row\[key\];
        if \(typeof val !== 'number'\) return;
        
        let target = isTargetFixed \? 1\.0 : row\[targetKey\];
        if \(typeof target !== 'number'\) return;
        
        if \(val < target - tol\) stats\[0\]\+\+;
        else if \(val >= target - tol && val < target\) stats\[1\]\+\+;
        else if \(val >= target && val <= target \+ tol\) stats\[2\]\+\+;
        else if \(val > target \+ tol\) stats\[3\]\+\+;
      \}\);
      return stats;
    \};"""

new_calc = """const calculateStats = (key, targetKey, tol, fixedTargetValue = null) => {
      const stats = [0, 0, 0, 0];
      displayRows.forEach(row => {
        let val = row[key];
        if (typeof val !== 'number') return;
        
        let target = fixedTargetValue !== null ? fixedTargetValue : row[targetKey];
        if (typeof target !== 'number') return;
        
        if (val < target - tol) stats[0]++;
        else if (val >= target - tol && val < target) stats[1]++;
        else if (val >= target && val <= target + tol) stats[2]++;
        else if (val > target + tol) stats[3]++;
      });
      return stats;
    };"""

text = re.sub(old_calc, new_calc, text)

# Now replace the invocations!
# For EPI: calculateStats('epi_pvlib', null, epiTol, true) -> calculateStats('epi_pvlib', null, epiTol, 1.0)
text = text.replace("calculateStats('epi_pvlib', null, epiTol, true)", "calculateStats('epi_pvlib', null, epiTol, 1.0)")
text = text.replace("calculateStats('epi_pvlib_window', null, epiTol, true)", "calculateStats('epi_pvlib_window', null, epiTol, 1.0)")
text = text.replace("calculateStats('epi_pvsyst', null, epiTol, true)", "calculateStats('epi_pvsyst', null, epiTol, 1.0)")

# For Capacity Ratio: calculateStats('cap_ratio', null, epiTol, true) -> calculateStats('cap_ratio', null, epiTol * 100, 100.0)
text = text.replace("calculateStats('cap_ratio', null, epiTol, true)", "calculateStats('cap_ratio', null, epiTol * 100, 100.0)")
text = text.replace("calculateStats('cap_ratio_adaptive', null, epiTol, true)", "calculateStats('cap_ratio_adaptive', null, epiTol * 100, 100.0)")
text = text.replace("calculateStats('astm_ratio', null, epiTol, true)", "calculateStats('astm_ratio', null, epiTol * 100, 100.0)")
text = text.replace("calculateStats('astm_ratio_adaptive', null, epiTol, true)", "calculateStats('astm_ratio_adaptive', null, epiTol * 100, 100.0)")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(text)
print("Patched calculateStats!")
