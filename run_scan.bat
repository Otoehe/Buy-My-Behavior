@echo off
REM run_scan.bat - запускає сканер і відкриває звіт
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  set "PYEXE=python"
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set "PYEXE=py"
  ) else (
    echo Python не знайдено. Встанови Python з Microsoft Store або https://www.python.org/ і запусти цей файл знову.
    pause
    exit /b 1
  )
)
%PYEXE% "scan_bmb_names.py" .
if exist "weird_names_report.csv" start "" "weird_names_report.csv"
echo.
echo Готово. Якщо файл звіту не відкрився, знайди weird_names_report.csv у цій папці.
pause
