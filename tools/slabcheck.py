from PIL import Image
import numpy as np
import glob, os, sys
d = sys.argv[1] if len(sys.argv) > 1 else 'build/clip7/frames'
bad = []
files = sorted(glob.glob(d + '/f*.jpg'))
for p in files:
    a = np.asarray(Image.open(p).convert('L')).astype(np.float32)
    frac = float((a < 30).mean())
    if frac > 0.12:
        bad.append((os.path.basename(p), round(float(a.mean()), 1), round(frac, 3)))
print('frames', len(files), 'with >12% near-black pixels:', len(bad))
print(bad[:14])
