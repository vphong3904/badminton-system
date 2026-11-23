# scripts/doi_import_tuong_doi.py
import os, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / 'lib'
TEN = 'cau_long_app'
mau = re.compile(r"(import|export|part)\s+'package:%s/([^']+)'" % TEN)

for tep in LIB.rglob('*.dart'):
    cu = tep.read_text(encoding='utf-8')
    def doi(m):
        dich = LIB / m.group(2)
        tuong_doi = os.path.relpath(dich, tep.parent).replace(os.sep, '/')
        return f"{m.group(1)} '{tuong_doi}'"
    moi = mau.sub(doi, cu)
    if moi != cu:
        tep.write_text(moi, encoding='utf-8')
        print('✓', tep.relative_to(ROOT))