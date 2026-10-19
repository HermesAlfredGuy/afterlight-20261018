from PIL import Image
import numpy as np
import glob, os
rows = []
for p in sorted(glob.glob('build/clip6/frames/f0*.jpg'))[::15]:
    im = Image.open(p).convert('L')
    a = np.asarray(im).astype(np.float32)
    rows.append((os.path.basename(p), round(float(a.mean()), 1), round(float(np.percentile(a, 90)), 1)))
for r in rows:
    print(r)
