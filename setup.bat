@echo off
echo Starting AD&D 2e Mini-Site...
echo Open http://localhost:8080/index.html in your browser
start http://localhost:8080/index.html
python -m http.server 8080
pause
