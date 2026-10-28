"""광고비를 3개월 넘게 쓰지 않은 휴면 계정 목록 (담당자별) → output/naver_dash/dormant-<날짜>.csv

    py -3 naver_dash\\dormant.py           (바로 실행)
    py -3 naver_dash\\dormant.py --weekly  (run_daily.bat 이 매일 호출 → 그 주에 아직 안 만들었을 때만 실행.
                                          월요일에 PC 가 꺼져 있었으면 그 주 첫 실행 때 만든다)

마지막 수집 결과(latest.json)의 계정·담당자를 쓰고, 이번 달·지난달 광고비가 0원인 계정만
네이버 API 로 최근 1년을 90일씩 거슬러 올라가며 광고비가 마지막으로 나간 구간을 찾는다(조회만, 변경 없음).
- 3~6개월 / 6~9개월 / 9~12개월 / 1년 이상 미집행 으로 나눈다
- 삭제한 캠페인의 광고비는 API 에 남지 않아 실제보다 오래 쉰 것으로 보일 수 있다
엑셀에서 바로 열리게 UTF-8(BOM) CSV 로 저장한다.
"""
import concurrent.futures
import csv
import json
import sys
import threading
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import collect  # noqa: E402
from naver_api import NaverAdsAPI  # noqa: E402

OLD_ERR = {}  # 오래된 기간 조회 오류(첫 1건)를 요약에 표시
STEPS = [(0, 90, None), (90, 180, "3~6개월"), (180, 270, "6~9개월"), (270, 360, "9~12개월")]  # 네이버 /stats 는 한 번에 92일까지만 (11004)


def idle_bucket(api, cid: str, y) -> str | None:
    """마지막으로 광고비가 나간 구간. 최근 90일에 광고비가 있으면 None(휴면 아님)."""
    ids = [c["nccCampaignId"] for c in api.get("/ncc/campaigns", customer_id=cid) or []]
    if not ids:
        return "1년 이상 (캠페인 없음)"
    for a, b, label in STEPS:
        try:
            got = collect.spend(api, cid, ids, y - timedelta(days=b - 1), y - timedelta(days=a))[0]
        except Exception as e:  # noqa: BLE001
            if a == 0:
                raise
            # 오래된 기간은 API 가 거부할 수 있음 → 조회된 데까지만 판단
            OLD_ERR.setdefault("msg", str(e)[:200])
            return f"{a // 30}개월 이상 (그 이전은 조회 불가)"
        if got:
            return label
    return "1년 이상"


ORDER = ["3~6개월", "6~9개월", "9~12개월", "1년 이상", "1년 이상 (캠페인 없음)"]


