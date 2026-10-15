@echo off
rem GFA 시트 재확인 (작업 스케줄러 naver6_gfa_1100 이 매일 11:00 실행). 오전 집계 때 시트가 최신이 아니었을 때 대비
rem 시트가 바뀌었을 때만 화면을 다시 만든다 (네이버 API 호출 없음)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
echo ==== %date% %time% GFA 재확인 >> output\naver_dash\run.log
py -3 naver_dash\collect.py --gfa-refresh >> output\naver_dash\run.log 2>&1
