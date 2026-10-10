@echo off
rem 같은 사내망 팀원이 브라우저로 대시보드를 열 수 있게 결과 폴더를 웹으로 연다 (조회 전용, 회사 PC 에서 켜 둔다)
rem 주소: http://<이 PC 의 IP>:8080/dashboard.html?owner=팀원이름
chcp 65001 >nul
cd /d "%~dp0..\output\naver_dash"
py -3 -m http.server 8080
