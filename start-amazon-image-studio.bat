@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File start-amazon-image-studio.ps1
pause
