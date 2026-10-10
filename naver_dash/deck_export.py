"""성과 진단 덱 툴(SEARCH AD DECK TOOL)에 넣을 보고서 파일을 API 로 만든다.

신입이 다차원 보고서를 종류·기간별로 20개 넘게 받던 일을 대신한다.
결과 폴더를 덱 툴 '자료 올리기'에 통째로 끌어다 놓으면 된다. (스마트스토어 리뷰·상품목록 2개는 지금처럼 직접 받음)

API 보고서는 하루치씩만 만들어져서, 날짜별 원본을 output/naver_dash/reports/ 에 쌓아 두고 다시 받지 않는다.
보고서 생성(POST /stat-reports)만 하고 광고 설정은 바꾸지 않는다.

사용
  python3 naver_dash/deck_export.py --account 1736106 --start 2026-06-01 --end 2026-09-30
  (--account 는 광고계정번호, SA 고객ID, 계정 이름 중 아무거나)
"""
import argparse
import collections
import concurrent.futures
import csv
import io
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import collect  # noqa: E402  (OUT 경로·API 클라이언트 공용)
from naver_api import NaverAdsAPI  # noqa: E402

TYPES = ["AD_DETAIL", "AD_CONVERSION_DETAIL", "EXPKEYWORD", "SHOPPINGKEYWORD_DETAIL",
         "SHOPPINGKEYWORD_CONVERSION_DETAIL", "CRITERION", "CRITERION_CONVERSION"]
CAMP_TP = {"WEB_SITE": "파워링크", "SHOPPING": "쇼핑검색", "BRAND_SEARCH": "브랜드검색",
           "POWER_CONTENTS": "파워컨텐츠", "PLACE": "플레이스"}
DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
GENDER = {"GNF": "여성", "GNM": "남성"}
METRICS = ["노출수", "클릭수", "총비용", "총 전환수", "구매완료 전환수", "구매완료 전환매출액", "평균노출순위"]


# ---------------------------------------------------------------- 원본 보고서 (날짜별 캐시)

def report_rows(api, cid, tp: str, day: date) -> list:
    f = collect.OUT / "reports" / str(cid) / tp / f"{day:%Y%m%d}.tsv"
    if f.exists():
        text = f.read_text(encoding="utf-8")
    else:
        try:
            job = api.create_report(tp, f"{day:%Y%m%d}", cid)
        except RuntimeError as e:
            if '"code":10004' not in str(e):  # 10004 = 그날 그 보고서에 실적 없음 → 빈 날로 저장
                raise
            job = None
        for _ in range(60 if job else 0):
            j = api.get(f"/stat-reports/{job['reportJobId']}", customer_id=cid)
            if j.get("status") in ("BUILT", "NONE", "ERROR", "AGGREGATING_FAIL"):
                break
            time.sleep(2)
        if job is None:
            text = ""
        elif j.get("status") == "BUILT" and j.get("downloadUrl"):
            text = api.download(j["downloadUrl"], cid)
        elif j.get("status") == "NONE":  # 그날 실적 없음
            text = ""
        else:
            raise RuntimeError(f"{tp} {day} 보고서 상태 {j.get('status')}")
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    return [line.split("\t") for line in text.splitlines() if line.strip()]


def fetch_all(api, cid, start: date, end: date, workers: int) -> dict:
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    jobs = [(tp, d) for d in days for tp in TYPES]
    out = {tp: {} for tp in TYPES}
    done = [0]

    failed = []

    def one(job):
        tp, d = job
        for attempt in range(2):
            try:
                out[tp][d] = report_rows(api, cid, tp, d)
                break
            except Exception as e:  # noqa: BLE001 — 한 날짜 실패로 전체를 멈추지 않는다 (캐시 안 됨 → 다음 실행 때 재시도)
                if attempt:
                    failed.append(f"{tp} {d}: {str(e)[:80]}")
        done[0] += 1
        if done[0] % 50 == 0:
            print(f"  보고서 {done[0]}/{len(jobs)}", file=sys.stderr, flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, jobs))
    if failed:
        print(f"  못 받은 보고서 {len(failed)}개 (다시 실행하면 그것만 다시 받음): " + "; ".join(failed[:5]), file=sys.stderr)
    return out


# ---------------------------------------------------------------- 이름표 (캠페인·광고그룹·상품)

