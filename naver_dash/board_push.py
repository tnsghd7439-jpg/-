"""일일점검(네이버 SA 점검) 결과를 원보드 '오늘 점검' 탭으로 보내고, 다음 수집 때 전날 결과를 다시 받아온다.

GitHub Actions(board-sa)에서 collect.py 앞뒤로 실행한다. 회사 PC 가 필요 없다.
  python3 naver_dash/board_push.py pull   # 원보드에 있는 전날 결과 → output/naver_dash/latest.json (피이관 의심·휴면 재사용용)
  python3 naver_dash/collect.py --no-notify
  python3 naver_dash/board_push.py push   # latest.json + 화면 틀(dashboard.html) → 원보드

환경변수: BOARD_URL(외부 연결용 배포 주소), BOARD_TOKEN(시트 설정 탭의 수집토큰)
공개 저장소의 실행 기록은 누구나 볼 수 있으므로 광고주 정보는 출력하지 않고 건수만 출력한다.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = Path(os.environ.get("NAVER_DASH_OUT") or ROOT.parent / "output" / "naver_dash")


def env():
    url, token = os.environ.get("BOARD_URL", ""), os.environ.get("BOARD_TOKEN", "")
    if not url.startswith("https://script.google.com/") or not token:
        raise SystemExit("BOARD_URL(https://script.google.com/... /exec)과 BOARD_TOKEN 환경변수를 넣어주세요.")
    return url, token


def pull():
    url, token = env()
    q = urllib.parse.urlencode({"api": "saPrev", "token": token})
    with urllib.request.urlopen(f"{url}?{q}", timeout=120) as r:
        text = r.read().decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        print("원보드에 전날 결과가 없거나 읽지 못했습니다(처음 실행이면 정상)")
        return
    if not isinstance(data, dict) or "accounts" not in data:
        print("원보드에 전날 결과가 없습니다(처음 실행이면 정상)")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "latest.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"전날 결과 받음: 기준일 {data.get('baseDate')}, 계정 {len(data['accounts'])}개")


def push():
    url, token = env()
    data = json.loads((OUT / "latest.json").read_text(encoding="utf-8"))
    template = (ROOT / "dashboard.html").read_text(encoding="utf-8")
    body = json.dumps({"token": token, "sa": {"data": data, "template": template}}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json; charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=300) as r:
        res = json.loads(r.read().decode("utf-8"))
    if not res.get("ok"):
        raise SystemExit(f"원보드 기록 실패: {res.get('error')}")
    alerts = sum(len(a.get("alerts") or []) for a in data["accounts"])
    print(f"원보드 기록 완료: 기준일 {data.get('baseDate')}, 계정 {len(data['accounts'])}개, 경고 {alerts}건")


if __name__ == "__main__":
    {"pull": pull, "push": push}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit("pull 또는 push"))()
