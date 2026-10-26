"""네이버 검색광고 변경이력 → 광고주 보고 멘트 (정순홍 팀장 말투).

변경이력 파일에서 무엇을 바꿨는지 읽고, 검색광고 API로 변경 전·후 성과를 조회해
"왜 바꿨는지"를 추정한 뒤 카톡 보고 멘트와 근거표를 만든다.

환경변수
  NAVER_API_KEY, NAVER_SECRET_KEY   검색광고 API 키 (대행 계정 키로 광고주 계정 조회)
  NAVER_CUSTOMER_ID                 키를 발급한 계정 ID (여기서는 사용하지 않음, --customer 로 광고주 지정)

사용
  python3 sa_change_report/report.py 변경이력.xlsx --customer 1234567
  python3 sa_change_report/report.py 변경이력.xlsx --advertiser 광고주명 --target 400
  python3 sa_change_report/report.py 변경이력.xlsx --customer 1234567 --memo "캠페인명|하향=시즌 종료 대비"
  python3 sa_change_report/report.py 변경이력.xlsx --no-api          # API 없이 변경 내용만 정리

광고주명 → customerId·기준효율은 sa_change_report/advertisers.json 에 둔다 (git 제외, example 참고).
"""
import argparse
import base64
import csv
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

API = "https://api.searchad.naver.com"
KST = timezone(timedelta(hours=9))
HERE = Path(__file__).resolve().parent

BEFORE_DAYS = 7      # 변경 전 성과 조회 기간
MIN_CLICKS = 10      # 이보다 클릭이 적으면 효율로 판단하지 않음 (데이터 부족)
DEFAULT_TARGET = 400 # 기준 효율(ROAS %) — 광고주별로 advertisers.json 에서 덮어씀

COLS = {  # 변경이력 열 이름 → 내부 키 (공백 무시하고 비교)
    "변경일자": "when", "변경일시": "when", "일시": "when",
    "변경유형": "kind", "변경자": "who", "캠페인": "campaign",
    "광고그룹": "adgroup", "변경내용": "detail",
}
ID_RE = re.compile(r"\b((?:nad|nkw|grp|cmp)-[a-z0-9-]+)")
TARGET_NAME = {"nad": "소재", "nkw": "키워드", "grp": "광고그룹", "cmp": "캠페인"}
WEEKDAY = "월화수목금토일"


# ---------------------------------------------------------------- 변경이력 읽기

def norm(s):
    return re.sub(r"\s+", "", str(s or ""))


