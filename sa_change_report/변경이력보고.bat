@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py -3
%PY% report.py "%~1" --pc
echo.
pause
