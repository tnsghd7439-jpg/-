"""GFA 현황 구글 시트(팀원 탭) 읽기 → 점검판 「GFA 액션」 탭 데이터.

시트 구조(팀원 탭): "① GFA 증액 독려 …"(9월 GFA 매출 있는 계정) / "② GFA 휴면 계정 …"(9월 0원) 구역,
각 구역 첫 줄이 "광고계정 | CustomerID | 광고주 | 9월 GFA | 10월 GFA 목표 | 10월 GFA 누적 | … | 상태 | 최근 3일 평균".
시트는 gfa_sheet_export.gs 웹 앱으로 읽는다. 환경변수 NAVER_GFA_URL, NAVER_GFA_TOKEN (공개 저장소라 파일에 적지 않음).
"""
import json
import os
import re
import urllib.parse
import urllib.request


def _num(v) -> int:
    if isinstance(v, (int, float)):
        return int(v)
    s = re.sub(r"[^\d.-]", "", str(v or ""))
    try:
        return int(float(s)) if s not in ("", "-", ".") else 0
    except ValueError:
        return 0


def parse(payload: dict) -> dict:
    rows = []
    for owner, values in (payload.get("tabs") or {}).items():
        section, header = None, None
        for row in values:
            a = str(row[0] if row else "").strip()
            if a.startswith("①"):
                section, header = "active", None   # 9월 GFA 집행 이력 있음
            elif a.startswith("②"):
                section, header = "dormant", None  # 9월 GFA 0원 (휴면)
            elif a == "광고계정":
                header = [str(x).strip() for x in row]
            elif header and section and re.fullmatch(r"\d+", a):
                r = dict(zip(header, row))
                name = str(r.get("광고주") or "").strip()
                rows.append({
                    "owner": owner, "section": section, "adAccountNo": int(a),
                    "customerId": str(_num(r.get("CustomerID"))), "name": "" if name == "-" else name,
                    "sep": _num(r.get("9월 GFA")), "target": _num(r.get("10월 GFA 목표")),
                    "oct": _num(r.get("10월 GFA 누적")), "status": str(r.get("상태") or "").strip(),
                    "last3": _num(r.get("최근 3일 평균")),
                })
    note = str(payload.get("note") or "")
    m = re.search(r"마지막 업데이트\s*([\d-]+\s+[\d:]+)", note)
    return {"updatedAt": m.group(1) if m else "", "note": note, "rows": rows}


def fetch() -> dict | None:
    """시트를 읽어 정리. 환경변수가 없거나 실패하면 None."""
    url, token = os.environ.get("NAVER_GFA_URL"), os.environ.get("NAVER_GFA_TOKEN")
    if not url or not token:
        return None
    full = url + ("&" if "?" in url else "?") + urllib.parse.urlencode({"token": token})
    with urllib.request.urlopen(full, timeout=60) as r:  # Apps Script 는 리디렉션 후 JSON 을 준다
        payload = json.loads(r.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"GFA 시트 조회 거부: {payload.get('error')}")
    return parse(payload)
