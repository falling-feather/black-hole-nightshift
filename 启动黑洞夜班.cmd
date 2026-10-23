@echo off
setlocal
cd /d "%~dp0"
node scripts/preview.mjs
if errorlevel 1 pause
