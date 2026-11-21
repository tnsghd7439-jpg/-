"""테스트용 보드 페이지 만들기: 가짜 구글 환경(mock.js) + 실제 Code.gs + 테스트 데이터(seed.js) + 실제 Index.html.
사용: python3 naver_board/dev/build.py  →  naver_board/dev/out/board_lead.html, board_a.html
그다음: node naver_board/dev/speed.js naver_board/dev/out (시트 읽기 횟수), shot.js(화면·오류), act.js(동작)
"""
from pathlib import Path
d = Path(__file__).resolve().parent
src = d.parent
out = d / "out"
out.mkdir(exist_ok=True)
html = (src / "Index.html").read_text(encoding="utf-8")
code = (src / "Code.gs").read_text(encoding="utf-8")
for f in ("mock.js", "seed.js"):
    (out / f).write_text((d / f).read_text(encoding="utf-8"), encoding="utf-8")
for who in ("lead", "a"):
    inj = (f"<script>window.__AS='{who}@mymp.co.kr';window.__NOTICES=window.__NOTICES||[];</script>"
           f"<script src='mock.js'></script><script>{code}</script><script src='seed.js'></script>")
    page = html.replace("<script>\n/* ───────── 공통", inj + "<script>\n/* ───────── 공통", 1)
    (out / f"board_{who}.html").write_text(page, encoding="utf-8")
print("만듦:", out)
