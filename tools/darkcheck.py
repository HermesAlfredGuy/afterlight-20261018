from PIL import Image
import numpy as np
import glob, os
d = 'build/clip7/frames'
dark = []
for p in sorted(glob.glob(d + '/f*.jpg')):
    a = np.asarray(Image.open(p).convert('L')).astype(np.float32)
    m = float(a.mean())
    if m < 45:
        dark.append((os.path.basename(p), round(m, 1)))
print('frames', len(glob.glob(d + '/f*.jpg')), 'dark(<45)', len(dark))
print(dark[:12])
