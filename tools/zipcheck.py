import zipfile
z = zipfile.ZipFile('/opt/data/projects/afterlight-20261018/build/afterlight-20261018-source.zip')
n = z.namelist()
print('entries', len(n))
print('src files', sum(1 for x in n if '/src/' in x))
print('vendor files', sum(1 for x in n if '/vendor/' in x))
print('has index', any(x.endswith('index.html') for x in n))
print('has three', any(x.endswith('three.module.js') for x in n))
print('has fonts', any('cormorant-300.ttf' in x for x in n))
