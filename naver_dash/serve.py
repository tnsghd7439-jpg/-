"""사내망에 팀원별 대시보드만 여는 웹 서버 (serve.bat 이 실행).

팀원별 파일(sa-<토큰>.html)만 열어 준다. 전체 화면(dashboard.html)·데이터(json)·링크 목록·
폴더 목록은 열지 않으므로, 팀원은 자기 링크 외에 다른 팀원 데이터를 볼 수 없다.
팀장은 전체 화면을 이 PC 에서 파일로 직접 연다.
"""
import http.server
import os
import re
import sys
from pathlib import Path

OUT = Path(os.environ.get("NAVER_DASH_OUT") or Path(__file__).resolve().parent.parent / "output" / "naver_dash")
ALLOWED = re.compile(r"^/sa-[0-9a-f]{10}\.html$")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(OUT), **kw)

    def do_GET(self):
        if not ALLOWED.match(self.path.split("?", 1)[0]):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        self.do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # 매일 바뀌는 파일이라 예전 화면이 남지 않게
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"팀원별 대시보드 서버 실행 중 (포트 {port}). 이 창을 닫으면 팀원 링크가 열리지 않습니다.")
    print(f"링크 목록: {OUT / 'links.txt'}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
