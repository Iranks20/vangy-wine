@echo off
title Vangy Wine
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist server\.env (echo server\.env is missing. Copy server\.env.example to server\.env and fill it in. & pause & exit /b 1)
if not exist server\node_modules (echo Installing the server... & call npm --prefix server install || (pause & exit /b 1))
if not exist client\node_modules (echo Installing the web app... & call npm --prefix client install || (pause & exit /b 1))
echo Building...
call npm --prefix server run build || (pause & exit /b 1)
call npm --prefix client run build || (pause & exit /b 1)
start "Vangy Wine API" cmd /k "cd /d %~dp0server && npm start"
echo.
echo  Vangy Wine is starting. Make sure PostgreSQL is running (or DATABASE_URL is set in server\.env).
echo  On this laptop:          http://localhost:4173
echo  On a phone (same Wi-Fi): use the "Network" address shown below.
echo  Close both windows to stop.
echo.
timeout /t 4 >nul
start "" http://localhost:4173
cd client && call npx vite preview --host --port 4173
