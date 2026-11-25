@echo off
rem MP AI 처음 설정 / 로그인이 풀렸을 때 실행 (더블클릭)
rem 1) 화면 읽기 도구(playwright) 설치  2) 전용 크롬 창에서 회사 구글 계정 로그인  3) 시험 수집
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
if not exist output\naver_dash mkdir output\naver_dash
py -3 -c "import playwright" 2>nul || py -3 -m pip install --user playwright
py -3 naver_dash\mpai.py --login
echo.
echo 시험 수집 중 (1~3분)...
py -3 naver_dash\mpai.py
echo.
pause
