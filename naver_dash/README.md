# 네이버 검색광고 팀장 대시보드

관리계정에 연결된 광고계정을 돌며 팀원별 현황과 경고를 모아 `output/naver_dash/dashboard-<기준일>.html` 로 만듭니다.
조회만 하며 광고계정은 변경하지 않습니다.

## 점검 항목 (기준은 `collect.py` 상단 상수에서 조정)
1. 팀원별 담당 계정 수, 어제 총 광고비
   - 어제 광고비가 직전 7일 평균 대비 10% 이상 감소 (7일 일평균 1만원 미만 제외)
   - 이번 달 일평균이 전월 일평균 대비 ±50% 이상 차이
2. 비즈머니 부족: 잔액 ÷ 최근 7일 일평균 1일 미만 긴급, 3일 미만 주의
3. 광고 꺼짐(평소 소진 계정이 어제 0원), 소재 검수 반려 3일 이상 방치

## 환경변수 (코드·채팅에 키를 절대 넣지 않음 — 공개 저장소)
- `NAVER_API_KEY` : API 라이선스(Access License)
- `NAVER_SECRET_KEY` : 비밀키(Secret Key)
- `NAVER_CUSTOMER_ID` : 키를 발급한 계정의 Customer ID

발급 위치: searchad.naver.com → 도구 → API 사용 관리

## 팀원 매칭
`team.example.json` 을 `team.json` 으로 복사해 채웁니다(커밋 제외). 아래 순서로 먼저 맞는 규칙을 씁니다.
1. `accounts` : SA Customer ID → 팀원 (개별 예외)
2. `managers` : 관리계정 번호 → 팀원. 팀원별 관리계정에 연결된 광고계정을 그 팀원 담당으로 봅니다. 번호는 `check_access.py` 1) 에 나옵니다.
3. `members` : 구성원 네이버ID → 팀원. API 제약상 키 발급 계정이 **직접 구성원인** 광고계정에서만 조회됩니다.

매칭이 없으면 "미지정"으로 표시됩니다.

### 실제 키로 확인한 API 동작 (2026-10)
- `/ad-accounts/{no}/members` : `X-Customer` 에 키 발급 계정 ID 를 넣어야 하고, 관리계정 하위 광고계정은 어느 ID 로도 403. 그래서 팀원 구분은 관리계정 단위(`managers`)가 기본입니다.
- 같은 광고계정이 팀 공용 관리계정과 개인 관리계정에 중복 연결돼 있어 수집 시 customerId 로 합칩니다.
- `/stats` 는 `{"data":[{"id","salesAmt",...}]}` 형식이며, 기간 내 실적이 없는 캠페인은 행이 빠집니다.
- `managerAccount.childAdAccountCount` 는 null 로 옵니다.

## 실행
```bash
python3 naver_dash/check_access.py         # 1) 키로 무엇이 조회되는지 먼저 점검
python3 naver_dash/collect.py --limit 3    # 2) 3개 계정만 시험 수집
python3 naver_dash/collect.py              # 3) 전체 수집
python3 naver_dash/collect.py --skip-ads   #    소재 반려 점검 생략 (호출 수 절감)
python3 naver_dash/collect.py --demo       #    키 없이 가상 데이터로 화면 확인
```
