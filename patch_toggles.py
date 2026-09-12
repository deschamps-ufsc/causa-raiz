import re

filepath = r"E:\Antigravity\Causa Raiz\frontend\src\components\FluxogramaView.jsx"
with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()

# Replace Quantidade
old_q = r">Quantidade</span>"
new_q = r">{UI_TRANSLATIONS['Quantidade'] ? UI_TRANSLATIONS['Quantidade'][language] : 'Quantidade'}</span>"
text = re.sub(old_q, new_q, text)

# Replace Percentual
old_p = r">Percentual</span>"
new_p = r">{UI_TRANSLATIONS['Percentual'] ? UI_TRANSLATIONS['Percentual'][language] : 'Percentual'}</span>"
text = re.sub(old_p, new_p, text)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(text)
print("Patched toggles!")
