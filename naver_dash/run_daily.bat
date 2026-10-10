@echo off
rem 6팀 대시보드 매일 수집 (윈도우 작업 스케줄러에서 실행)
rem API 키는 이 파일에 쓰지 않는다. 사용자 환경변수 NAVER_API_KEY / NAVER_SECRET_KEY / NAVER_CUSTOMER_ID 로 등록.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
if not exist output\naver_dash mkdir output\naver_dash
echo ==== %date% %time% 시작 >> output\naver_dash\run.log
py -3 naver_dash\collect.py >> output\naver_dash\run.log 2>&1
echo ==== %date% %time% 종료 (코드 %errorlevel%) >> output\naver_dash\run.log
