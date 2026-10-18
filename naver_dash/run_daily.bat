@echo off
rem 6팀 대시보드 매일 수집 (윈도우 작업 스케줄러에서 실행)
rem API 키는 이 파일에 쓰지 않는다. 사용자 환경변수 NAVER_API_KEY / NAVER_SECRET_KEY / NAVER_CUSTOMER_ID 로 등록.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
if not exist output\naver_dash mkdir output\naver_dash
echo ==== %date% %time% 시작 >> output\naver_dash\run.log
rem 저장소의 최신 코드 받기 (실패해도 기존 코드로 계속 실행). team.json·결과 파일은 저장소에 없으니 영향 없음
git pull --ff-only >> output\naver_dash\run.log 2>&1
rem 팀원 링크 서버(serve.py)가 꺼져 있으면 창 없이 다시 켠다 (로그인 시 자동 실행이 꺼졌을 때 대비)
netstat -ano | findstr /R /C:":8080 .*LISTENING" >nul || (echo 링크 서버 꺼져 있어 다시 켬 >> output\naver_dash\run.log & start "" pyw -3 naver_dash\serve.py 8080)
py -3 naver_dash\collect.py --no-notify >> output\naver_dash\run.log 2>&1
rem MP AI(GFA·지마켓·쿠팡·메타) 읽어 매체 통합 탭 갱신. 미설정·실패면 건너뜀
py -3 naver_dash\mpai.py >> output\naver_dash\run.log 2>&1
rem 구글챗 공지는 여기서 보내지 않고 09:50·15:30 에 notify_run.bat 이 보낸다
echo ==== %date% %time% 종료 (코드 %errorlevel%) >> output\naver_dash\run.log
