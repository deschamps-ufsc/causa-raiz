import re

filepath = r"E:\Antigravity\Causa Raiz\frontend\src\components\FluxogramaView.jsx"
with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()

# Replace the title translation
old_title = r"<span style=\{\{ fontWeight: '600', color: 'var\(--text-primary\)' \}\}>Resumo de Toler.*?ncia</span>"
new_title = r"""<span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{UI_TRANSLATIONS["Resumo de Tolerância"] ? UI_TRANSLATIONS["Resumo de Tolerância"][language] : "Resumo de Tolerância"}</span>"""

if re.search(old_title, text):
    text = re.sub(old_title, new_title, text)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(text)
    print("Patched title!")
else:
    print("Could not find title!")