def names(api, cid):
    camps, groups, shop, g2c = {}, {}, [], {}
    for c in api.get("/ncc/campaigns", customer_id=cid) or []:
        camps[c["nccCampaignId"]] = (c.get("name"), CAMP_TP.get(c.get("campaignTp"), c.get("campaignTp")))
        for g in api.get("/ncc/adgroups", {"nccCampaignId": c["nccCampaignId"]}, customer_id=cid) or []:
            groups[g["nccAdgroupId"]] = g.get("name")
            g2c[g["nccAdgroupId"]] = c["nccCampaignId"]
            if c.get("campaignTp") != "SHOPPING":
                continue
            for a in api.get("/ncc/ads", {"nccAdgroupId": g["nccAdgroupId"]}, customer_id=cid) or []:
                rd = a.get("referenceData") or {}
                if rd.get("mallProductId"):
                    shop.append([g["nccAdgroupId"], a["nccAdId"], rd.get("id", ""), rd["mallProductId"],
                                 rd.get("productName") or rd.get("productTitle", ""), rd.get("lowPrice", ""),
                                 rd.get("mallProductUrl", "")])
    return camps, groups, shop, g2c


# ---------------------------------------------------------------- 덱 툴 형식으로 집계

def mon(d: str) -> str:
    return f"{d[:4]}.{d[4:6]}"


class Agg:
    """키별 지표 합계. rank 는 노출 가중 합(순위x노출)으로 모았다가 마지막에 나눈다."""
    def __init__(self):
        self.v = collections.defaultdict(lambda: [0.0] * 7)  # imp clk cost conv buy rev rankw

    def add(self, key, imp=0, clk=0, cost=0, conv=0, buy=0, rev=0, rankw=0):
        x = self.v[key]
        for i, n in enumerate((imp, clk, cost, conv, buy, rev, rankw)):
            x[i] += n

    def rows(self):
        for k, x in sorted(self.v.items()):
            rank = round(x[6] / x[0], 1) if x[0] and x[6] else ""
            yield list(k) + [int(x[0]), int(x[1]), round(x[2]), int(x[3]), int(x[4]), round(x[5]), rank]


def f(x) -> float:
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


def build(R: dict, camps: dict, groups: dict, g2c: dict):
    cn = lambda c: camps.get(c, (c, ""))[0]  # 지금은 없는 캠페인은 ID 로 남긴다
    ct = lambda c: camps.get(c, ("", ""))[1]
    gn = lambda g: groups.get(g, g)
    main, search, gender, age, dow = Agg(), Agg(), Agg(), Agg(), Agg()

    # AD_DETAIL: 날짜 고객 캠페인 그룹 키워드 소재 비즈채널 시간대 지역 매체 PC/모바일 노출 클릭 비용 순위합 조회
    for d, rows in R["AD_DETAIL"].items():
        for x in rows:
            m, imp, clk, cost, rk = mon(x[0]), f(x[11]), f(x[12]), f(x[13]), f(x[14])
            main.add((m, ct(x[2]), cn(x[2]), gn(x[3]), x[9], x[5]), imp, clk, cost, rankw=rk)
            dow.add((m, DAYS[d.weekday()], f"{int(x[7]):02d}시"), imp, clk, cost, rankw=rk)
    # AD_CONVERSION_DETAIL: ... 시간대(7) 지역 매체(9) PC/모바일 전환방식 전환유형(12) 전환수(13) 전환매출(14)
    for d, rows in R["AD_CONVERSION_DETAIL"].items():
        for x in rows:
            m, n, rev, buy = mon(x[0]), f(x[13]), f(x[14]), x[12] == "purchase"
            main.add((m, ct(x[2]), cn(x[2]), gn(x[3]), x[9], x[5]), conv=n, buy=n if buy else 0, rev=rev if buy else 0)
            dow.add((m, DAYS[d.weekday()], f"{int(x[7]):02d}시"), conv=n, buy=n if buy else 0, rev=rev if buy else 0)
    # 쇼핑검색 검색어: AD_DETAIL 과 같은 열 순서, 4번째가 검색어
    for rows in R["SHOPPINGKEYWORD_DETAIL"].values():
        for x in rows:
            search.add((mon(x[0]), ct(x[2]), cn(x[2]), gn(x[3]), x[4]), f(x[11]), f(x[12]), f(x[13]), rankw=f(x[14]))
    for rows in R["SHOPPINGKEYWORD_CONVERSION_DETAIL"].values():
        for x in rows:
            n, buy = f(x[13]), x[12] == "purchase"
            search.add((mon(x[0]), ct(x[2]), cn(x[2]), gn(x[3]), x[4]), conv=n, buy=n if buy else 0, rev=f(x[14]) if buy else 0)
    # 파워링크 검색어: 날짜 고객 캠페인 그룹 검색어 매체 PC/모바일 ? 노출 클릭 비용 ? (전환은 API 에 없음)
    for rows in R["EXPKEYWORD"].values():
        for x in rows:
            search.add((mon(x[0]), ct(x[2]), cn(x[2]), gn(x[3]), x[4]), f(x[8]), f(x[9]), f(x[10]))
    # 성별·연령: 날짜 고객 "그룹~코드" PC/모바일 노출 클릭 비용 / 전환: ... 전환유형(5) 전환수(6) 매출(7)
    def seg(code):
        if code in GENDER:
            return "gender", GENDER[code]
        if code.startswith("AG") and len(code) == 6 and code[2:].isdigit():
            return "age", f"{code[2:4]}세 ~ {code[4:6]}세"
        return None, None
    for rows in R["CRITERION"].values():
        for x in rows:
            grp, code = (x[2].split("~") + [""])[:2]
            kind, lab = seg(code)
            if kind:
                c = g2c.get(grp, "")
                (gender if kind == "gender" else age).add((mon(x[0]), ct(c), cn(c), gn(grp), lab), f(x[4]), f(x[5]), f(x[6]))
    for rows in R["CRITERION_CONVERSION"].values():
        for x in rows:
            grp, code = (x[2].split("~") + [""])[:2]
            kind, lab = seg(code)
            if kind:
                n, buy = f(x[6]), x[5] == "purchase"
                c = g2c.get(grp, "")
                (gender if kind == "gender" else age).add((mon(x[0]), ct(c), cn(c), gn(grp), lab),
                                                          conv=n, buy=n if buy else 0, rev=f(x[7]) if buy else 0)
    return main, search, gender, age, dow


