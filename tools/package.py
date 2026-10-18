"""Package the playable source (no node_modules, no build output) and stage the delivery files."""
import os
import shutil
import subprocess
import zipfile

ROOT = '/opt/data/projects/afterlight-20261018'
STAGE = '/opt/data/cache/scratch/afterlight-pkg'
if os.path.isdir(STAGE):
    shutil.rmtree(STAGE)
os.makedirs(STAGE)
os.makedirs(os.path.join(STAGE, 'tools'), exist_ok=True)

for f in ['index.html', 'styles.css', 'package.json', 'README.md', 'DESIGN.md']:
    shutil.copy(os.path.join(ROOT, f), os.path.join(STAGE, f))
for d in ['src', 'vendor', 'tools']:
    shutil.copytree(os.path.join(ROOT, d), os.path.join(STAGE, d), dirs_exist_ok=True)

zpath = os.path.join(ROOT, 'build/afterlight-20261018-source.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, dirs, files in os.walk(STAGE):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '__pycache__')]
        for n in files:
            full = os.path.join(base, n)
            z.write(full, os.path.join('afterlight-20261018', os.path.relpath(full, STAGE)))
print('zip', zpath, os.path.getsize(zpath))

# curated delivery set: two desktop stills, one phone still, the clip, the source
picks = [
    ('build/shot-vesper-launch.png', 'afterlight-hero.png'),
    ('build/shot-vesper-arch.png', 'afterlight-gate.png'),
    ('build/shot-mobile.png', 'afterlight-mobile.png'),
    ('build/afterlight-gameplay.mp4', 'afterlight-gameplay.mp4'),
    ('build/afterlight-20261018-source.zip', 'afterlight-20261018-source.zip'),
]
for src, dst in picks:
    s = os.path.join(ROOT, src)
    d = os.path.join(ROOT, 'build/send-' + dst)
    shutil.copy(s, d)
    print('staged', d, os.path.getsize(d))