def notify(csv_path: Path) -> None:
    """휴면 목록 요약을 구글챗 팀방에 보낸다 (담당자별 개수 + 재라이브 우선인 3~6개월 계정 이름)."""
    import os
    import urllib.request
    url = os.environ.get("NAVER_GCHAT_WEBHOOK")
    if not url:
        print("구글챗 공지 생략: NAVER_GCHAT_WEBHOOK 환경변수가 없습니다")
        return
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    by = {}
    for r in rows:
        for o in (r["담당"] or "미지정").split(", "):
            by.setdefault(o, []).append(r)
    latest = json.loads((collect.OUT / "latest.json").read_text(encoding="utf-8"))
    me = next(iter((latest.get("mpai") or {}).get("scopes") or []), {}).get("owner")  # 팀장 맨 위
    day = csv_path.stem.replace("dormant-", "") if csv_path.stem.startswith("dormant-") else latest["baseDate"]
    lines = [f"*[휴면 계정 점검] {day} 기준 · 네이버 SA 광고비 3개월 이상 0원*", f"전체 {len(rows)}개", ""]
    for o in sorted(by, key=lambda o: (o != me, o)):
        rs = by[o]
        kinds = sorted({r["미집행 기간"] for r in rs}, key=lambda k: (ORDER.index(k) if k in ORDER else 9, k))
        lines.append(f"*{o}* : {len(rs)}개 (" + " · ".join(f"{k} {sum(r['미집행 기간'] == k for r in rs)}" for k in kinds) + ")")
        hot = [r["광고주"] for r in rs if r["미집행 기간"] == "3~6개월"]
        if hot:
            lines.append(f"    ↳ 재라이브 우선(3~6개월): {', '.join(hot[:10])}" + (f" 외 {len(hot) - 10}개" if len(hot) > 10 else ""))
    lines += ["", "GFA·쿠팡 등 다른 매체 집행 여부는 점검판에서 함께 확인하세요."]
    req = urllib.request.Request(url, json.dumps({"text": "\n".join(lines)}).encode("utf-8"),
                                 {"Content-Type": "application/json; charset=UTF-8"})
    try:
        urllib.request.urlopen(req, timeout=30).read()
        print("구글챗 휴면 공지 보냄")
    except Exception as e:  # noqa: BLE001
        print(f"구글챗 휴면 공지 실패: {e}")


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--weekly", action="store_true", help="이번 주에 이미 만들었으면 건너뜀")
    ap.add_argument("--notify-only", action="store_true", help="새로 조회하지 않고 최신 dormant.csv 로 구글챗 공지만")
    ap.add_argument("--notify", action="store_true", help="목록을 만든 뒤 구글챗에도 공지 (기본은 공지 안 함)")
    args = ap.parse_args()
    if args.notify_only:
        notify(collect.OUT / "dormant.csv")
        return
    mark = collect.OUT / "dormant_week.txt"
    week = "{}-W{:02d}".format(*datetime.now(collect.KST).isocalendar()[:2])
    if args.weekly and mark.exists() and mark.read_text(encoding="utf-8").strip() == week:
        print(f"휴면 계정 목록: 이번 주({week}) 이미 만듦 — 건너뜀")
        return
    data = json.loads((collect.OUT / "latest.json").read_text(encoding="utf-8"))
    y = datetime.fromisoformat(data["baseDate"]).date()
    cand = [a for a in data["accounts"] if not a.get("monthAvg") and not a.get("lastMonthAvg") and not a.get("yesterday")]
    print(f"계정 {len(data['accounts'])}개 중 이번 달·지난달 광고비 0원 {len(cand)}개를 1년치 조회합니다 ({data['baseDate']} 기준)")
    api, rows, lock, done = NaverAdsAPI(), [], threading.Lock(), [0]

    def work(a):
        try:
            b = idle_bucket(api, str(a["customerId"]), y)
        except Exception as e:  # noqa: BLE001 — 한 계정 실패가 전체를 멈추지 않게
            b = f"조회 실패(휴면 여부 모름): {str(e)[:80]}"
        with lock:
            done[0] += 1
            print(f"[{done[0]}/{len(cand)}] {a['name']}", file=sys.stderr, flush=True)
            if b:
                rows.append((a, b))

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(work, cand))

    order = {"3~6개월": 0, "6~9개월": 1, "9~12개월": 2, "1년 이상": 3, "1년 이상 (캠페인 없음)": 4}
    rows.sort(key=lambda r: (r[0]["owners"][0] if r[0]["owners"] else "", order.get(r[1], 9), r[0]["name"]))
    out = collect.OUT / f"dormant-{data['baseDate']}.csv"
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["담당", "광고주", "CustomerID", "광고계정번호", "미집행 기간", "비즈머니 잔액", "마지막 수정일", "켜진 캠페인"])
        for a, b in rows:
            w.writerow([", ".join(a["owners"]), a["name"], a["customerId"], a.get("adAccountNo", ""), b,
                        a.get("bizmoney", ""), a.get("lastEdit") or "", (a.get("campaigns") or {}).get("on", "")])
    (collect.OUT / "dormant.csv").write_bytes(out.read_bytes())  # 항상 같은 이름으로도 (즐겨찾기용)
    mark.write_text(week, encoding="utf-8")
    print(f"\n휴면(3개월 이상 광고비 0원) {len(rows)}개 → {out} (최신본: dormant.csv)")
    by = {}
    for a, b in rows:
        for o in a["owners"] or ["미지정"]:
            by.setdefault(o, []).append(b)
    if OLD_ERR:
        print(f"  ※ 오래된 기간 조회 오류(예): {OLD_ERR['msg']}")
    for o, bs in sorted(by.items()):
        keys = sorted(set(bs), key=lambda k: (order.get(k, 9), k))  # 조회 실패 등 다른 값도 빠짐없이
        cnt = {k: bs.count(k) for k in keys}
        print(f"  {o}: {len(bs)}개 (" + ", ".join(f"{k} {v}" for k, v in cnt.items()) + ")")
    if args.notify:
        notify(out)


if __name__ == "__main__":
    main()
