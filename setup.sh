#!/bin/bash
echo "Starting AD&D 2e Mini-Site..."
echo "Open http://localhost:8080/index.html in your browser"
if command -v python3 >/dev/null 2>&1; then
	PY_CMD="python3"
elif command -v python >/dev/null 2>&1; then
	PY_CMD="python"
else
	echo "Python was not found. Install Python 3 and run setup.sh again."
	exit 1
fi

$PY_CMD -m http.server 8080 &
sleep 2
open http://localhost:8080/index.html 2>/dev/null || xdg-open http://localhost:8080/index.html 2>/dev/null || echo "Please open http://localhost:8080/index.html manually"
wait
