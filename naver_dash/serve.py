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
import subprocess
import sys
import threading
import time
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


GFA_REFRESH_MIN = 30  # GFA 시트 확인 주기(분). 시트가 바뀌었을 때만 화면을 다시 만든다


def gfa_refresher():
    """서버가 켜져 있는 동안 주기적으로 collect.py --gfa-refresh 실행 (API 호출 없음, 시트만 읽음)."""
    script = str(Path(__file__).resolve().parent / "collect.py")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)  # 창 없이(pyw) 실행 중이어도 콘솔 창이 뜨지 않게
    while True:
        try:
            subprocess.run([sys.executable, script, "--gfa-refresh"], timeout=600, creationflags=flags,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:  # noqa: BLE001 — 갱신 실패가 서버를 멈추지 않게
            pass
        time.sleep(GFA_REFRESH_MIN * 60)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"팀원별 대시보드 서버 실행 중 (포트 {port}). 이 창을 닫으면 팀원 링크가 열리지 않습니다.")
    print(f"링크 목록: {OUT / 'links.txt'}")
    print(f"접속 허용 대역: {', '.join(map(str, ALLOW_NETS))}" if ALLOW_NETS
          else "주의: 접속 허용 대역(team.json allowNets)이 없어 모든 IP 에서 열립니다")
    # 윈도우는 주소 재사용 옵션이 켜져 있으면 같은 포트에 서버가 두 개 붙는다 → 꺼서 이미 켜져 있으면 바로 종료되게
    http.server.ThreadingHTTPServer.allow_reuse_address = os.name != "nt"
    try:
        server = http.server.ThreadingHTTPServer(("", port), Handler)
    except OSError:
        print(f"포트 {port} 에 이미 서버가 켜져 있어 종료합니다.")
        sys.exit(0)
    if os.environ.get("NAVER_GFA_URL"):
        threading.Thread(target=gfa_refresher, daemon=True).start()
        print(f"GFA 시트를 {GFA_REFRESH_MIN}분마다 확인합니다")
    server.serve_forever()
