"""사내망에 팀원별 대시보드만 여는 웹 서버 (serve.bat 이 실행, 또는 창 없이 pyw 로 자동 실행).

팀원별 파일(sa-<토큰>.html)만 열어 준다. 전체 화면(dashboard.html)·데이터(json)·링크 목록·
폴더 목록은 열지 않으므로, 팀원은 자기 링크 외에 다른 팀원 데이터를 볼 수 없다.
팀장은 전체 화면을 이 PC 에서 파일로 직접 연다.
"""
import http.server
import ipaddress
import json
import os
import re
import sys
from pathlib import Path

OUT = Path(os.environ.get("NAVER_DASH_OUT") or Path(__file__).resolve().parent.parent / "output" / "naver_dash")
ALLOWED = re.compile(r"^/sa-[0-9a-f]{10}\.html$")
# 접속 허용 IP 대역: team.json 의 "allowNets" (예: ["60.196.6.0/24"]). 없으면 모두 허용(인터넷 노출 주의)
_team = Path(__file__).resolve().parent / "team.json"
ALLOW_NETS = [ipaddress.ip_network(n, strict=False)
              for n in (json.loads(_team.read_text(encoding="utf-8")).get("allowNets", []) if _team.exists() else [])]
ALLOW_NETS += [ipaddress.ip_network("127.0.0.0/8")] if ALLOW_NETS else []


def allowed_ip(ip: str) -> bool:
    if not ALLOW_NETS:
        return True
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in n for n in ALLOW_NETS)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(OUT), **kw)

    def do_GET(self):
        if not allowed_ip(self.client_address[0]) or not ALLOWED.match(self.path.split("?", 1)[0]):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        self.do_GET()

    def log_message(self, fmt, *args):
        # 창 없이(pyw) 실행하면 stderr 가 없어 기본 접속 기록이 오류를 낸다 → 그때는 기록하지 않음
        if sys.stderr:
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # 매일 바뀌는 파일이라 예전 화면이 남지 않게
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"팀원별 대시보드 서버 실행 중 (포트 {port}). 이 창을 닫으면 팀원 링크가 열리지 않습니다.")
    print(f"링크 목록: {OUT / 'links.txt'}")
    print(f"접속 허용 대역: {', '.join(map(str, ALLOW_NETS))}" if ALLOW_NETS
          else "주의: 접속 허용 대역(team.json allowNets)이 없어 모든 IP 에서 열립니다")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
