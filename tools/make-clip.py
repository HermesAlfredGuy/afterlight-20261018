"""Assemble the captured gameplay frames into the deliverable MP4 (30 fps, H.264)."""
import os
import subprocess

ROOT = '/opt/data/projects/afterlight-20261018'
FRAMES = os.path.join(ROOT, 'build/clip7/frames')
names = sorted(n for n in os.listdir(FRAMES) if n.endswith('.jpg'))
print('frames', len(names), names[0], names[-1])
# contiguous run check
nums = [int(n[1:5]) for n in names]
missing = [i for i in range(nums[0], nums[-1] + 1) if i not in set(nums)]
print('missing', missing[:10], 'count', len(missing))

listing = os.path.join(ROOT, 'build/clip/list.txt')
with open(listing, 'w') as f:
    for n in names:
        f.write("file '%s'\n" % os.path.join(FRAMES, n))

out = os.path.join(ROOT, 'build/afterlight-gameplay.mp4')
cmd = [
    'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-r', '30', '-i', listing,
    '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart',
    '-an', out,
]
print(subprocess.run(cmd, capture_output=True, text=True).returncode)
print(os.path.getsize(out) if os.path.exists(out) else 'no output')
