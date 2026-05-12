@echo off
setlocal enabledelayedexpansion
echo Starting AD^&D 2e Mini-Site...
echo Open http://localhost:8080/index.html in your browser

REM Test py launcher first (only real if it outputs a version string)
where py >nul 2>nul
if %errorlevel%==0 (
    for /f "tokens=*" %%v in ('py -3 --version 2^>^&1') do set PY_VER=%%v
    echo !PY_VER! | findstr /i "Python 3" >nul 2>nul
    if !errorlevel!==0 (
        start "" cmd /c "timeout /t 2 >nul && start http://localhost:8080/index.html"
        py -3 -m http.server 8080
        goto :eof
    )
)

REM Test python command - skip Windows Store stub (opens Store, not real Python)
where python >nul 2>nul
if %errorlevel%==0 (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
    echo !PY_VER! | findstr /i "Python 3" >nul 2>nul
    if !errorlevel!==0 (
        start "" cmd /c "timeout /t 2 >nul && start http://localhost:8080/index.html"
        python -m http.server 8080
        goto :eof
    )
)

REM No working Python found - use built-in PowerShell static server
where powershell >nul 2>nul
if %errorlevel%==0 (
    echo Python 3 not found ^(Windows Store stub does not count^). Using built-in PowerShell server.
    start "" cmd /c "timeout /t 2 >nul && start http://localhost:8080/index.html"
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\serve-static.ps1" -Port 8080 -RootPath "%CD%"
    goto :eof
)

echo Neither a working Python 3 nor PowerShell was found.
echo Install PowerShell 5.1+ or Python 3, then run setup.bat again.
pause
