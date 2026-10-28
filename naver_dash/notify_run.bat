@echo off
rem 구글챗 공지 (작업 스케줄러 naver6_notify_0950 / naver6_notify_1530 이 매일 09:50, 15:30 실행)
rem MP AI 를 다시 읽어 최신 매체 금액으로 공지한다. 네이버 SA 는 07:00 수집분을 쓴다 (API 호출 없음)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
if not exist output\naver_dash mkdir output\naver_dash
echo ==== %date% %time% 구글챗 공지 >> output\naver_dash\run.log
py -3 naver_dash\mpai.py >> output\naver_dash\run.log 2>&1
py -3 naver_dash\collect.py --notify-only >> output\naver_dash\run.log 2>&1
