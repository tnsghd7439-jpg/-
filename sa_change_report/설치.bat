@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py -3
%PY% --version >nul 2>nul || (echo [!] Python not found. Install from https://www.python.org/downloads/ ^(check "Add python.exe to PATH"^) & pause & exit /b 1)
%PY% -m pip install -q --disable-pip-version-check openpyxl
%PY% report.py --setup
echo.
pause
