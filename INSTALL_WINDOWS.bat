@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js before running this installer.
  pause
  exit /b 1
)
call npm install --prefix server
if errorlevel 1 goto failed
call npm install --prefix client
if errorlevel 1 goto failed
echo Dependencies installed, including the QR and PDF invoice generators.
echo Keep your existing server\.env and MongoDB data.
echo For a fresh setup, copy server\.env.example to server\.env and configure it.
echo Start the backend with: cd server then npm run dev
echo Start the frontend in another terminal with: cd client then npm run dev
pause
exit /b 0
:failed
echo Installation failed. Check the error above.
pause
exit /b 1
