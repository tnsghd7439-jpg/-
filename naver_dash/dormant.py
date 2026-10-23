"""광고비를 3개월 넘게 쓰지 않은 휴면 계정 목록 (담당자별) → output/naver_dash/dormant-<날짜>.csv

    py -3 naver_dash\\dormant.py

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

STEPS = [(0, 90, None), (90, 180, "3~6개월"), (180, 270, "6~9개월"), (270, 365, "9~12개월")]


def idle_bucket(api, cid: str, y) -> str | None:
    """마지막으로 광고비가 나간 구간. 최근 90일에 광고비가 있으면 None(휴면 아님)."""
    ids = [c["nccCampaignId"] for c in api.get("/ncc/campaigns", customer_id=cid) or []]
    if not ids:
        return "1년 이상 (캠페인 없음)"
    for a, b, label in STEPS:
        if collect.spend(api, cid, ids, y - timedelta(days=b - 1), y - timedelta(days=a))[0]:
            return label
    return "1년 이상"


def main():
    data = json.loads((collect.OUT / "latest.json").read_text(encoding="utf-8"))
    y = datetime.fromisoformat(data["baseDate"]).date()
    cand = [a for a in data["accounts"] if not a.get("monthAvg") and not a.get("lastMonthAvg") and not a.get("yesterday")]
    print(f"계정 {len(data['accounts'])}개 중 이번 달·지난달 광고비 0원 {len(cand)}개를 1년치 조회합니다 ({data['baseDate']} 기준)")
    api, rows, lock, done = NaverAdsAPI(), [], threading.Lock(), [0]

    def work(a):
        try:
            b = idle_bucket(api, str(a["customerId"]), y)
        except Exception as e:  # noqa: BLE001 — 한 계정 실패가 전체를 멈추지 않게
            b = f"조회 실패: {str(e)[:80]}"
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
    print(f"\n휴면(3개월 이상 광고비 0원) {len(rows)}개 → {out}")
    by = {}
    for a, b in rows:
        for o in a["owners"] or ["미지정"]:
            by.setdefault(o, []).append(b)
    for o, bs in sorted(by.items()):
        cnt = {k: bs.count(k) for k in order if bs.count(k)}
        print(f"  {o}: {len(bs)}개 (" + ", ".join(f"{k} {v}" for k, v in cnt.items()) + ")")


if __name__ == "__main__":
    main()
