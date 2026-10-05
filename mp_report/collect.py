"""엠피 인트라넷 6팀 일일 점검 수집기.

환경변수
  MP_ID, MP_PW        인트라넷 계정 (필수)
  GCHAT_WEBHOOK       구글챗 웹훅 URL (없으면 전송 생략)
  GSHEET_WEBAPP       누적 시트 Apps Script 웹 앱 URL (없으면 시트 기록 생략)
  GSHEET_TOKEN        Apps Script 의 TOKEN 과 같은 값
  MP_DEPT_CODE        부서코드 (기본: 6팀 2TCTHEJW0001)

사용
  python3 mp_report/collect.py            # 수집 + output/ 저장 + 구글챗 전송
  python3 mp_report/collect.py --dry-run  # 전송 없이 요약만 출력
"""
import argparse
import asyncio
import csv
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "https://work.mymp.co.kr"
KST = timezone(timedelta(hours=9))
DEPT = os.environ.get("MP_DEPT_CODE", "2TCTHEJW0001")
CHROMIUM = "/opt/pw-browsers/chromium"

# 3번 기준
DROP_RATIO = 0.7        # 어제 < 직전 7일 평균 x 0.7 → 하락
MIN_DAILY_AVG = 10_000  # 직전 7일 일평균 1만원 미만 광고주 제외

# 4번 기준
FEE_MEDIA = {  # 매출 media_id / 업무요청 media_id → 표시명
    "coupangmu": "쿠팡", "Coupang": "쿠팡",
    "facebook": "메타", "meta": "메타",
    "google": "구글",
}
TAX_JOB_CODES = {"100", "103", "105"}  # 세금계산서 / 구글광고 매출정산 / 세금계산서&수수료(통합)
FEE_DEADLINE_DAY = 7
TRACK_MONTHS = 3

TRNS_TARGET = {"1": "신규", "5": "신규+이관", "3": "피이관"}
INFO_FIELDS = ["업체담당자", "일반전화", "휴대전화", "이메일", "사업자번호", "홈페이지"]


