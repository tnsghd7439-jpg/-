# 검색광고 변경이력 → 광고주 보고 멘트

네이버 검색광고 **변경이력 다운로드 파일**을 넣으면

1. 무엇을 바꿨는지 읽고 (입찰가 상향/하향, ON/OFF, 예산, 등록/삭제)
2. 검색광고 API로 **변경 전 7일 / 변경 후 성과**를 조회해 "왜 바꿨는지"를 추정하고
3. 정순홍 팀장 말투([STYLE.md](STYLE.md))로 카톡 보고 멘트 + 근거표(csv)를 만듭니다.

## 실행
```bash
python3 sa_change_report/report.py 변경이력.xlsx --customer 1234567 --target 400
python3 sa_change_report/report.py 변경이력.xlsx --advertiser 광고주명          # advertisers.json 사용
python3 sa_change_report/report.py 변경이력.xlsx --customer 1234567 --memo "캠페인명|하향=시즌 종료 대비"
python3 sa_change_report/report.py 변경이력.xlsx --no-api                     # 성과 조회 없이 정리만
```
- 필요한 환경변수: `NAVER_API_KEY`, `NAVER_SECRET_KEY` (대행 계정 키로 광고주 계정 조회)
- `--customer`는 광고주 **customerId** (검색광고 관리자 상단 계정 ID). ads.naver.com 주소창의 ad-accounts 번호와 다를 수 있음
- `advertisers.json`(git 제외): `{"광고주명": {"customer_id": "...", "target": 400}}` — `advertisers.example.json` 참고
- 결과: `sa_change_report/output/` (git 제외)

## 이유 추정 규칙
| 조건 (변경 전 7일) | 판단 |
|---|---|
| 클릭 10회 미만 | 판단 보류 → "이유 확인 필요"로 표시, `--memo`로 채움 |
| 하향/OFF + 전환 0 | "광고비 소진 대비 전환이 없어" |
| 하향/OFF + 효율 < 기준 | "효율 N%로 기준 대비 낮아" |
| 상향/ON + 효율 ≥ 기준 | "효율 N%로 높아 노출 확대를 위해" |
| 그 외 | 근거표에 "추정"으로 표시 |

데이터로 안 보이는 이유(광고주 요청, 예산 맞춤, 시즌 대비)는 알 수 없으므로 `--memo`가 항상 우선합니다.
6팀 일일점검(`mp_report`)은 광고주 단위 일 광고비만 있어 소재·키워드 단위 이유 추정에는 쓰지 않습니다.
