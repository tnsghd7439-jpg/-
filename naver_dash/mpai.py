"""MP AI(사내 광고 통합 화면) 「내 광고주」 수집 → 점검판 「매체 통합」 탭 데이터.

네이버 API 로 못 가져오는 GFA·지마켓·쿠팡·메타를 MP AI 화면에서 읽는다.
MP AI 는 회사 구글 계정 로그인(IAP) 뒤에 있어서, 회사 PC 의 전용 크롬 프로필로 연다.
- 처음 한 번:  py -3 naver_dash\\mpai.py --login   (크롬 창에서 회사 구글 계정 로그인 → 창 닫기)
- 매일 자동:   py -3 naver_dash\\mpai.py            (화면 없이 열어 표를 읽고 점검판을 다시 만듦)
- 11시 재확인: py -3 naver_dash\\mpai.py --if-stale (어제 데이터가 「미집계」였을 때만 다시 읽음)
비밀번호·토큰은 저장하지 않는다. 로그인 상태는 크롬 프로필(저장소 밖, %LOCALAPPDATA%\\naver6\\mpai_profile)에만 있다.
로그인이 풀리면 구글챗 팀방(NAVER_GCHAT_WEBHOOK)에 하루 한 번 「재로그인 필요」 알림을 보낸다.

화면 구조(2026-10 확인): 「내 광고주」/「팀원 전체 N명」/「팀원 선택」(목록) · 기간 「전일」「당월」…
· 「엑셀 · 전체」 · 매체 탭 「전체」「네이버 107」「네이버 GFA 54」「지마켓 16」「쿠팡 15」「메타 3」「구글 0」
· 표 열: 매체 | 광고주 | 광고매출 있는 곳 | 노출수 | 클릭수 | 전환수 | 전환매출 | 광고매출 | 광고매출 증감
표는 열 이름으로 읽으므로 열 순서가 바뀌어도 된다. 버튼 이름이 바뀌면 수집이 실패하고 run.log 에 남는다.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

URL = os.environ.get("NAVER_MPAI_URL") or "https://mpai.mymp.co.kr/my-advertisers"
ROOT = Path(__file__).resolve().parent
OUT = Path(os.environ.get("NAVER_DASH_OUT") or ROOT.parent / "output" / "naver_dash")
PROFILE = Path(os.environ.get("NAVER_MPAI_PROFILE")
               or Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "naver6" / "mpai_profile")
KST = timezone(timedelta(hours=9))
SELF = "@self"  # 「내 광고주」 = 로그인한 본인. 이름은 collect.py 가 SA 담당자와 맞춰 채운다
PERIODS = ["전일", "당월"]
TAB_RE = re.compile(r"^(전체|네이버 GFA|네이버|지마켓|쿠팡|메타|구글|카카오|11번가)\s*(\d+)?$")


class LoginRequired(Exception):
    pass


def chrome_exe() -> str | None:
    for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"), os.environ.get("LOCALAPPDATA")):
        if base and (p := Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe").exists():
            return str(p)
    return None


def login() -> None:
    """자동화 표시 없는 일반 크롬으로 전용 프로필을 열어 사람이 로그인한다.
    (자동화 크롬에서는 구글이 로그인을 막을 수 있어 일반 크롬을 쓴다.) 창을 닫으면 끝."""
    PROFILE.mkdir(parents=True, exist_ok=True)
    exe = chrome_exe()
    if not exe:
        sys.exit("크롬(chrome.exe)을 찾지 못했습니다. 구글 크롬을 설치해 주세요.")
    print("크롬 창이 열리면 회사 구글 계정으로 로그인해 「내 광고주」 화면이 보이는지 확인한 뒤 창을 닫아 주세요.")
    subprocess.run([exe, f"--user-data-dir={PROFILE}", "--no-first-run", "--new-window", URL])
    print("로그인 정보가 전용 프로필에 저장됐습니다. 이제 py -3 naver_dash\\mpai.py 로 시험 수집해 보세요.")


# ---------------------------------------------------------------- 화면 읽기

TABLES_JS = r"""() => [...document.querySelectorAll('table')].filter(t => t.offsetParent !== null).map(t => {
  const txt = e => (e.innerText || '').replace(/\s+/g, ' ').trim();
  let head = [...t.querySelectorAll('thead th, thead td')].map(txt);
  let rows = [...t.querySelectorAll('tbody tr')];
  if (!head.length) { const f = t.querySelector('tr'); head = [...f.querySelectorAll('th,td')].map(txt); rows = rows.filter(r => r !== f); }
  return { head, rows: rows.map(r => [...r.querySelectorAll('th,td')].map(c => {
    // 매체 칸의 「VAT 포함」 같은 꼬리표는 따로 (이름과 섞이지 않게)
    const tags = [...c.querySelectorAll('span,small,em,i')].filter(x => !x.children.length && x !== c).map(txt).filter(Boolean);
    return { t: txt(c), tags };
  })).filter(r => r.length) };
})"""


def click_text(page, text: str, timeout=8000) -> None:
    """버튼 글자로 누른다. 같은 글자가 제목 등에도 있어 버튼 → 역할 버튼 → 마지막 글자 요소 순으로 찾는다."""
    pat = re.compile(rf"^\s*{re.escape(text)}\s*$")
    for loc in (page.locator("button", has_text=pat), page.get_by_role("button", name=pat),
                page.locator("a,label,[role=tab]", has_text=pat), page.get_by_text(pat)):
        n = loc.count()
        for i in range(n):
            el = loc.nth(i)
            if el.is_visible():
                el.click(timeout=timeout)
                settle(page)
                return
    raise RuntimeError(f"MP AI 화면에서 「{text}」 버튼을 찾지 못했습니다 (화면이 바뀌었을 수 있음)")


def settle(page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:  # noqa: BLE001 — 계속 통신하는 화면이면 시간만 기다린다
        pass
    time.sleep(1.2)


def check_login(page) -> None:
    """구글 로그인 화면으로 넘어갔으면 계정 선택을 한 번 눌러 보고, 그래도 안 되면 LoginRequired."""
    for _ in range(2):
        if "accounts.google.com" not in page.url:
            return
        acct = page.locator("[data-identifier$='@mymp.co.kr'], [data-email$='@mymp.co.kr']")
        if acct.count():
            acct.first.click()
            try:
                page.wait_for_url(re.compile(r"mpai\."), timeout=30000)
            except Exception:  # noqa: BLE001
                pass
            settle(page)
    if "accounts.google.com" in page.url or "Invalid IAP" in (page.content()[:2000]):
        raise LoginRequired("MP AI 구글 로그인이 풀렸습니다")


def media_tabs(page) -> list[str]:
    names = []
    for el in page.locator("button,[role=tab]").all():
        try:
            t = re.sub(r"\s+", " ", el.inner_text()).strip()
        except Exception:  # noqa: BLE001
            continue
        if TAB_RE.match(t) and el.is_visible():
            names.append(t)
    return list(dict.fromkeys(names))


def member_select(page):
    """「팀원 선택」 목록(select). 없으면 None."""
    loc = page.locator("select").filter(has=page.locator("option", has_text="팀원 선택"))
    return loc.first if loc.count() else None


def read_scope(page, label: str) -> dict:
    """현재 선택된 범위(내 광고주 / 팀원 한 명)의 기간별·매체 탭별 표."""
    out = {}
    for period in PERIODS:
        click_text(page, period)
        dates = [i.input_value() for i in page.locator("input[type=date]").all()[:2]]
        tabs = {}
        for name in media_tabs(page) or ["전체"]:
            if name != "전체" and name.split()[-1] == "0":
                continue  # 광고주 0곳 탭은 건너뜀
            try:
                click_text(page, name)
            except RuntimeError:
                continue
            tabs[TAB_RE.match(name).group(1) if TAB_RE.match(name) else name] = page.evaluate(TABLES_JS)
        out[period] = {"dates": dates, "tabs": tabs}
        print(f"  {label} · {period} ({'~'.join(dates)}) 매체 탭 {len(tabs)}개", flush=True)
    return out


def scrape(headless=True, debug=False) -> dict:
    from playwright.sync_api import sync_playwright
    if not PROFILE.exists():
        raise LoginRequired("전용 크롬 프로필이 없습니다. 먼저 mpai.py --login")
    raw = OUT / "mpai_raw"
    raw.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE), channel=os.environ.get("NAVER_MPAI_CHANNEL", "chrome") or None, headless=headless,
            executable_path=os.environ.get("NAVER_MPAI_EXE") or None,  # 시험용(크롬 대신 다른 브라우저)
            accept_downloads=True, viewport={"width": 1600, "height": 1000}, locale="ko-KR")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=60000)
            settle(page)
            check_login(page)
            page.get_by_text(re.compile("담당 \\d+곳")).first.wait_for(timeout=30000)
            body = page.inner_text("body")
            pending = sorted(set(re.findall(r"(\d{1,2}/\d{1,2})\s*미집계", body)))
            scopes = []
            click_text(page, "내 광고주")
            scopes.append({"owner": SELF, "periods": read_scope(page, "내 광고주")})
            sel = member_select(page)
            members = [o for o in (sel.locator("option").all_inner_texts() if sel else []) if o.strip() != "팀원 선택"]
            if sel is None:
                print("  「팀원 선택」 목록을 찾지 못해 팀원 전체로 한 번에 읽습니다 (담당자 구분 불가)")
                click_text(page, re.sub(r"\s+", " ", page.get_by_text(re.compile(r"^팀원 전체")).first.inner_text()).strip())
                scopes.append({"owner": "팀원 전체", "periods": read_scope(page, "팀원 전체")})
            for m in members:
                member_select(page).select_option(label=m)
                settle(page)
                scopes.append({"owner": m.strip(), "periods": read_scope(page, m.strip())})
            if debug:
                page.screenshot(path=str(raw / "last.png"), full_page=True)
            return {"fetchedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"), "url": URL,
                    "pending": pending, "scopes": scopes}
        except Exception:
            # 실패 화면을 남겨 원인 확인 (광고주 데이터가 담기므로 저장소 밖 output 폴더에만)
            try:
                page.screenshot(path=str(raw / "error.png"), full_page=True)
                (raw / "error.html").write_text(page.content(), encoding="utf-8")
            except Exception:  # noqa: BLE001
                pass
            raise
        finally:
            ctx.close()


# ---------------------------------------------------------------- 정리

def num(s: str):
    s = (s or "").replace("₩", "").replace(",", "").replace("원", "").strip()
    m = re.fullmatch(r"([+-]?\d+(?:\.\d+)?)%?", s)
    return float(m.group(1)) if m else None


def tidy(raw: dict) -> dict:
    """표를 {열이름: 값} 행으로. 숫자 열은 숫자로, 「VAT 포함」 꼬리표는 vat 로 분리."""
    for sc in raw["scopes"]:
        for per in sc["periods"].values():
            for tab, tables in list(per["tabs"].items()):
                clean = []
                for t in tables:
                    head = t["head"]
                    rows = []
                    for r in t["rows"]:
                        d = {}
                        for h, c in zip(head, r):
                            text, tags = c["t"], [x for x in c["tags"] if x != c["t"]]
                            vat = next((x for x in tags if re.search(r"VAT|부가세", x)), None)
                            if vat:
                                text = text.replace(vat, "").strip()
                                d["vat"] = vat
                            v = num(text)
                            d[h] = v if v is not None and h not in ("매체", "광고주", "광고주명", "업체명", "광고계정ID", "광고주ID") else text
                        rows.append(d)
                    clean.append({"head": head, "rows": rows})
                per["tabs"][tab] = clean
    return raw


def yesterday() -> str:
    return (datetime.now(KST).date() - timedelta(days=1)).strftime("%Y-%m-%d")


def is_stale(m: dict | None) -> bool:
    """어제 데이터가 아직 없거나 「미집계」였으면 True."""
    if not m:
        return True
    y = datetime.now(KST).date() - timedelta(days=1)
    if f"{y.month}/{y.day}" in m.get("pending", []):
        return True
    dates = next((per["dates"] for sc in m["scopes"] for k, per in sc["periods"].items() if k == "전일"), [])
    return bool(dates) and max(dates) < yesterday()


def notify_login() -> None:
    """로그인 풀림을 팀방에 하루 한 번만 알린다."""
    url = os.environ.get("NAVER_GCHAT_WEBHOOK")
    flag = OUT / "mpai_login_notified.txt"
    today = datetime.now(KST).strftime("%Y-%m-%d")
    if not url or (flag.exists() and flag.read_text(encoding="utf-8").strip() == today):
        return
    import urllib.request
    body = json.dumps({"text": "⚠ MP AI 로그인이 풀려 매체 통합(GFA·지마켓·쿠팡·메타) 수집을 못 했습니다.\n"
                               "회사 PC 에서 naver_dash\\mpai_login.bat 을 실행해 다시 로그인해 주세요."}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json; charset=UTF-8"})
    try:
        urllib.request.urlopen(req, timeout=20).read()
        flag.write_text(today, encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        print(f"구글챗 알림 실패: {e}")


def rerender(m: dict) -> None:
    """마지막 SA 결과(latest.json)에 매체 통합 데이터를 붙여 점검판을 다시 만든다."""
    latest = OUT / "latest.json"
    if not latest.exists():
        print("latest.json 이 없어 화면은 다음 SA 수집 때 반영됩니다")
        return
    sys.path.insert(0, str(ROOT))
    import collect
    data = json.loads(latest.read_text(encoding="utf-8"))
    data["mpai"] = collect.resolve_mpai(m, data)
    collect.render(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true", help="전용 크롬 프로필로 MP AI 로그인 (처음 한 번, 풀렸을 때)")
    ap.add_argument("--if-stale", action="store_true", help="저장된 데이터에 어제가 미집계일 때만 다시 읽음 (11시 재확인)")
    ap.add_argument("--show", action="store_true", help="크롬 창을 보이게 실행 (문제 확인용)")
    ap.add_argument("--debug", action="store_true", help="마지막 화면을 output/naver_dash/mpai_raw/last.png 로 저장")
    args = ap.parse_args()
    if args.login:
        login()
        return
    if not PROFILE.exists():  # 아직 mpai_login.bat 을 한 번도 안 했으면 조용히 건너뜀 (알림 안 보냄)
        print("MP AI 미설정 — naver_dash\\mpai_login.bat 으로 처음 로그인하면 매일 수집합니다")
        return
    cache = OUT / "mpai.json"
    old = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else None
    if args.if_stale and not is_stale(old):
        print("MP AI 데이터 최신 (어제 집계 완료) — 다시 읽지 않음")
        return
    try:
        m = tidy(scrape(headless=not args.show, debug=args.debug))
    except LoginRequired as e:
        print(f"MP AI 수집 실패: {e} → mpai_login.bat 실행 필요")
        notify_login()
        sys.exit(2)
    except Exception as e:  # noqa: BLE001 — 화면 변경 등. 실패 화면은 mpai_raw/error.png
        print(f"MP AI 수집 실패: {str(e).splitlines()[0][:300]} (output/naver_dash/mpai_raw/error.png 확인)")
        sys.exit(1)
    if not any(per["tabs"] for sc in m["scopes"] for per in sc["periods"].values()):
        print("MP AI 표를 하나도 읽지 못했습니다 (output/naver_dash/mpai_raw/error.png 확인)")
        sys.exit(1)
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / ".mpai.json.tmp"
    tmp.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    tmp.replace(cache)
    (OUT / "mpai_login_notified.txt").unlink(missing_ok=True)
    rerender(m)
    print(f"MP AI 수집 완료 ({m['fetchedAt']}, 범위 {len(m['scopes'])}개"
          + (f", 미집계 {', '.join(m['pending'])}" if m["pending"] else "") + ")")


if __name__ == "__main__":
    main()