def ymd(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def won(v) -> str:
    return f"{int(round(float(v))):,}"


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


class Intra:
    def __init__(self, ctx):
        self.ctx = ctx

    async def post(self, path, form):
        r = await self.ctx.request.post(BASE + path, form=form)
        data = json.loads(await r.text())
        if data.get("result_cd") != "OK":
            raise RuntimeError(f"{path}: {data.get('message')}")
        return data.get("data") or []


async def login(browser):
    ctx = await browser.new_context()
    page = await ctx.new_page()
    page.on("dialog", lambda d: asyncio.ensure_future(d.dismiss()))
    await page.goto(f"{BASE}/mng/login/login.php?next_url=%2Fmng%2Fmain%2Fmain.php")
    await page.fill("#userid", os.environ["MP_ID"])
    await page.fill("#userpw", os.environ["MP_PW"])
    await page.click("#id_submit_btn")
    await page.wait_for_url("**/mng/main/**", timeout=30000)
    await page.close()
    return ctx


# ---------------------------------------------------------------- 1. 신규/이관
async def collect_transfers(api: Intra, today: date):
    rows = await api.post("/mng/job/transfer_action.php", {
        "submitType": "select", "sh_date_fr": ymd(month_start(today)), "sh_date_to": ymd(today),
        "sh_all_yn": "N", "sh_dept_code": DEPT, "num_per_page": "2000", "currPage": "1"})
    out = []
    for r in rows:
        if r["trns_gbn"] not in TRNS_TARGET:
            continue
        out.append({
            "구분": TRNS_TARGET[r["trns_gbn"]], "상태": r["trns_stat_nm"], "매체": r["media_nm"],
            "신청일": r["trns_date"], "광고주명": r["customer_nm"] or r["cust_nm"],
            "광고주ID": r["customer_id"], "전월매출": int(r["pre_month_amt"] or 0), "담당자": r["mkt_nm"],
        })
    return out


# ------------------------------------------------------- 2. 전월 광고주 입력 누락
async def collect_missing_info(ctx, today: date):
    prev = add_months(month_start(today), -1).strftime("%Y-%m")
    page = await ctx.new_page()
    await page.goto(f"{BASE}/AdInfoCheck/check/index.php?mpid={os.environ['MP_ID']}"
                    f"&fr_month={prev}&main=1&omitt=1")
    await page.wait_for_timeout(2000)
    shown_month = await page.input_value("#fr_month")
    hdr = await page.evaluate("()=>[...document.querySelectorAll('table th')].map(c=>c.innerText.trim())")
    rows = await page.evaluate(
        "()=>[...document.querySelectorAll('table tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim()))")
    await page.close()
    out = []
    for cells in rows:
        rec = dict(zip(hdr, cells))
        missing = [f for f in INFO_FIELDS if rec.get(f, "").strip() in ("", "010")]
        sales = int(re.sub(r"[^\d]", "", rec.get("월 매출", "")) or 0)
        if missing and sales > 0:
            out.append({"기준월": shown_month, "담당자": rec.get("이름"), "매체": rec.get("매체"),
                        "광고주명": rec.get("광고주명"), "광고주ID": rec.get("광고주ID"),
                        "월매출": sales, "누락항목": ", ".join(missing)})
    return out


# ------------------------------------------------------- 3. 광고비 하락/소진중단
async def sales_range(api: Intra, fr: date, to: date):
    return await api.post("/mng/job/sales_cust_action.php", {
        "submitType": "select", "sh_date_fr": ymd(fr), "sh_date_to": ymd(to),
        "sh_dept_code": DEPT, "num_per_page": "2000", "currPage": "1"})


async def collect_spend_drop(api: Intra, today: date):
    # 매출은 당일 10~17시에 수집되므로, 팀 합계가 정상 수준인 가장 최근 날짜를 기준일로 사용
    days = [today - timedelta(days=i) for i in range(1, 11)]
    daily = dict(zip(days, await asyncio.gather(*(sales_range(api, d, d) for d in days))))
    totals = {d: sum(float(r["tot_amt"] or 0) for r in rows) for d, rows in daily.items()}
    ref = next(d for d in days[:3]
               if totals[d] >= 0.3 * (sum(totals[x] for x in days[3:]) / len(days[3:]) or 1))
    window = [ref - timedelta(days=i) for i in range(8)]  # 기준일 + 직전 7일
    info, amt = {}, defaultdict(dict)
    for d in window:
        for r in daily.get(d, []):
            key = (r["media_id"], r["cust_id"], r["customer_id"])
            info[key] = r
            amt[key][d] = amt[key].get(d, 0) + float(r["tot_amt"] or 0)
    yesterday, days = ref, window
    out = []
    for key, by_day in amt.items():
        prev7 = sum(by_day.get(d, 0) for d in days[1:]) / 7
        if prev7 < MIN_DAILY_AVG:
            continue
        y = by_day.get(yesterday, 0)
        if y == 0:
            kind = "소진중단"
        elif y < prev7 * DROP_RATIO:
            kind = "하락"
        else:
            continue
        r = info[key]
        out.append({"기준일": ymd(yesterday), "구분": kind, "담당자": r["mng_name"], "매체": r["media_nm"],
                    "광고주명": r["customer_nm"] or r["cust_nm"], "광고주ID": r["customer_id"],
                    "어제광고비": int(y), "직전7일평균": int(prev7),
                    "변화율": f"{(y / prev7 - 1) * 100:.0f}%"})
    out.sort(key=lambda x: (x["구분"] != "소진중단", x["어제광고비"] - x["직전7일평균"]))
    return out


# ------------------------------------------------ 4. 쿠팡/메타/구글 수수료 요청 누락
async def tax_requests(api: Intra, fr: date, to: date):
    rows = await api.post("/mng/job/jobreq_action.php", {
        "submitType": "select", "menu_code": "jobreq01", "sh_menu_code": "jobreq01",
        "sh_date_fr": ymd(fr), "sh_date_to": ymd(to), "sh_dept_code": DEPT,
        "num_per_page": "500", "currPage": "1"})
    return [r for r in rows if r["job_code"] in TAX_JOB_CODES and r["jreq_stat"] != "S"]


def norm(s):
    return re.sub(r"[\s_\-()（）/.,]|주식회사|㈜", "", s or "").lower()


TITLE_MEDIA = [("쿠팡", "쿠팡"), ("메타", "메타"), ("페이스북", "메타"), ("구글", "구글"), ("유튜브", "구글")]


def parse_request(r):
    """업무요청의 연결 광고주는 잘못 입력된 경우가 많아 제목 기준으로 매체·광고주를 판단한다.
    제목 형식 예: '8월_쿠팡 대행사수수료 세금계산서+수수료 발행요청_오슬로우'"""
    title = r["title"] or ""
    media = next((m for k, m in TITLE_MEDIA if k in title), None)
    if not media:
        medias = {FEE_MEDIA.get(m.strip()) for m in (r["media_ids"] or "").split(",")} - {None}
        media = medias.pop() if len(medias) == 1 else None
    parts = [p.strip() for p in title.split("_") if p.strip()]
    name = parts[-1] if len(parts) >= 2 else ""
    m = re.match(r"\s*(\d{1,2})월", title)
    return {"매체": media, "광고주명": name, "월": int(m[1]) if m else None,
            "담당자": r["jreq_name"], "제목": title}


def aliases(name):
    return {norm(x) for x in re.split(r"[/,]", name or "") + [name or ""] if len(norm(x)) >= 2}


def same_advertiser(a, b):
    return any(x in y or y in x for x in aliases(a) for y in aliases(b))


async def collect_fee_requests(api: Intra, today: date):
    this_month = month_start(today)
    prev_month = add_months(this_month, -1)
    prev_end = this_month - timedelta(days=1)

    history = [parse_request(r) for r in await tax_requests(
        api, add_months(this_month, -TRACK_MONTHS), prev_end)]
    history = [h for h in history if h["매체"] and h["광고주명"]]

    # 추적 대상 1) 전월 쿠팡(등) 매출 광고주
    targets = []
    for r in await sales_range(api, prev_month, prev_end):
        media = FEE_MEDIA.get(r["media_id"])
        if media and float(r["tot_amt"] or 0) > 0:
            name = r["customer_nm"] or r["cust_nm"]
            if r["cust_nm"] and r["cust_nm"] != name:
                name = f"{name}/{r['cust_nm']}"
            had = any(h["매체"] == media and same_advertiser(name, h["광고주명"]) for h in history)
            targets.append({"매체": media, "광고주명": r["customer_nm"] or r["cust_nm"], "별칭": name,
                            "담당자": r["mng_name"], "전월광고비": int(float(r["tot_amt"])),
                            "근거": "전월매출", "신규": not had})
    # 추적 대상 2) 최근 3개월 동안 수수료/세금계산서를 요청했던 광고주 (메타·구글 포함)
    for h in sorted(history, key=lambda x: x["제목"]):
        if any(t["매체"] == h["매체"] and same_advertiser(t["별칭"], h["광고주명"]) for t in targets):
            continue
        targets.append({"매체": h["매체"], "광고주명": h["광고주명"], "별칭": h["광고주명"],
                        "담당자": h["담당자"], "전월광고비": "", "근거": "과거요청이력", "신규": False})

    # 이번 달 요청분 (전월 말일 무렵 요청분 포함, 제목의 'N월'이 전월인 것만 인정)
    current = [parse_request(r) for r in await tax_requests(api, prev_end - timedelta(days=5), today)]
    current = [c for c in current if c["매체"] and c["월"] in (None, prev_month.month)]

    status = "기한초과" if today.day > FEE_DEADLINE_DAY else f"미요청(D-{FEE_DEADLINE_DAY - today.day})"
    out = []
    for t in targets:
        if any(c["매체"] == t["매체"] and (same_advertiser(t["별칭"], c["광고주명"])
                                         or any(a in norm(c["제목"]) for a in aliases(t["별칭"])))
               for c in current):
            continue
        out.append({"대상월": prev_month.strftime("%Y-%m"), "상태": status, "매체": t["매체"],
                    "담당자": t["담당자"], "광고주명": t["광고주명"], "전월광고비": t["전월광고비"],
                    "추적근거": t["근거"], "신규추적": "신규" if t["신규"] else ""})
    out.sort(key=lambda x: (x["담당자"], x["매체"], x["광고주명"]))
    return out


# ---------------------------------------------------------- 5. 외근/근태 현황
async def collect_schedules(api: Intra, today: date):
    sunday = today + timedelta(days=6 - today.weekday())
    out = []
    for gbn in ("C", "B"):
        rows = await api.post("/mng/job/schedule1_action.php", {
            "submitType": "select", "schd_gbn": gbn, "sh_date_fr": ymd(today), "sh_date_to": ymd(sunday),
            "sh_dept_code": DEPT, "num_per_page": "500", "currPage": "1"})
        for r in rows:
            if r.get("schd_confirm") == "0":  # 반려 제외
                continue
            if gbn == "C":
                when = f"{r['meet_date']} {r['meet_time']}~{r['meet_time2']}"
                kind, detail = r["schd_trns_gbn_nm"], f"{r['cust_nm']} ({r['loc_name']})"
            else:
                when = f"{r['schd_date']} {r['schd_time']} ~ {r['schd_date2']} {r['schd_time2']}"
                kind, detail = r["schd_code_nm"], (r.get("schd_comment") or "").splitlines()[0][:40]
            out.append({"분류": r["schd_gbn_nm"], "직원": r["username"], "구분": kind, "일시": when,
                        "내용": detail, "처리상태": r["schd_confirm_nm"]})
    out.sort(key=lambda x: x["일시"])
    return out


# ---------------------------------------------------------------- 출력
def fmt_when(s):
    m = re.match(r"(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})", s)
    return f"{m[2]}/{m[3]} {m[4]}:{m[5]}" if m else s


MANAGER_ORDER = ["박송희", "정순홍", "차효림"]


def build_messages(today, res):
    """팀 공통(1·2·5번) 메시지 1개 + 담당자별(3·4번) 메시지를 만든다."""
    L = [f"*[6팀 일일 점검] {today:%Y-%m-%d (%a)} 기준*", ""]

    t = res["transfers"]
    cnt = defaultdict(int)
    for r in t:
        cnt[r["구분"]] += 1
    L.append(f"*1. 신규/이관 (당월 누적 {len(t)}건)* — "
             + " / ".join(f"{k} {cnt[k]}" for k in TRNS_TARGET.values()))
    for r in t:
        L.append(f" • [{r['구분']}·{r['상태']}] {r['담당자']} | {r['매체']} | {r['광고주명']}")
    L.append("")

    m = res["missing_info"]
    L.append(f"*2. 전월 매출 발생·정보 미입력 ({len(m)}건)*")
    for r in sorted(m, key=lambda x: x["담당자"]):
        L.append(f" • {r['담당자']} | {r['매체']} | {r['광고주명']} | 누락: {r['누락항목']}")
    L.append("")

    sc = res["schedules"]
    L.append(f"*5. 외근·근태 (오늘~이번 주, {len(sc)}건)*")
    for r in sc:
        L.append(f" • {fmt_when(r['일시'])} {r['직원']} [{r['분류']}·{r['구분']}] {r['내용']}")
    if not sc:
        L.append(" • 일정 없음")

    s, f = res["spend_drop"], res["fee_requests"]
    ref = s[0]["기준일"] if s else ""
    fee_status = f[0]["상태"] if f else ""
    L += ["", "※ 3번(광고비 이상)·4번(수수료 요청 누락)은 담당자별 메시지로 이어집니다."]
    messages = ["\n".join(L)]

    people = {r["담당자"] for r in s} | {r["담당자"] for r in f}
    order = [p for p in MANAGER_ORDER if p in people] + sorted(people - set(MANAGER_ORDER))
    for person in order:
        ps = [r for r in s if r["담당자"] == person]
        pf = [r for r in f if r["담당자"] == person]
        stop = sum(r["구분"] == "소진중단" for r in ps)
        P = [f"*[{person}] {today:%m/%d} 담당 광고주 점검*", "",
             f"*3. 광고비 이상 (소진중단 {stop} / 하락 {len(ps) - stop})* — {ref} vs 직전 7일 평균"]
        for r in ps:
            P.append(f" • [{r['구분']}] {r['매체']} | {r['광고주명']} | "
                     f"{won(r['어제광고비'])}원 (평균 {won(r['직전7일평균'])}, {r['변화율']})")
        if not ps:
            P.append(" • 해당 없음")
        P += ["", f"*4. 쿠팡·메타·구글 전월 수수료/세금계산서 요청 누락 ({len(pf)}건)* {fee_status}"]
        for r in pf:
            P.append(f" • {r['매체']} | {r['광고주명']}{' 🆕' if r['신규추적'] else ''}")
        if not pf:
            P.append(" • 해당 없음")
        messages.append("\n".join(P))
    return messages


def save(outdir: Path, res):
    outdir.mkdir(parents=True, exist_ok=True)
    for name, rows in res.items():
        if not rows:
            continue
        with open(outdir / f"{name}.csv", "w", newline="", encoding="utf-8-sig") as fp:
            w = csv.DictWriter(fp, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)


def split_message(text, size=3800):
    """구글챗 메시지 길이 제한(4,096자)에 맞춰 줄 단위로 나눈다."""
    parts, cur = [], ""
    for line in text.splitlines():
        if cur and len(cur) + len(line) + 1 > size:
            parts.append(cur)
            cur = ""
        cur += line + "\n"
    return parts + [cur] if cur.strip() else parts


def send_chat(text):
    url = os.environ.get("GCHAT_WEBHOOK")
    if not url:
        print("GCHAT_WEBHOOK 미설정 — 전송 생략")
        return
    parts = split_message(text)
    for i, part in enumerate(parts, 1):
        body = part if len(parts) == 1 else f"({i}/{len(parts)})\n{part}"
        req = urllib.request.Request(url, data=json.dumps({"text": body}).encode(),
                                     headers={"Content-Type": "application/json; charset=UTF-8"})
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"구글챗 전송 {i}/{len(parts)}:", r.status)


