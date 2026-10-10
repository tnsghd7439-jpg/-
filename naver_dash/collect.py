"""네이버 검색광고 팀장 대시보드 수집기 (조회 전용, 계정 변경 없음).

관리계정에 연결된 하위 광고계정을 돌며 아래를 점검하고, 결과를 대시보드 HTML 로 만든다.
  1. 팀원별 담당 계정 수 / 어제 총 광고비
     - 어제 광고비가 직전 7일 평균 대비 10% 이상 감소한 광고주
     - 이번 달 일평균 소진이 전월 일평균과 크게 차이 나는 광고주
  2. 비즈머니 부족 (잔액 ÷ 최근 7일 일평균 = 남은 일수)
  3. 광고 꺼짐 (평소 소진 계정이 어제 0원)
  5. 이탈 위험: 광고비 감소 / 비즈머니 바닥 반복 / 30일 이상 수정 없음 중 2개 이상
  4. 관리 경보: 구매완료 수익률 하락 / 광고비 하락 / 수정이력 없음 중 2개 이상 적색, 1개 황색

환경변수: NAVER_API_KEY, NAVER_SECRET_KEY, NAVER_CUSTOMER_ID (naver_api.py 참고)
팀원 매칭: naver_dash/team.json (team.example.json 참고, 커밋 금지)

사용
  python3 naver_dash/collect.py              # 수집 + output/naver_dash/ 에 JSON·HTML 저장
  python3 naver_dash/collect.py --limit 3    # 앞 3개 계정만 (시험용)
  python3 naver_dash/collect.py --demo       # 키 없이 가상 데이터로 화면만 확인
"""
import argparse
import concurrent.futures
import threading
import calendar
import json
import os
import random
import time
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# 결과 폴더. 회사 PC 에서 다른 위치(공유 폴더 등)에 두려면 환경변수 NAVER_DASH_OUT 으로 지정
OUT = Path(os.environ.get("NAVER_DASH_OUT") or ROOT.parent / "output" / "naver_dash")
KST = timezone(timedelta(hours=9))

# 점검 기준 (팀 합의에 따라 조정)
MIN_DAILY_AVG = 10_000      # 직전 7일 일평균 1만원 미만 계정은 1·3번 경고에서 제외
DROP_RATIO = 0.9            # 어제 < 직전 7일 평균 x 0.9 → 10% 이상 감소
MONTH_GAP = 0.5             # 이번 달 일평균이 전월 일평균 대비 ±50% 이상 → 큰 차이
BIZ_URGENT_DAYS = 1         # 비즈머니 남은 일수 1일 미만 → 긴급
BIZ_WARN_DAYS = 3           # 3일 미만 → 주의
# 관리 경보: 아래 3가지 중 2개 이상 → 적색, 1개 → 황색 (7일 일평균 MIN_DAILY_AVG 미만 계정 제외)
ROAS_DROP = 0.2             # 1) 최근 7일 구매완료 수익률 < 지난달 x 0.8
SPEND_DROP = 0.2            # 2) 최근 7일 일평균 광고비 < 지난달 일평균 x 0.8
NO_EDIT_DAYS = 7            # 3) 캠페인·광고그룹 어디에도 최근 7일 수정 기록 없음
# 이탈 위험: 아래 3가지 중 2개 이상 (지난달 또는 최근 7일 일평균이 MIN_DAILY_AVG 이상인 계정)
CHURN_SPEND_DROP = 0.3      # 1) 최근 7일 일평균 광고비 < 지난달 일평균 x 0.7
CHURN_ZERO_DAYS = 2         # 2) 최근 30일 중 비즈머니가 바닥난 날이 2일 이상 (미충전 반복)
CHURN_NO_EDIT_DAYS = 30     # 3) 캠페인·광고그룹 30일 이상 수정 없음
BUDGET_HIT = 0.95           # 하루 광고비가 일예산의 95% 이상이면 그날 예산을 다 쓴 것으로 본다
WITH_HOURS = True           # 예산 소진 시각 (시간대별 보고서 생성 필요, --no-hours 로 끔)
# 매일 자동 실행용
WORKERS = 4                 # 동시에 수집할 계정 수 (네이버 호출 한도에 걸리면 줄인다)
DORMANT_RECHECK_DAYS = 7    # 휴면 계정은 가볍게(최근 14일 광고비만) 확인하고, 상세 수집은 7일마다
HOURLY_KEEP_DAYS = 15       # 시간대별 보고서 캐시 보관 일수


