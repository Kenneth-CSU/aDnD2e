@echo off
echo Starting AD&D 2e Mini-Site...
echo Open http://localhost:8080/index.html in your browser
where py >nul 2>nul
if %errorlevel%==0 (
	start "" cmd /c "timeout /t 2 >nul && start http://localhost:8080/index.html"
	py -3 -m http.server 8080
	goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
	start "" cmd /c "timeout /t 2 >nul && start http://localhost:8080/index.html"
	python -m http.server 8080
	goto :eof
)

echo Python 3 was not found.
echo Install Python, then run setup.bat again.
pause
