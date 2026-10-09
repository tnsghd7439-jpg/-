"""네이버 검색광고 팀장 대시보드 수집기 (조회 전용, 계정 변경 없음).

관리계정에 연결된 하위 광고계정을 돌며 아래를 점검하고, 결과를 대시보드 HTML 로 만든다.
  1. 팀원별 담당 계정 수 / 어제 총 광고비
     - 어제 광고비가 직전 7일 평균 대비 10% 이상 감소한 광고주
     - 이번 달 일평균 소진이 전월 일평균과 크게 차이 나는 광고주
  2. 비즈머니 부족 (잔액 ÷ 최근 7일 일평균 = 남은 일수)
  3. 광고 꺼짐 (평소 소진 계정이 어제 0원)

환경변수: NAVER_API_KEY, NAVER_SECRET_KEY, NAVER_CUSTOMER_ID (naver_api.py 참고)
팀원 매칭: naver_dash/team.json (team.example.json 참고, 커밋 금지)

사용
  python3 naver_dash/collect.py              # 수집 + output/naver_dash/ 에 JSON·HTML 저장
  python3 naver_dash/collect.py --limit 3    # 앞 3개 계정만 (시험용)
  python3 naver_dash/collect.py --demo       # 키 없이 가상 데이터로 화면만 확인
"""
import argparse
import calendar
import json
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "output" / "naver_dash"
KST = timezone(timedelta(hours=9))

# 점검 기준 (팀 합의에 따라 조정)
MIN_DAILY_AVG = 10_000      # 직전 7일 일평균 1만원 미만 계정은 1·3번 경고에서 제외
DROP_RATIO = 0.9            # 어제 < 직전 7일 평균 x 0.9 → 10% 이상 감소
MONTH_GAP = 0.5             # 이번 달 일평균이 전월 일평균 대비 ±50% 이상 → 큰 차이
BIZ_URGENT_DAYS = 1         # 비즈머니 남은 일수 1일 미만 → 긴급
BIZ_WARN_DAYS = 3           # 3일 미만 → 주의


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
    }


def load_team() -> dict:
    p = ROOT / "team.json"
    if not p.exists():
        return {"scope": [], "fallback": "미지정", "managers": {}, "members": {}, "accounts": {}}
    d = json.loads(p.read_text(encoding="utf-8"))
    return {"scope": [str(x) for x in d.get("scope", [])], "fallback": d.get("fallback") or "미지정",
            "managers": {str(k): v for k, v in d.get("managers", {}).items()},
            "members": d.get("members", {}),
            "accounts": {str(k): v for k, v in d.get("accounts", {}).items()}}


# ---------------------------------------------------------------- 수집

def spend(api, cid, camp_ids, since: date, until: date) -> int:
    """캠페인 합계 광고비(VAT 포함, salesAmt)."""
    total = 0
    for i in range(0, len(camp_ids), 50):
        res = api.get("/stats", {
            "ids": ",".join(camp_ids[i:i + 50]),
            "fields": '["salesAmt"]',
            "timeRange": json.dumps({"since": ymd(since), "until": ymd(until)}),
        }, customer_id=cid)
        rows = res.get("data", []) if isinstance(res, dict) else (res or [])
        total += sum(int(r.get("salesAmt") or 0) for r in rows)
    return total


def owner_of(api, acc, team, direct) -> list:
    """담당 팀원: accounts 직접 지정 → 소속 관리계정(managers) → 구성원 네이버ID(members) → fallback 순.

    구성원 조회(/ad-accounts/{no}/members)는 X-Customer 에 키 발급 계정 ID 를 넣어야 하고,
    키 발급 계정이 그 광고계정의 직접 구성원일 때만 된다. 관리계정 하위 계정은 403 이라 건너뛴다.
    """
    cid = str(acc["customerId"])
    if cid in team["accounts"]:
        return [team["accounts"][cid]]
    names = {team["managers"][str(m)] for m in acc["_managers"] if str(m) in team["managers"]}
    if not names and team["members"] and acc["adAccountNo"] in direct:
        try:
            members = api.get(f"/ad-accounts/{acc['adAccountNo']}/members") or []
        except RuntimeError:
            members = []
        names = {team["members"][m["naverId"]] for m in members if m.get("naverId") in team["members"]}
    return sorted(names) or [team["fallback"]]


def collect_account(api, acc, team, direct, P) -> dict:
    cid = str(acc["customerId"])
    row = {"customerId": cid, "name": acc.get("adAccountName") or cid, "owners": owner_of(api, acc, team, direct),
           "managers": acc["_managerNames"]}
    camps = api.get("/ncc/campaigns", customer_id=cid) or []
    ids = [c["nccCampaignId"] for c in camps]
    s = {k: (spend(api, cid, ids, *v) if ids else 0) for k, v in P.items()}
    biz = api.get("/billing/bizmoney", customer_id=cid) or {}
    row.update({
        "yesterday": s["yesterday"],
        "avg7": round(s["prev7"] / 7),
        "monthAvg": round(s["month"] / P["month"][1].day),
        "lastMonthAvg": round(s["last_month"] / P["last_month"][1].day),
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

def judge(r: dict) -> list:
    """계정 1개의 경고 목록. level: urgent / warn / info"""
    alerts, avg7 = [], r["avg7"]
    active = avg7 >= MIN_DAILY_AVG

    if avg7 > 0:
        days_left = r["bizmoney"] / avg7
        if days_left < BIZ_WARN_DAYS:
            lv = "urgent" if days_left < BIZ_URGENT_DAYS else "warn"
            alerts.append({"type": "bizmoney", "level": lv,
                           "text": f"비즈머니 {r['bizmoney']:,}원, 약 {days_left:.1f}일분 남음"})
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
    return out


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
    args = ap.parse_args()

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
        direct = set()
        if team["members"]:
            own = (api.get("/ad-accounts", {"size": 1000}) or {}).get("content", [])
            direct = {o["adAccountNo"] for o in own}
        if args.limit:
            uniq = uniq[: args.limit]
        rows = []
        for n, acc in enumerate(uniq, 1):
            print(f"[{n}/{len(uniq)}] {acc.get('adAccountName')}", file=sys.stderr)
            try:
                rows.append(collect_account(api, acc, team, direct, P))
            except Exception as e:  # noqa: BLE001 — 한 계정 실패가 전체를 멈추지 않게
                errors.append({"name": acc.get("adAccountName"), "customerId": str(acc["customerId"]),
                               "error": str(e)[:200]})

    for r in rows:
        r["alerts"] = judge(r)
    data = {
        "baseDate": ymd(P["yesterday"][0]),
        "generatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
        "demo": args.demo,
        "rules": {"minDailyAvg": MIN_DAILY_AVG, "dropPct": round((1 - DROP_RATIO) * 100),
                  "monthGapPct": round(MONTH_GAP * 100), "bizUrgentDays": BIZ_URGENT_DAYS,
                  "bizWarnDays": BIZ_WARN_DAYS},
        "accounts": rows,
        "errors": errors,
    }
    out = render(data)
    n_alert = sum(1 for r in rows if r["alerts"])
    print(f"계정 {len(rows)}개 · 경고 있는 계정 {n_alert}개 · 실패 {len(errors)}개 → {out}")


if __name__ == "__main__":
    main()
