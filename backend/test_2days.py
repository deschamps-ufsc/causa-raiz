"""Test 2 days with proper error capture."""
import urllib.request, urllib.parse, json, sys

usina = "WEG - UFV Arapuá"
dates = "2026-02-01,2026-03-12"
variavel = "tensao_cc"

url = "http://127.0.0.1:8000/heatmap/mapa?usina=" + urllib.parse.quote(usina) + "&dates=" + dates + "&variavel=" + variavel
print("URL: " + url)
print("Requesting...")
sys.stdout.flush()

try:
    import time
    t0 = time.time()
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req, timeout=300)
    elapsed = time.time() - t0
    data = resp.read().decode()
    print("Status: " + str(resp.status))
    print("Time: " + str(round(elapsed, 2)) + "s")
    print("Response size: " + str(len(data)) + " bytes")
except urllib.error.HTTPError as e:
    elapsed = time.time() - t0
    body = e.read().decode()
    print("HTTPError: " + str(e.code))
    print("Time: " + str(round(elapsed, 2)) + "s")
    print("Body: " + body[:3000])
    print("Headers: " + str(dict(e.headers)))
except Exception as e:
    elapsed = time.time() - t0
    print("Error after " + str(round(elapsed, 2)) + "s: " + str(type(e).__name__) + ": " + str(e))
