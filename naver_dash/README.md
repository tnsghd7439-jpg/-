# 네이버 검색광고 팀장 대시보드 (준비 단계)

팀원별 담당 광고계정 현황을 한눈에 보기 위한 도구입니다. 현재는 **API 키로 무엇이 조회되는지 점검**하는 단계입니다.

## 환경변수 (코드·채팅에 키를 절대 넣지 않음 — 공개 저장소)
- `NAVER_API_KEY` : API 라이선스(Access License)
- `NAVER_SECRET_KEY` : 비밀키(Secret Key)
- `NAVER_CUSTOMER_ID` : 키를 발급한 계정의 Customer ID

발급 위치: searchad.naver.com → 도구 → API 사용 관리

## 점검 실행 (조회만, 계정 변경 없음)
```bash
python3 naver_dash/check_access.py
```
