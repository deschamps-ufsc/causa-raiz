import urllib.request, urllib.parse, json
usina = "WEG - UFV Arapuá"

for var in ["potencia_cc", "tensao_cc"]:
    url = "http://127.0.0.1:8000/heatmap/mapa?usina=" + urllib.parse.quote(usina) + "&dates=2026-02-01&variavel=" + var
    try:
        resp = urllib.request.urlopen(url, timeout=60)
        raw = resp.read().decode()
        data = json.loads(raw)
        recs = data.get("records", [])
        print(var + ": " + str(len(recs)) + " records, " + str(len(raw)) + " bytes")
    except Exception as e:
        print(var + ": ERROR " + str(e))
