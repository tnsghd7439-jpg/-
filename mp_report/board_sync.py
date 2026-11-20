"""원보드 실적 동기화 — 인트라넷 6팀 매출을 원보드 시트(실적_일별, 실적_월별)로 보낸다.

Claude 없이 돌아가도록 만든 스크립트다(크레딧 0). GitHub Actions 나 PC 작업 스케줄러로 매일 아침 실행한다.

환경변수
  MP_ID, MP_PW     인트라넷 계정 (필수)
  BOARD_URL        원보드 '외부 연결용' 배포 주소 (/exec 로 끝남, 액세스: 모든 사용자)
  BOARD_TOKEN      원보드 시트 '설정' 탭의 수집토큰 값
  MP_DEPT_CODE     부서코드 (기본: 6팀)

사용
  python3 mp_report/board_sync.py                 # 최근 3일 + 이번 달·지난달 월합계
  python3 mp_report/board_sync.py --backfill      # 처음 한 번: 최근 62일 일별 + 최근 7개월 월합계
  python3 mp_report/board_sync.py --dry-run       # 보내지 않고 건수만 확인

공개 저장소의 Actions 로그는 누구나 볼 수 있으므로, 이 스크립트는 광고주명·금액을 화면에 찍지 않고 건수만 출력한다.
"""
import argparse
import asyncio
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect import CHROMIUM, KST, Intra, add_months, login, month_start, sales_range, ymd  # noqa: E402

PAGE_LIMIT = 2000


def rows_of(raw, key_name, key_value):
    out = []
    for r in raw:
        amt = float(r.get("tot_amt") or 0)
        if not amt:
            continue
        out.append({
            key_name: key_value,
            "담당자": r.get("mng_name") or "",
            "매체": r.get("media_nm") or r.get("media_id") or "",
            "광고주ID": r.get("customer_id") or r.get("cust_id") or "",
            "광고주명": r.get("customer_nm") or r.get("cust_nm") or "",
            "매출": round(amt),
        })
    if len(raw) >= PAGE_LIMIT:
        print(f"경고: {key_value} 조회 결과가 {PAGE_LIMIT}건에 닿았습니다. 일부가 빠졌을 수 있습니다.")
    return out


async def collect(days: int, months: int):
    today = datetime.now(KST).date()
    day_list = [today - timedelta(days=i) for i in range(1, days + 1)]
    month_list = [add_months(month_start(today), -i) for i in range(months)]
    async with async_playwright() as p:
        exe = CHROMIUM if Path(CHROMIUM).exists() else None
        browser = await p.chromium.launch(executable_path=exe)
        api = Intra(await login(browser))
        daily = []
        for d in day_list:
            daily += rows_of(await sales_range(api, d, d), "날짜", ymd(d))
        monthly = []
        for m in month_list:
            end = min(add_months(m, 1) - timedelta(days=1), today - timedelta(days=1))
            if end < m:
                continue
            monthly += rows_of(await sales_range(api, m, end), "월", m.strftime("%Y-%m"))
        await browser.close()
    return {
        "daily": {"dates": [ymd(d) for d in day_list], "rows": daily},
        "monthly": {"months": [m.strftime("%Y-%m") for m in month_list], "rows": monthly},
    }


def send(payload):
    url, token = os.environ.get("BOARD_URL", ""), os.environ.get("BOARD_TOKEN", "")
    if not url.startswith("https://script.google.com/") or not token:
        raise SystemExit("BOARD_URL(https://script.google.com/... /exec)과 BOARD_TOKEN 환경변수를 넣어주세요.")
    body = json.dumps({"token": token, **payload}, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json; charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.loads(r.read().decode())
    if not res.get("ok"):
        raise SystemExit(f"원보드 기록 실패: {res.get('error')}")
    print("원보드 기록 완료:", {k: v for k, v in res.items() if k != "ok"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="최근 62일 일별 + 7개월 월합계")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    days, months = (62, 7) if a.backfill else (3, 2)
    payload = asyncio.run(collect(days, months))
    print(f"수집: 일별 {len(payload['daily']['rows'])}행({days}일), 월별 {len(payload['monthly']['rows'])}행({months}개월)")
    if not a.dry_run:
        send(payload)


if __name__ == "__main__":
    main()
