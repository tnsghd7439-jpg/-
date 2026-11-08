@echo off
rem 같은 사내망 팀원이 브라우저로 자기 대시보드만 열 수 있게 웹 서버를 켠다 (회사 PC 에서 켜 둔다)
rem 팀원별 주소는 output\naver_dash\links.txt 참고: http://<이 PC 의 IP>:8080/sa-<토큰>.html
rem 전체 화면(dashboard.html)은 웹으로 열리지 않는다. 팀장은 이 PC 에서 파일로 직접 연다.
chcp 65001 >nul
cd /d "%~dp0.."
py -3 naver_dash\serve.py 8080
