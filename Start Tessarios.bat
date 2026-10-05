@echo off
echo ===================================================
echo               Tessarios Start-Skript
echo ===================================================
echo.
echo Wechsle ins Projektverzeichnis...
cd /d "%~dp0"

echo Starte Tessarios (Vite + Electron)...
npm run electron:dev

pause