def write_csv(path: Path, title: str, head: list, rows) -> int:
    buf = io.StringIO()
    buf.write(title + "\n")
    w = csv.writer(buf)
    w.writerow(head + METRICS)
    n = 0
    for r in rows:
        w.writerow(r)
        n += 1
    path.write_text("﻿" + buf.getvalue(), encoding="utf-8")
    return n


def find_account(api, key: str):
    rows = []
    for m in (api.get("/manager-accounts", {"size": 1000}) or {}).get("content", []):
        rows += (api.get(f"/manager-accounts/{m['managerAccountNo']}/child-ad-accounts", {"size": 1000}) or {}).get("content", [])
    for a in rows:
        if key in (str(a["adAccountNo"]), str(a["customerId"]), a.get("adAccountName")):
            return a
    raise SystemExit(f"계정을 찾지 못했습니다: {key}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--account", required=True)
    ap.add_argument("--start", required=True, help="YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)

    api = NaverAdsAPI()
    acc = find_account(api, args.account)
    cid, name = str(acc["customerId"]), acc.get("adAccountName")
    t = time.time()
    print(f"{name} ({acc['adAccountNo']}) {start}~{end} 보고서 받는 중…", file=sys.stderr)
    R = fetch_all(api, cid, start, end, args.workers)
    camps, groups, shop, g2c = names(api, cid)
    # 보고서에는 있는데 목록에 없는 광고그룹(삭제 등) → 하나씩 조회해 이름·캠페인을 채운다
    seen = {x[3] for rows in R["AD_DETAIL"].values() for x in rows}
    seen |= {x[2].split("~")[0] for rows in R["CRITERION"].values() for x in rows}
    for gid in sorted(seen - set(groups)):
        try:
            g = api.get(f"/ncc/adgroups/{gid}", customer_id=cid) or {}
            groups[gid], g2c[gid] = g.get("name") or gid, g.get("nccCampaignId", "")
        except RuntimeError:
            pass
    main_, search, gender, age, dow = build(R, camps, groups, g2c)

    out = collect.OUT / "deck_export" / f"{acc['adAccountNo']}_{start:%Y%m%d}-{end:%Y%m%d}"
    out.mkdir(parents=True, exist_ok=True)
    per = f"{start:%Y.%m.%d.}~{end:%Y.%m.%d.}"
    base = ["월별", "캠페인유형", "캠페인", "광고그룹"]
    n = {
        "매체": write_csv(out / "1_매체_소재.csv", f"매체 보고서({per})", base + ["매체이름", "소재"], main_.rows()),
        "검색어": write_csv(out / "2_검색어.csv", f"검색어 보고서({per})", base + ["검색어"], search.rows()),
        "성별": write_csv(out / "3_성별.csv", f"성별 보고서({per})", base + ["성별"], gender.rows()),
        "연령대": write_csv(out / "4_연령대.csv", f"연령대 보고서({per})", base + ["연령대"], age.rows()),
        "요일시간": write_csv(out / "5_요일_시간대.csv", f"요일 시간대 보고서({per})", ["월별", "요일별", "시간대별"], dow.rows()),
    }
    with open(out / "6_쇼핑검색_소재목록.tsv", "w", encoding="utf-8") as fp:
        fp.write("\n".join("\t".join(map(str, r)) for r in shop))
    n["소재목록"] = len(shop)
    print(f"완료 {time.time() - t:.0f}초 → {out}")
    print("행 수: " + ", ".join(f"{k} {v}" for k, v in n.items()))
    return out


if __name__ == "__main__":
    main()
