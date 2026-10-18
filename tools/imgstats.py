from PIL import Image
import numpy as np
for p in ['build/shot-mobile.png', 'build/shot-mobile-touch.png', 'build/shot-vesper-arch.png']:
    im = Image.open(p).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    print(p, im.size, 'mean', a.reshape(-1, 3).mean(0).round(1), 'std', a.reshape(-1, 3).std(0).round(1))
