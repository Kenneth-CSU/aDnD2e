#!/bin/bash
echo "Starting AD&D 2e Mini-Site..."
echo "Open http://localhost:8080/index.html in your browser"
python3 -m http.server 8080 &
sleep 2
open http://localhost:8080/index.html 2>/dev/null || xdg-open http://localhost:8080/index.html 2>/dev/null || echo "Please open http://localhost:8080/index.html manually"
wait
