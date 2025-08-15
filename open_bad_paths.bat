@echo off
REM open_bad_paths.bat - запустити PowerShell-скрипт для відкриття кожного проблемного елемента
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\open_bad_paths.ps1"
