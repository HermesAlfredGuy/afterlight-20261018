from PIL import Image
import numpy as np
im = Image.open('build/darkframe.jpg').convert('RGB')
a = np.asarray(im).astype(np.int32)
h, w, _ = a.shape
print('size', im.size)
# sample a horizontal strip across the middle of the frame
row = a[h // 2]
for x in range(0, w, w // 12):
    print('x', x, 'rgb', row[x].tolist())
dark = a.reshape(-1, 3)
lum = dark.mean(1)
idx = np.argsort(lum)[:len(lum) // 10]
print('darkest 10% mean rgb', dark[idx].mean(0).round(1).tolist())
print('overall mean', dark.mean(0).round(1).tolist())
