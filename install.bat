@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -WaitAtExit
set "INSTALL_RESULT=%ERRORLEVEL%"
exit /b %INSTALL_RESULT%
