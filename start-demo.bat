@echo off
title Vangy Wine - Demo
cd /d "%~dp0client"
where node >nul 2>nul || (echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing for the first time, please wait... & call npm install || (pause & exit /b 1))
if not exist dist (echo Preparing the app... & call npm run build || (pause & exit /b 1))
echo.
echo  Vangy Wine demo is running.
echo  On this laptop:   http://localhost:4173
echo  On a phone (same Wi-Fi): use the "Network" address shown below.
echo  Close this window to stop.
echo.
start "" http://localhost:4173
call npx vite preview --host --port 4173
