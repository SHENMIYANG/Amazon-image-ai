@echo off
cd /d "%~dp0"
echo Test run...
echo Current dir: %CD%
echo.
echo Checking Node...
where node
echo.
echo Running concurrently...
npx concurrently --kill-others "cd backend && npm start" "cd frontend && npm run dev"
echo.
echo Done!
pause