def read_rows(path: Path):
    """xlsx / csv / 화면 복사 txt(탭 구분)를 같은 형태의 dict 목록으로."""
    suffix = path.suffix.lower()
    if suffix in (".xlsx", ".xlsm"):
        import openpyxl
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
        table = [["" if v is None else str(v) for v in r] for r in ws.iter_rows(values_only=True)]
    else:
        raw = path.read_bytes()
        for enc in ("utf-8-sig", "cp949"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        delim = "\t" if text.count("\t") > text.count(",") else ","
        table = list(csv.reader(text.splitlines(), delimiter=delim))

    head_i = next((i for i, r in enumerate(table[:20])
                   if sum(norm(c) in COLS for c in r) >= 3), None)
    if head_i is None:
        sys.exit("변경이력 열(변경일자/변경 유형/캠페인/광고그룹/변경 내용)을 찾지 못했습니다. "
                 "검색광고 > 변경이력 > 다운로드 파일을 그대로 넣어주세요.")
    keys = [COLS.get(norm(c)) for c in table[head_i]]
    rows = []
    for r in table[head_i + 1:]:
        row = {k: (r[i].strip() if i < len(r) else "") for i, k in enumerate(keys) if k}
        if row.get("detail") or row.get("kind"):
            rows.append(row)
    return rows


def parse_when(s):
    m = re.search(r"(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})", s or "")
    return date(*map(int, m.groups())) if m else None


def parse_side(text):
    """'· 입찰가: 590' 형태 줄 → {입찰가: '590'}"""
    out = {}
    for line in re.split(r"[\n·•]", text):
        if ":" in line:
            k, v = line.split(":", 1)
            if k.strip():
                out[norm(k)] = v.strip()
    return out


def num(v):
    v = re.sub(r"[^\d.\-]", "", v or "")
    return float(v) if v not in ("", "-", ".") else None


def parse_change(row):
    detail = row.get("detail", "")
    m = ID_RE.search(detail)
    tid = m.group(1) if m else ""
    before, after = {}, {}
    if "변경 전" in detail or "변경전" in detail:
        body = re.split(r"변경\s*전", detail, maxsplit=1)[1]
        b, _, a = re.split(r"(변경\s*후)", body, maxsplit=1) if re.search(r"변경\s*후", body) else (body, "", "")
        before, after = parse_side(b), parse_side(a)

    kind = norm(row.get("kind"))
    action, delta = "기타", None
    bid_b, bid_a = num(before.get("입찰가")), num(after.get("입찰가"))
    budget_key = next((k for k in after if "예산" in k), None)
    onoff_key = next((k for k in after if k in ("상태", "노출상태", "ON/OFF", "사용여부") or "on/off" in k.lower()), None)
    if bid_b is not None and bid_a is not None and bid_b != bid_a:
        action, delta = ("입찰가 상향" if bid_a > bid_b else "입찰가 하향"), (bid_b, bid_a)
    elif budget_key and before.get(budget_key) != after.get(budget_key):
        b, a = num(before.get(budget_key)), num(after.get(budget_key))
        action = "예산 상향" if (b or 0) < (a or 0) else "예산 하향"
        delta = (b, a)
    elif onoff_key:
        v = after[onoff_key].upper()
        action = "OFF" if ("OFF" in v or "중지" in v or "꺼" in v) else "ON"
    elif "등록" in kind or "등록" in detail or "추가" in kind:
        action = "등록"
    elif "삭제" in kind or "삭제" in detail:
        action = "삭제"

    return {
        "date": parse_when(row.get("when")), "when": row.get("when", ""),
        "campaign": re.sub(r"^[^\w\[(]+", "", row.get("campaign", "")),
        "adgroup": row.get("adgroup", ""), "id": tid,
        "target": TARGET_NAME.get(tid[:3], "설정") if tid else "설정",
        "action": action, "delta": delta, "kind": row.get("kind", ""),
        "before": before, "after": after,
    }


# ---------------------------------------------------------------- 검색광고 API

def api_get(uri, customer, params=None):
    ts = str(int(time.time() * 1000))
    sig = base64.b64encode(hmac.new(os.environ["NAVER_SECRET_KEY"].encode(),
                                    f"{ts}.GET.{uri}".encode(), hashlib.sha256).digest()).decode()
    q = "?" + urllib.parse.urlencode(params) if params else ""
    req = urllib.request.Request(API + uri + q, headers={
        "X-Timestamp": ts, "X-API-KEY": os.environ["NAVER_API_KEY"],
        "X-Customer": str(customer), "X-Signature": sig})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_stats(customer, ids, since: date, until: date):
    """id 목록의 기간 합계 성과. 실패한 묶음은 건너뛰고 경고만 남긴다."""
    fields = ["impCnt", "clkCnt", "salesAmt", "ccnt", "convAmt"]
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        try:
            data = api_get("/stats", customer, {
                "ids": ",".join(chunk), "fields": json.dumps(fields),
                "timeRange": json.dumps({"since": since.isoformat(), "until": until.isoformat()})})
        except urllib.error.HTTPError as e:
            print(f"[경고] 성과 조회 실패({e.code}) — customerId가 맞는지 확인: {e.read().decode()[:120]}",
                  file=sys.stderr)
            continue
        for d in data.get("data", []):
            out[d["id"]] = d
    return out


def summarize(stats_list):
    s = defaultdict(float)
    for st in stats_list:
        for k in ("impCnt", "clkCnt", "salesAmt", "ccnt", "convAmt"):
            s[k] += float(st.get(k) or 0)
    s["roas"] = s["convAmt"] / s["salesAmt"] * 100 if s["salesAmt"] else None
    s["cpc"] = s["salesAmt"] / s["clkCnt"] if s["clkCnt"] else None
    return s


# ---------------------------------------------------------------- 이유 추정

def guess_reason(action, pre, target):
    """변경 전 성과로 이유를 추정. (문구, 확신여부) — 확신 없으면 메모를 받도록 표시."""
    roas, clk, cost, conv = pre["roas"], pre["clkCnt"], pre["salesAmt"], pre["ccnt"]
    if clk < MIN_CLICKS:
        if action in ("입찰가 상향", "ON") and pre["impCnt"] < 300:
            return "노출이 적어 노출 확보를 위해", True
        return "", False
    if action in ("입찰가 하향", "OFF", "예산 하향"):
        if conv == 0:
            return f"최근 {BEFORE_DAYS}일 광고비 {won(cost)}원 소진 대비 전환이 없어", True
        if roas is not None and roas < target:
            return f"최근 {BEFORE_DAYS}일 효율 {pct(roas)}로 기준({target}%) 대비 낮아", True
        return f"효율({pct(roas)})은 양호하나 CPC 절감을 위해", False
    if action in ("입찰가 상향", "ON", "예산 상향"):
        if roas is not None and roas >= target:
            return f"최근 {BEFORE_DAYS}일 효율 {pct(roas)}로 높아 노출 확대를 위해", True
        return f"효율({pct(roas or 0)})이 기준 미만이나 노출 확보를 위해", False
    return "", False


def won(v):
    v = float(v)
    return f"{v / 10000:,.0f}만" if v >= 10000 else f"{v:,.0f}"


def pct(v):
    return "-" if v is None else f"{v:,.0f}%"


# ---------------------------------------------------------------- 멘트 만들기

def short_campaign(name):
    return re.sub(r"\(.*?\)\s*$", "", name).strip() or name


def build(changes, stats_pre, stats_post, target, memos, today):
    """캠페인 × 액션 단위로 묶어 멘트 줄과 근거표 행을 만든다."""
    groups = defaultdict(list)
    for c in changes:
        groups[(c["campaign"], c["action"], c["target"])].append(c)

    lines, table, ask = [], [], []
    by_campaign = defaultdict(list)
    for (camp, action, target_name), cs in groups.items():
        pre = summarize(stats_pre.get(c["id"], {}) for c in cs if c["id"])
        post = summarize(stats_post.get(c["id"], {}) for c in cs if c["id"])
        label = f"{camp} {action} {target_name}"
        memo = next((v for k, v in memos.items()
                     if all(part.strip() in label for part in k.split("|")) or any(k == c["id"] for c in cs)), None)
        has_data = any(c["id"] in stats_pre for c in cs)
        reason, sure = (memo, True) if memo else (guess_reason(action, pre, target) if has_data else ("", False))

        n = len(cs)
        cnt = f"{target_name} {n}개" if n > 1 else target_name
        if action.startswith("입찰가"):
            bs = [c["delta"] for c in cs if c["delta"]]
            avg = sum((a - b) / b * 100 for b, a in bs if b) / len(bs)
            what = f"{cnt} 입찰가 {'평균 ' if n > 1 else ''}{abs(avg):.0f}% {action[-2:]} 조정"
        elif action.startswith("예산"):
            what = f"{cnt} 예산 {action[-2:]} 조정"
        elif action in ("ON", "OFF"):
            what = f"{cnt} {action} 처리"
        elif action == "기타":
            what = f"{target_name} {cs[0]['kind'] or '설정'} {n}건 진행"
        else:
            what = f"{cnt} {action}"

        follow = {"입찰가 하향": "효율 회복되는지 지속체크하겠습니다.",
                  "OFF": "비효율 정리 후 남은 예산 효율 지켜보겠습니다.",
                  "예산 하향": "효율 회복되는지 지속체크하겠습니다.",
                  "입찰가 상향": "노출·효율 같이 지켜보면서 조정하겠습니다.",
                  "예산 상향": "효율 무너지지 않는지 지켜보면서 조정하겠습니다.",
                  "ON": "반응 지켜보면서 판단하겠습니다.",
                  "등록": "데이터 쌓이는대로 정리해서 말씀드리겠습니다.",
                  "삭제": "",
                  }.get(action, "데이터 지켜보면서 조정하겠습니다.")
        if reason:
            sentence = f"{reason} {what}하였습니다."
        else:
            sentence = f"{what}하였습니다."
            ask.append(f"{camp} / {what}")
        if post["clkCnt"] >= MIN_CLICKS and post["roas"] is not None and action != "삭제":
            sentence += f" 조정 후 효율은 {pct(post['roas'])}로 확인됩니다."
        by_campaign[camp].append(f"- {sentence} {follow}".rstrip())

        table.append({
            "캠페인": camp, "대상": target_name, "변경": action, "건수": n,
            "변경 전 광고비": round(pre["salesAmt"]), "변경 전 클릭": round(pre["clkCnt"]),
            "변경 전 전환": round(pre["ccnt"]), "변경 전 효율(%)": "" if pre["roas"] is None else round(pre["roas"]),
            "변경 후 효율(%)": "" if post["roas"] is None else round(post["roas"]),
            "이유": reason or "확인 필요", "근거": "메모" if memo else ("데이터" if sure else ("추정" if reason else "-")),
        })

    greet = {0: "좋은아침 이십니다. 이번주도 파이팅입니다!", 4: "좋은아침 이십니다. 한주 고생하셨습니다!"}
    lines.append(greet.get(today.weekday(), "안녕하세요 좋은아침 이십니다."))
    lines += ["", "네이버 검색광고", ""]
    for camp, items in by_campaign.items():
        lines.append(short_campaign(camp))
        lines += items
        lines.append("")
    lines.append("데이터 지켜보면서 지속 말씀드리겠습니다.")
    return "\n".join(lines), table, ask


# ---------------------------------------------------------------- 실행

def load_advertisers():
    p = HERE / "advertisers.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", type=Path, help="검색광고 변경이력 다운로드 파일 (xlsx/csv/txt)")
    ap.add_argument("--customer", help="광고주 customerId")
    ap.add_argument("--advertiser", help="advertisers.json 의 광고주명")
    ap.add_argument("--target", type=float, help=f"기준 효율 %% (기본 {DEFAULT_TARGET})")
    ap.add_argument("--memo", action="append", default=[],
                    help='"캠페인명 일부=이유" 또는 "캠페인명 일부|하향=이유" (여러 번 가능)')
    ap.add_argument("--no-api", action="store_true", help="성과 조회 없이 변경 내용만 정리")
    ap.add_argument("--out", type=Path, default=HERE / "output")
    args = ap.parse_args()

    adv = load_advertisers().get(args.advertiser or "", {})
    customer = args.customer or adv.get("customer_id")
    target = args.target or adv.get("target") or DEFAULT_TARGET

    changes = [parse_change(r) for r in read_rows(args.file)]
    changes = [c for c in changes if c["action"] != "기타" or c["kind"]]
    if not changes:
        sys.exit("변경 내역이 비어 있습니다.")
    today = datetime.now(KST).date()

    stats_pre, stats_post = {}, {}
    if not args.no_api:
        if not customer:
            sys.exit("--customer(광고주 customerId) 또는 advertisers.json 의 --advertiser 가 필요합니다. "
                     "API 없이 정리만 하려면 --no-api")
        for k in ("NAVER_API_KEY", "NAVER_SECRET_KEY"):
            if not os.environ.get(k):
                sys.exit(f"환경변수 {k} 가 없습니다.")
        by_day = defaultdict(list)
        for c in changes:
            if c["id"] and c["date"]:
                by_day[c["date"]].append(c["id"])
        for d, ids in by_day.items():
            stats_pre.update(fetch_stats(customer, ids, d - timedelta(days=BEFORE_DAYS), d - timedelta(days=1)))
            if d < today - timedelta(days=1):  # 변경 다음날 ~ 어제
                stats_post.update(fetch_stats(customer, ids, d + timedelta(days=1), today - timedelta(days=1)))

    memos = dict(m.split("=", 1) for m in args.memo if "=" in m)
    text, table, ask = build(changes, stats_pre, stats_post, target, memos, today)

    args.out.mkdir(parents=True, exist_ok=True)
    stem = f"{args.advertiser or customer or 'report'}_{today:%Y%m%d}"
    (args.out / f"{stem}_멘트.txt").write_text(text, encoding="utf-8")
    with open(args.out / f"{stem}_근거.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(table[0].keys()))
        w.writeheader()
        w.writerows(table)

    print(text)
    print(f"\n[기준 효율 {target:.0f}% / 변경 전 {BEFORE_DAYS}일 성과 기준 / 클릭 {MIN_CLICKS}회 미만은 판단 보류]")
    if ask:
        print("\n[이유 확인 필요 — --memo 로 채워주세요]")
        for a in ask:
            print(" ·", a)
    print(f"\n저장: {args.out / (stem + '_멘트.txt')}, {args.out / (stem + '_근거.csv')}")


if __name__ == "__main__":
    main()
