from PIL import Image
import sys

img_path = r'e:\Antigravity\Causa Raiz\frontend\public\logo_ufsc_new.png'
out_path = r'e:\Antigravity\Causa Raiz\frontend\public\logo_ufsc_white.png'

try:
    img = Image.open(img_path).convert('RGBA')
    datas = img.getdata()
    new_data = []
    for item in datas:
        # Check if pixel is dark (black text) but not transparent
        if item[0] < 50 and item[1] < 50 and item[2] < 50 and item[3] > 50:
            new_data.append((255, 255, 255, item[3]))
        else:
            new_data.append(item)
    img.putdata(new_data)
    img.save(out_path, 'PNG')
    print('Logo editada salva com sucesso!')
except Exception as e:
    print('Erro:', e)
    sys.exit(1)
