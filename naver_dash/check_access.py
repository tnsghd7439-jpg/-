"""API 키로 실제 무엇이 조회되는지 점검한다 (조회만, 변경 없음).

사용
  python3 naver_dash/check_access.py            # 하위 광고계정 중 앞 5개만 상세 점검
  python3 naver_dash/check_access.py --limit 0  # 계정 목록만
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from naver_api import NaverAdsAPI  # noqa: E402


def step(name, fn):
    try:
        res = fn()
        print(f"  [가능] {name}")
        return res
    except Exception as e:  # noqa: BLE001 — 점검 스크립트라 실패 사유를 그대로 보여준다
        print(f"  [실패] {name} — {e}")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()
    api = NaverAdsAPI()

    print("1) 내가 권한을 가진 관리 계정")
    mgrs = (step("manager-accounts", lambda: api.get("/manager-accounts", {"size": 1000})) or {}).get("content", [])
    for m in mgrs:
        d = m.get("managerAccount") or {}
        print(f"     관리계정 {m.get('managerAccountNo')} · {d.get('name')} · 내 역할 {m.get('roleName')}"
              f" · 하위 광고계정 {d.get('childAdAccountCount')}개")

    children = []
    for m in mgrs:
        no = m.get("managerAccountNo")
        res = step(f"관리계정 {no} 하위 광고계정 목록",
                   lambda: api.get(f"/manager-accounts/{no}/child-ad-accounts", {"size": 1000})) or {}
        children += res.get("content", [])
    print(f"     하위 광고계정 합계: {len(children)}개")

    print("\n2) 내가 직접 구성원인 광고계정")
    own = (step("ad-accounts", lambda: api.get("/ad-accounts", {"size": 1000})) or {}).get("content", [])
    print(f"     {len(own)}개")

    for c in children[: args.limit]:
        cid, no = c.get("customerId"), c.get("adAccountNo")
        print(f"\n3) 광고계정 {no} / SA {cid} · {c.get('adAccountName')} · 접근권한 {c.get('accountRole')}")
        mem = step("구성원(담당자 네이버ID) 조회", lambda: api.get(f"/ad-accounts/{no}/members", customer_id=cid))
        if mem:
            print(f"     구성원 {len(mem)}명 · 역할 {sorted({x.get('roleName') for x in mem})}")
        biz = step("비즈머니 잔액", lambda: api.get("/billing/bizmoney", customer_id=cid))
        if biz:
            print(f"     응답 필드: {sorted(biz.keys())}")
        camps = step("캠페인 목록", lambda: api.get("/ncc/campaigns", customer_id=cid)) or []
        if camps:
            print(f"     캠페인 {len(camps)}개 · 유형 {sorted({x.get('campaignTp') for x in camps})}"
                  f" · 상태 {sorted({x.get('status') for x in camps})}")
            ids = [x["nccCampaignId"] for x in camps[:20]]
            step("어제 성과(stats)", lambda: api.get(
                "/stats", {"ids": ",".join(ids), "fields": '["impCnt","clkCnt","salesAmt","ccnt"]',
                           "datePreset": "yesterday"}, customer_id=cid))


if __name__ == "__main__":
    main()
