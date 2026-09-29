# Starts the API (port 8766) and the web app (port 8765) in two windows.
# Run the one-time setup in README.md first.
$root = $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8766"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"
Write-Host "API: http://localhost:8766/docs   App: http://localhost:8765"