SHEET_TABS = {"transfers": "1_신규이관", "missing_info": "2_정보미입력", "spend_drop": "3_광고비이상",
              "fee_requests": "4_수수료요청누락", "schedules": "5_외근근태"}


def append_sheet(today, res):
    url = os.environ.get("GSHEET_WEBAPP")
    if not url:
        print("GSHEET_WEBAPP 미설정 — 시트 기록 생략")
        return
    body = {"token": os.environ.get("GSHEET_TOKEN", ""), "date": ymd(today),
            "tabs": {SHEET_TABS[k]: rows for k, rows in res.items()}}
    req = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json; charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        result = json.loads(r.read().decode())
    if not result.get("ok"):
        raise RuntimeError(f"시트 기록 실패: {result}")
    print("시트 기록:", result["added"])


def check_url_env(name, prefix):
    """환경변수 URL에 가림 문자(•)·한글·공백이 섞이면 원인을 알려주고 멈춘다."""
    v = os.environ.get(name)
    if not v:
        return
    if not v.startswith(prefix) or any(ord(c) > 126 or ord(c) < 33 for c in v):
        raise SystemExit(f"{name} 값이 올바른 주소가 아닙니다. '{prefix}'로 시작하고 가림 문자(•)·한글·공백이 "
                         f"없는 원래 주소 전체를 환경 설정에 다시 넣어 주세요.")


async def main():
    check_url_env("GCHAT_WEBHOOK", "https://chat.googleapis.com/")
    check_url_env("GSHEET_WEBAPP", "https://script.google.com/")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default="output")
    args = ap.parse_args()
    today = datetime.now(KST).date()

    async with async_playwright() as p:
        exe = CHROMIUM if Path(CHROMIUM).exists() else None
        browser = await p.chromium.launch(executable_path=exe)
        ctx = await login(browser)
        api = Intra(ctx)
        res = {
            "transfers": await collect_transfers(api, today),
            "missing_info": await collect_missing_info(ctx, today),
            "spend_drop": await collect_spend_drop(api, today),
            "fee_requests": await collect_fee_requests(api, today),
            "schedules": await collect_schedules(api, today),
        }
        await browser.close()

    outdir = Path(args.out) / ymd(today)
    save(outdir, res)
    messages = build_messages(today, res)
    (outdir / "summary.txt").write_text("\n\n---\n\n".join(messages), encoding="utf-8")
    print(f"저장: {outdir}")
    print("\n\n---\n\n".join(messages))
    if not args.dry_run:
        append_sheet(today, res)
        for msg in messages:
            send_chat(msg)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