def ymd(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def periods(today: date) -> dict:
    y = today - timedelta(days=1)
    m0 = y.replace(day=1)
    lm_end = m0 - timedelta(days=1)
    lm0 = lm_end.replace(day=1)
    return {
        "yesterday": (y, y),
        "prev7": (y - timedelta(days=7), y - timedelta(days=1)),
        "month": (m0, y),
        "last_month": (lm0, lm_end),
        "last7": (y - timedelta(days=6), y),
        "last14": (y - timedelta(days=13), y),
    }


def load_team() -> dict:
    p = ROOT / "team.json"
    if not p.exists():
        return {"scope": [], "exclude": [], "fallback": "미지정", "managerPrefix": "", "managers": {}, "members": {}, "accounts": {}}
    d = json.loads(p.read_text(encoding="utf-8"))
    return {"scope": [str(x) for x in d.get("scope", [])], "exclude": [str(x) for x in d.get("exclude", [])],
            "fallback": d.get("fallback") or "미지정",
            "managerPrefix": d.get("managerPrefix") or "",
            "managers": {str(k): v for k, v in d.get("managers", {}).items()},
            "members": d.get("members", {}),
            "accounts": {str(k): v for k, v in d.get("accounts", {}).items()}}


# ---------------------------------------------------------------- 수집

def spend(api, cid, camp_ids, since: date, until: date) -> tuple:
    """캠페인 합계 (광고비 salesAmt VAT 포함, 구매완료 전환매출, 구매완료 전환수).

    convAmt·ccnt 는 장바구니·회원가입 등 모든 전환을 합친 값이라 쓰지 않고 구매완료(purchase*) 만 본다.
    """
    sales = conv = cnt = 0
    byid = {}
    for i in range(0, len(camp_ids), 50):
        res = api.get("/stats", {
            "ids": ",".join(camp_ids[i:i + 50]),
            "fields": '["salesAmt","purchaseConvAmt","purchaseCcnt"]',
            "timeRange": json.dumps({"since": ymd(since), "until": ymd(until)}),
        }, customer_id=cid)
        rows = res.get("data", []) if isinstance(res, dict) else (res or [])
        sales += sum(int(r.get("salesAmt") or 0) for r in rows)
        conv += sum(int(r.get("purchaseConvAmt") or 0) for r in rows)
        cnt += sum(int(r.get("purchaseCcnt") or 0) for r in rows)
        byid.update({r["id"]: (int(r.get("salesAmt") or 0), int(r.get("purchaseConvAmt") or 0)) for r in rows})
    return sales, conv, cnt, byid


def roas(sc: tuple):
    """구매완료 광고수익률(%) = 구매완료 전환매출 / 광고비 x 100. 광고비가 없으면 None."""
    return round(sc[1] / sc[0] * 100) if sc[0] else None


def kst(ts: str) -> str:
    """editTm(UTC, ...Z) → 'YYYY-MM-DD HH:MM' 한국 시간."""
    t = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(KST)
    return t.strftime("%Y-%m-%d %H:%M")


def last_edit(api, cid, camps):
    """캠페인·광고그룹 중 가장 최근 수정 (KST 시각, 대상 정보). 키워드·소재는 조회량이 커서 보지 않는다.

    대상 정보의 path 는 광고센터에서 그 캠페인·광고그룹을 여는 주소 조각이다.
    """
    best, what = None, None
    for c in camps:
        if c.get("status") == "DELETED":
            continue
        if c.get("editTm") and (best is None or c["editTm"] > best):
            best, what = c["editTm"], {"label": f"캠페인 {c.get('name')}", "path": f"/sa/campaigns/{c['nccCampaignId']}"}
        for g in api.get("/ncc/adgroups", {"nccCampaignId": c["nccCampaignId"]}, customer_id=cid) or []:
            if g.get("status") != "DELETED" and g.get("editTm") and (best is None or g["editTm"] > best):
                best, what = g["editTm"], {"label": f"광고그룹 {g.get('name')}", "path": f"/sa/adgroups/{g['nccAdgroupId']}"}
    return (kst(best), what) if best else (None, None)


def campaign_perf(camps, s, P) -> list:
    """캠페인별 최근 7일 vs 지난달 일평균 광고비·구매 ROAS (경보 원인 확인용, 광고비 있는 캠페인만)."""
    d7, dlm = 7, P["last_month"][1].day
    out = []
    for c in camps:
        a = s["last7"][3].get(c["nccCampaignId"], (0, 0))
        b = s["last_month"][3].get(c["nccCampaignId"], (0, 0))
        if not (a[0] or b[0]):
            continue
        out.append({"id": c["nccCampaignId"], "name": c.get("name"), "type": c.get("campaignTp"),
                    "avg7": round(a[0] / d7), "avgLM": round(b[0] / dlm),
                    "roas7": roas(a), "roasLM": roas(b),
                    # 구매매출 일평균이 지난달보다 얼마나 줄었나 (원인 캠페인 정렬용)
                    "convLoss": round(b[1] / dlm - a[1] / d7)})
    return sorted(out, key=lambda x: -x["convLoss"])


def budget_hits(api, cid, camps, s, P) -> list:
    """일예산을 쓰는 캠페인 중 최근 7일 예산을 다 쓴 날 (하루 광고비 >= 일예산 x BUDGET_HIT)."""
    since, until = P["last7"]
    out = []
    for c in camps:
        bud = c.get("dailyBudget") or 0
        if not (c.get("useDailyBudget") and bud and s["last7"][3].get(c["nccCampaignId"], (0,))[0]):
            continue
        res = api.get("/stats", {"id": c["nccCampaignId"], "fields": '["salesAmt"]', "timeIncrement": "1",
                                 "timeRange": json.dumps({"since": ymd(since), "until": ymd(until)})}, customer_id=cid)
        days = [x["dateStart"] for x in res.get("data", []) if (x.get("salesAmt") or 0) >= bud * BUDGET_HIT]
        if days:
            out.append({"id": c["nccCampaignId"], "name": c.get("name"), "budget": bud, "hitDays": len(days),
                        "days": sorted(days), "lastHit": max(days),
                        "limitedNow": c.get("statusReason") == "CAMPAIGN_LIMITED_BY_BUDGET"})
    return sorted(out, key=lambda x: -x["hitDays"])


def hourly_cost(api, cid, day: str) -> dict:
    """AD_DETAIL 보고서로 하루 캠페인별 시간대(0~23시) 광고비. 보고서 생성(POST)만 하고 광고 설정은 바꾸지 않는다."""
    job = api.create_report("AD_DETAIL", day.replace("-", ""), cid)
    for _ in range(40):
        j = api.get(f"/stat-reports/{job['reportJobId']}", customer_id=cid)
        if j.get("status") in ("BUILT", "NONE", "ERROR", "AGGREGATING_FAIL"):
            break
        time.sleep(3)
    if j.get("status") != "BUILT" or not j.get("downloadUrl"):
        return {}
    out = {}
    # 열: 날짜, 고객, 캠페인, 그룹, 키워드, 소재, 비즈채널, 시간대(0~23), 지역, 매체, PC/모바일, 노출, 클릭, 비용(VAT 포함), 순위합, 조회
    for line in api.download(j["downloadUrl"], cid).splitlines():
        x = line.split("\t")
        if len(x) > 13 and x[7].isdigit():
            out.setdefault(x[2], [0.0] * 24)[int(x[7])] += float(x[13] or 0)
    return out


def add_off_hours(api, cid, hits: list) -> None:
    """예산 소진일마다 그 캠페인의 마지막 광고비 발생 시간대 = 예산이 바닥나 꺼진 시간대. 평균을 hits 에 채운다."""
    days = sorted({d for b in hits for d in b["days"]})
    hourly = {}
    for d in days:
        f = OUT / "hourly" / str(cid) / f"{d}.json"
        if f.exists():
            hourly[d] = json.loads(f.read_text(encoding="utf-8"))
            continue
        try:
            hourly[d] = hourly_cost(api, cid, d)
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(json.dumps(hourly[d]), encoding="utf-8")
        except Exception:  # noqa: BLE001 — 한 날짜 보고서 실패는 그 날짜만 비운다 (캐시 안 함 → 다음 실행 때 재시도)
            hourly[d] = {}
    for b in hits:
        hrs = []
        for d in b["days"]:
            h = hourly[d].get(b["id"])
            if h and any(h):
                hrs.append(max(i for i, v in enumerate(h) if v > 0))
        if hrs:
            avg = sum(hrs) / len(hrs)
            b["offHours"] = hrs
            b["avgHitTime"] = f"{round(avg)}시"  # 시간대 단위면 충분 (분 단위 불필요)
            b["hitRange"] = f"{min(hrs)}~{max(hrs)}시" if len(set(hrs)) > 1 else f"{hrs[0]}시"


def bizmoney_zero_days(api, cid, until: date) -> tuple:
    """최근 30일 중 비즈머니가 바닥난(하루 마감 잔액 0 이하) 날 수, 마지막 충전일."""
    rng = {"searchStartDt": (until - timedelta(days=29)).strftime("%Y%m%d"), "searchEndDt": until.strftime("%Y%m%d")}
    period = api.get("/billing/bizmoney/histories/period", rng, customer_id=cid) or []
    zero = sum(1 for x in period if (x.get("refundableAmt") or 0) + (x.get("nonRefundableAmt") or 0) <= 0
               and (x.get("useRefundableAmt") or 0) + (x.get("useNonRefundableAmt") or 0) > 0)
    charge = api.get("/billing/bizmoney/histories/charge", rng, customer_id=cid) or []
    last = max((x["statDt"] for x in charge if x.get("statDt")), default=None)
    return zero, (datetime.fromtimestamp(last / 1000, KST).strftime("%Y-%m-%d") if last else None)


def owner_of(api, acc, team, direct) -> list:
    """담당 팀원: accounts 직접 지정 → 소속 관리계정(managers) → 구성원 네이버ID(members) → fallback 순.

    구성원 조회(/ad-accounts/{no}/members)는 X-Customer 에 키 발급 계정 ID 를 넣어야 하고,
    키 발급 계정이 그 광고계정의 직접 구성원일 때만 된다. 관리계정 하위 계정은 403 이라 건너뛴다.
    """
    cid = str(acc["customerId"])
    if cid in team["accounts"]:
        return [team["accounts"][cid]]
    names = {team["managers"][str(m)] for m in acc["_managers"] if str(m) in team["managers"]}
    # 팀원 관리계정 이름 규칙 "6팀 홍길동" → 홍길동 (신입이 생겨도 team.json 수정 불필요)
    pre = team["managerPrefix"]
    if not names and pre:
        names = {n[len(pre):].strip() for n in acc["_managerNames"] if n and n.startswith(pre) and n[len(pre):].strip()}
    if not names and team["members"] and acc["adAccountNo"] in direct:
        try:
            members = api.get(f"/ad-accounts/{acc['adAccountNo']}/members") or []
        except RuntimeError:
            members = []
        names = {team["members"][m["naverId"]] for m in members if m.get("naverId") in team["members"]}
    return sorted(names) or [team["fallback"]]


def is_dormant(r: dict) -> bool:
    return not (r.get("yesterday") or r.get("avg7") or r.get("monthAvg") or r.get("lastMonthAvg"))


def light_check(api, acc, prev: dict, P, base: str):
    """전날 휴면이었고 상세 수집한 지 DORMANT_RECHECK_DAYS 안 됐으면, 최근 14일 광고비만 보고 0원이면 전날 결과를 재사용."""
    if not (prev and is_dormant(prev) and prev.get("fullAt")):
        return None
    if (date.fromisoformat(base) - date.fromisoformat(prev["fullAt"])).days >= DORMANT_RECHECK_DAYS:
        return None
    cid = str(acc["customerId"])
    ids = [c["nccCampaignId"] for c in api.get("/ncc/campaigns", customer_id=cid) or []]
    if ids and spend(api, cid, ids, P["last14"][0], P["yesterday"][1])[0]:
        return None  # 광고비가 다시 나가기 시작함 → 상세 수집
    return {**prev, "name": acc.get("adAccountName") or prev["name"], "light": True}


def collect_account(api, acc, team, direct, P) -> dict:
    cid = str(acc["customerId"])
    # 광고센터 링크용: 하위 광고계정은 관리계정 권한으로 열어야 해서 접근할 관리계정 번호도 둔다 (수집 범위 관리계정 우선)
    via = next((m for m in acc["_managers"] if str(m) in team["scope"]), acc["_managers"][0] if acc["_managers"] else None)
    row = {"customerId": cid, "adAccountNo": acc.get("adAccountNo"), "accessManagerAccountNo": via,
           "name": acc.get("adAccountName") or cid, "owners": owner_of(api, acc, team, direct),
           "managers": acc["_managerNames"]}
    camps = api.get("/ncc/campaigns", customer_id=cid) or []
    ids = [c["nccCampaignId"] for c in camps]
    s = {k: (spend(api, cid, ids, *v) if ids else (0, 0, 0, {})) for k, v in P.items()}
    biz = api.get("/billing/bizmoney", customer_id=cid) or {}
    y = P["yesterday"][0]
    spending = bool(s["last14"][0] or s["last_month"][0])
    edit, what = last_edit(api, cid, camps) if spending else (None, None)
    zero, last_charge = bizmoney_zero_days(api, cid, y) if spending else (0, None)
    hits = budget_hits(api, cid, camps, s, P) if s["last7"][0] else []
    if hits and WITH_HOURS:
        add_off_hours(api, cid, hits)
    row.update({
        "campaignPerf": campaign_perf(camps, s, P) if spending else [],
        "budgetHits": hits,
        "fullAt": ymd(y),
        "bizZeroDays30": zero,
        "lastCharge": last_charge,
        "lastEdit": edit,
        "lastEditWhat": what,
        "daysSinceEdit": (y + timedelta(days=1) - date.fromisoformat(edit[:10])).days if edit else None,
        "yesterday": s["yesterday"][0],
        "avg7": round(s["prev7"][0] / 7),
        "last7Avg": round(s["last7"][0] / 7),
        "monthAvg": round(s["month"][0] / P["month"][1].day),
        "lastMonthAvg": round(s["last_month"][0] / P["last_month"][1].day),
        "roas7": roas(s["last7"]),
        "roas14": roas(s["last14"]),
        "roasLastMonth": roas(s["last_month"]),
        "purchase": {k: {"amt": s[k][1], "cnt": s[k][2]} for k in ("last7", "last14", "last_month")},
        "bizmoney": int(biz.get("bizmoney") or 0),
        "budgetLock": bool(biz.get("budgetLock")),
        "campaigns": {
            "total": len([c for c in camps if c.get("status") != "DELETED"]),
            "on": len([c for c in camps if c.get("status") == "ELIGIBLE"]),
            "budgetLimited": [c.get("name") for c in camps if c.get("statusReason") == "CAMPAIGN_LIMITED_BY_BUDGET"],
        },
    })
    return row


# ---------------------------------------------------------------- 판정

def health_issues(r: dict) -> list:
    """관리 경보 3가지 중 해당하는 것의 설명 목록."""
    out = []
    r7, rl = r.get("roas7"), r.get("roasLastMonth")
    if r7 is not None and rl and r7 < rl * (1 - ROAS_DROP):
        out.append(f"구매완료 수익률 하락 (7일 {r7:,}%, 지난달 {rl:,}%)")
    a7, lm = r.get("last7Avg", 0), r["lastMonthAvg"]
    if lm and a7 < lm * (1 - SPEND_DROP):
        out.append(f"광고비 하락 (7일 일평균 {a7:,}원, 지난달 {lm:,}원)")
    d = r.get("daysSinceEdit")
    if d is not None and d >= NO_EDIT_DAYS:
        out.append(f"수정이력 없음 ({d}일째, 마지막 {r['lastEdit'][:10]})")
    return out


def churn_issues(r: dict) -> list:
    """이탈 위험 3가지 중 해당하는 것의 설명 목록."""
    out = []
    a7, lm = r.get("last7Avg", 0), r["lastMonthAvg"]
    if lm and a7 < lm * (1 - CHURN_SPEND_DROP):
        out.append(f"광고비 감소 (7일 일평균 {a7:,}원, 지난달 {lm:,}원)")
    z = r.get("bizZeroDays30") or 0
    if z >= CHURN_ZERO_DAYS:
        out.append(f"비즈머니 바닥 30일 중 {z}일" + (f" (마지막 충전 {r['lastCharge']})" if r.get("lastCharge") else " (30일간 충전 없음)"))
    d = r.get("daysSinceEdit")
    if d is not None and d >= CHURN_NO_EDIT_DAYS:
        out.append(f"{d}일째 수정 없음")
    return out


def judge(r: dict) -> list:
    """계정 1개의 경고 목록. level: urgent / warn / info"""
    alerts, avg7 = [], r["avg7"]
    active = avg7 >= MIN_DAILY_AVG

    if avg7 > 0:
        days_left = r["bizmoney"] / avg7
        if days_left < BIZ_WARN_DAYS:
            lv = "urgent" if days_left < BIZ_URGENT_DAYS else "warn"
            text = (f"비즈머니 {r['bizmoney']:,}원, 약 {days_left:.1f}일분 남음" if r["bizmoney"] > 0
                    else f"비즈머니 소진 (잔액 {r['bizmoney']:,}원)")
            alerts.append({"type": "bizmoney", "level": lv, "text": text})
    if r["budgetLock"] and avg7 > 0:  # 소진 없는 휴면 계정은 잠금이어도 알릴 필요 없음
        alerts.append({"type": "bizmoney", "level": "warn", "text": "비즈머니 잠금(budgetLock) 상태"})

    if active and r["yesterday"] == 0:
        why = []
        if r["campaigns"]["on"] == 0:
            why.append("켜진 캠페인 없음")
        if r["bizmoney"] <= 0:
            why.append("비즈머니 0원")
        alerts.append({"type": "off", "level": "urgent",
                       "text": "어제 광고비 0원 (평소 일 " + f"{avg7:,}원)" + (f" · {', '.join(why)}" if why else "")})
    if r["campaigns"]["budgetLimited"]:
        alerts.append({"type": "off", "level": "info",
                       "text": f"예산 소진으로 제한된 캠페인 {len(r['campaigns']['budgetLimited'])}개"})

    if active and 0 < r["yesterday"] < avg7 * DROP_RATIO:
        pct = (1 - r["yesterday"] / avg7) * 100
        alerts.append({"type": "drop", "level": "warn",
                       "text": f"어제 {r['yesterday']:,}원, 7일 평균 {avg7:,}원 대비 {pct:.0f}% 감소"})

    if active:
        issues = health_issues(r)
        if issues:
            alerts.append({"type": "health", "level": "urgent" if len(issues) >= 2 else "warn",
                           "grade": "적색" if len(issues) >= 2 else "황색",
                           "text": f"{'적색' if len(issues) >= 2 else '황색'} 경보: " + " / ".join(issues)})

    if max(avg7, r["lastMonthAvg"]) >= MIN_DAILY_AVG:
        ch = churn_issues(r)
        if len(ch) >= 2:
            alerts.append({"type": "churn", "level": "urgent", "text": "이탈 위험: " + " / ".join(ch)})

    m, lm = r["monthAvg"], r["lastMonthAvg"]
    if max(m, lm) >= MIN_DAILY_AVG:
        if lm == 0:
            alerts.append({"type": "month", "level": "info", "text": f"전월 소진 없음, 이번 달 일평균 {m:,}원"})
        elif abs(m / lm - 1) >= MONTH_GAP:
            pct = (m / lm - 1) * 100
            alerts.append({"type": "month", "level": "warn" if pct < 0 else "info",
                           "text": f"이번 달 일평균 {m:,}원, 전월 {lm:,}원 대비 {pct:+.0f}%"})
    return alerts


# ---------------------------------------------------------------- 출력

def render(data: dict) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    stem = f"dashboard-{data['baseDate']}"
    (OUT / f"{stem}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tpl = (ROOT / "dashboard.html").read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = tpl.replace("/*__DATA__*/null", payload)
    out = OUT / f"{stem}.html"
    out.write_text(html, encoding="utf-8")
    # 팀원에게 나눠준 링크용 고정 파일. 쓰는 도중에 열려도 깨지지 않게 임시 파일로 쓴 뒤 바꿔치기한다
    for name, body in (("dashboard.html", html), ("latest.json", json.dumps(data, ensure_ascii=False))):
        tmp = OUT / f".{name}.tmp"
        tmp.write_text(body, encoding="utf-8")
        tmp.replace(OUT / name)
    return out


def prune_hourly(today: date) -> None:
    """오래된 시간대별 보고서 캐시 삭제 (출력 폴더 안의 캐시 파일만)."""
    root = OUT / "hourly"
    if not root.exists():
        return
    cut = ymd(today - timedelta(days=HOURLY_KEEP_DAYS))
    for f in root.glob("*/*.json"):
        if f.stem < cut:
            f.unlink()


def demo_rows(today) -> list:
    rnd = random.Random(7)
    names = ["팀원 A", "팀원 B", "팀원 C", "팀원 D"]
    shops = ["꽃집", "치과", "캠핑용품", "학원", "가구", "펜션", "법률사무소", "피부과", "반려용품", "커피원두",
             "인테리어", "렌터카", "수입차정비", "한의원", "베이커리", "골프연습장", "웨딩홀", "이사업체"]
    rows = []
    for i, shop in enumerate(shops):
        avg7 = rnd.choice([0, 8_000, 35_000, 60_000, 120_000, 250_000])
        y = int(avg7 * rnd.uniform(0.6, 1.15))
        if i in (3, 11):
            y = 0
        rows.append({
            "customerId": str(2_000_000 + i), "name": f"가상_{shop}", "owners": [names[i % 4]],
            "yesterday": y, "avg7": avg7,
            "monthAvg": int(avg7 * rnd.uniform(0.85, 1.05)),
            "lastMonthAvg": int(avg7 * rnd.choice([0.4, 1.0, 1.0, 1.0, 2.2])),
            "bizmoney": int(avg7 * rnd.choice([0.4, 2, 6, 15, 30])),
            "budgetLock": False,
            "campaigns": {"total": 3, "on": 0 if i == 11 else 3, "budgetLimited": ["브랜드"] if i == 5 else []},
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--no-hours", action="store_true", help="예산 소진 시각(보고서 생성) 생략")
    ap.add_argument("--full", action="store_true", help="휴면 계정도 전부 상세 수집 (전날 결과 재사용 안 함)")
    ap.add_argument("--workers", type=int, default=WORKERS, help="동시에 수집할 계정 수")
    args = ap.parse_args()

    global WITH_HOURS
    WITH_HOURS = not args.no_hours
    today = datetime.now(KST).date()
    P = periods(today)
    errors = []
    if args.demo:
        rows = demo_rows(today)
    else:
        sys.path.insert(0, str(ROOT))
        from naver_api import NaverAdsAPI
        api, team = NaverAdsAPI(), load_team()
        # 같은 광고계정이 여러 관리계정(팀 공용 + 개인)에 중복 연결돼 있어 customerId 로 합치고 소속 관리계정을 모은다
        by_cid = {}
        mgrs = (api.get("/manager-accounts", {"size": 1000}) or {}).get("content", [])
        for m in mgrs:
            no, mname = m["managerAccountNo"], (m.get("managerAccount") or {}).get("name")
            res = api.get(f"/manager-accounts/{no}/child-ad-accounts", {"size": 1000}) or {}
            for a in res.get("content", []):
                a = by_cid.setdefault(a["customerId"], {**a, "_managers": [], "_managerNames": []})
                a["_managers"].append(no)
                a["_managerNames"].append(mname)
        uniq = list(by_cid.values())
        if team["scope"]:  # 팀 관리계정에 연결된 광고계정만 (다른 팀 계정 제외)
            uniq = [a for a in uniq if any(str(m) in team["scope"] for m in a["_managers"])]
        uniq = [a for a in uniq if str(a["customerId"]) not in team["exclude"]]
        direct = set()
        if team["members"]:
            own = (api.get("/ad-accounts", {"size": 1000}) or {}).get("content", [])
            direct = {o["adAccountNo"] for o in own}
        if args.limit:
            uniq = uniq[: args.limit]
        prev = {}
        if (OUT / "latest.json").exists() and not args.full:
            prev = {r["customerId"]: r for r in json.loads((OUT / "latest.json").read_text(encoding="utf-8"))["accounts"]}
        prune_hourly(today)
        base = ymd(P["yesterday"][0])
        rows, done, lock = [], [0], threading.Lock()

        def work(acc):
            try:
                r = light_check(api, acc, prev.get(str(acc["customerId"])), P, base)
                if r is None:
                    r = collect_account(api, acc, team, direct, P)
                else:  # 담당·접근 관리계정은 매일 최신으로
                    r.update({"owners": owner_of(api, acc, team, direct), "managers": acc["_managerNames"]})
                with lock:
                    rows.append(r)
            except Exception as e:  # noqa: BLE001 — 한 계정 실패가 전체를 멈추지 않게
                with lock:
                    errors.append({"name": acc.get("adAccountName"), "customerId": str(acc["customerId"]),
                                   "error": str(e)[:200]})
            with lock:
                done[0] += 1
                print(f"[{done[0]}/{len(uniq)}] {acc.get('adAccountName')}", file=sys.stderr, flush=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
            list(ex.map(work, uniq))
        order = {str(a["customerId"]): i for i, a in enumerate(uniq)}
        rows.sort(key=lambda r: order.get(r["customerId"], 0))

    for r in rows:
        r["alerts"] = judge(r)
    data = {
        "baseDate": ymd(P["yesterday"][0]),
        "generatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
        "demo": args.demo,
        "rules": {"minDailyAvg": MIN_DAILY_AVG, "dropPct": round((1 - DROP_RATIO) * 100),
                  "monthGapPct": round(MONTH_GAP * 100), "bizUrgentDays": BIZ_URGENT_DAYS,
                  "bizWarnDays": BIZ_WARN_DAYS, "roasDropPct": round(ROAS_DROP * 100),
                  "spendDropPct": round(SPEND_DROP * 100), "noEditDays": NO_EDIT_DAYS,
                  "churnSpendDropPct": round(CHURN_SPEND_DROP * 100), "churnZeroDays": CHURN_ZERO_DAYS,
                  "churnNoEditDays": CHURN_NO_EDIT_DAYS, "budgetHitPct": round(BUDGET_HIT * 100)},
        "accounts": rows,
        "errors": errors,
    }
    out = render(data)
    n_alert = sum(1 for r in rows if r["alerts"])
    n_light = sum(1 for r in rows if r.get("light"))
    print(f"계정 {len(rows)}개(휴면 간이 확인 {n_light}개) · 경고 있는 계정 {n_alert}개 · 실패 {len(errors)}개 → {out}")


if __name__ == "__main__":
    main()
