"""원보드 인트라넷 보충 — MP AI에 아직 없는 매체(11번가·카카오·에이블리) 매출과, 근태·외근 일정을 인트라넷에서 가져와 원보드로 보낸다.

실적의 기본 출처는 MP AI(팀장 알리미가 수집)다. 이 스크립트는 6팀 인트라넷 매출 전체를 보내지만,
원보드가 시트 '설정' 탭의 '인트라넷보충매체'에 적힌 매체만 저장한다. MP AI로 옮길 때는 그 설정에서 매체를 지우면 되고,
보충할 매체가 하나도 남지 않으면 GitHub Actions 의 board-sync 워크플로를 꺼도 된다.

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
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect import (CHROMIUM, DEPT, KST, Intra, add_months, collect_fee_requests, collect_missing_info,  # noqa: E402
                     collect_transfers, login, month_start, sales_range, ymd)

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


PRIVATE_KINDS = {"지각", "조퇴", "결근"}  # 팀 전체가 아니라 본인·팀장에게만 보이게


def ymd8(s):
    s = re.sub(r"\D", "", s or "")
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) >= 8 else ""


def hm(s):
    s = re.sub(r"\D", "", s or "")
    return f"{s[:2]}:{s[2:4]}" if len(s) >= 4 else ""


async def collect_calendar(api, fr: date, to: date):
    """인트라넷 외근(C)·근태(B) 일정을 원보드 캘린더 형식으로. 반려 건은 뺀다."""
    out = []
    for gbn in ("C", "B"):
        rows = await api.post("/mng/job/schedule1_action.php", {
            "submitType": "select", "schd_gbn": gbn, "sh_date_fr": ymd(fr), "sh_date_to": ymd(to),
            "sh_dept_code": DEPT, "num_per_page": "500", "currPage": "1"})
        for r in rows:
            if r.get("schd_confirm") == "0":
                continue
            who = r.get("username") or ""
            if gbn == "C":
                start = ymd8(r.get("meet_date") or r.get("schd_date"))
                end = ymd8(r.get("meet_date2")) or start
                t1, t2 = hm(r.get("meet_time")), hm(r.get("meet_time2"))
                kind = (r.get("schd_trns_gbn_nm") or "외근").replace("외근-", "")
                out.append({"유형": "외근", "제목": f"{who} 외근 · {r.get('cust_nm') or ''}".strip(" ·"),
                            "시작일": start, "종료일": end, "시간": f"{t1}~{t2}" if t1 else "",
                            "대상": who, "메모": " / ".join(x for x in (kind, r.get("loc_name") or "") if x)})
            else:
                kind = r.get("schd_code_nm") or "근태"
                start, end = ymd8(r.get("schd_date")), ymd8(r.get("schd_date2"))
                t1, t2 = hm(r.get("schd_time")), hm(r.get("schd_time2"))
                full = (t1 in ("", "00:00") and t2 in ("", "23:59")) or (end and end != start)
                out.append({"유형": "개인" if kind in PRIVATE_KINDS else "근태", "제목": f"{who} {kind}",
                            "시작일": start, "종료일": end or start, "시간": "" if full else f"{t1}~{t2}",
                            "대상": who, "메모": ""})
    return [x for x in out if x["시작일"]]


async def collect(days: int, months: int):
    today = datetime.now(KST).date()
    day_list = [today - timedelta(days=i) for i in range(1, days + 1)]
    month_list = [add_months(month_start(today), -i) for i in range(months)]
    async with async_playwright() as p:
        exe = CHROMIUM if Path(CHROMIUM).exists() else None
        browser = await p.chromium.launch(executable_path=exe)
        ctx = await login(browser)
        api = Intra(ctx)
        daily = []
        for d in day_list:
            daily += rows_of(await sales_range(api, d, d), "날짜", ymd(d))
        cal_from, cal_to = today - timedelta(days=31), today + timedelta(days=62)
        calendar = await collect_calendar(api, cal_from, cal_to)
        monthly = []
        for m in month_list:
            end = min(add_months(m, 1) - timedelta(days=1), today - timedelta(days=1))
            if end < m:
                continue
            monthly += rows_of(await sales_range(api, m, end), "월", m.strftime("%Y-%m"))
        # 6팀 일일점검의 인트라 점검 3가지 → 원보드 '오늘 점검' 탭 (실패해도 매출 동기화는 계속)
        checks = {"date": ymd(today)}
        for key, job in (("transfers", lambda: collect_transfers(api, today)),
                         ("missing", lambda: collect_missing_info(ctx, today)),
                         ("fees", lambda: collect_fee_requests(api, today))):
            try:
                checks[key] = await job()
            except Exception as e:  # noqa: BLE001
                checks[key + "Error"] = str(e)[:200]
        await browser.close()
    return {
        "daily": {"dates": [ymd(d) for d in day_list], "rows": daily},
        "monthly": {"months": [m.strftime("%Y-%m") for m in month_list], "rows": monthly},
        "schedules": {"from": ymd(cal_from), "to": ymd(cal_to), "rows": calendar},
        "intraChecks": checks,
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
    print(f"수집: 일별 {len(payload['daily']['rows'])}행({days}일), 월별 {len(payload['monthly']['rows'])}행({months}개월), "
          f"근태·외근 {len(payload['schedules']['rows'])}건, 인트라 점검 " +
          ", ".join(f"{k} {len(v)}건" for k, v in payload["intraChecks"].items() if isinstance(v, list)))
    if not a.dry_run:
        send(payload)


if __name__ == "__main__":
    main()
