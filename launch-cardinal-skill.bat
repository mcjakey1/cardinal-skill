@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo Starting Cardinal Skill...
echo ===================================================

:: Locate the frontend folder relative to batch script location
set "SCRIPT_DIR=%~dp0"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"

if not exist "%FRONTEND_DIR%\package.json" (
    echo Error: Could not locate frontend folder at "%FRONTEND_DIR%".
    echo Please run this script from the repository root directory.
    pause
    exit /b 1
)

:: Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js (>=22 recommended) to run Cardinal Skill.
    pause
    exit /b 1
)

:: Check for npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm is not installed or not in PATH.
    echo Please ensure npm is installed and added to PATH.
    pause
    exit /b 1
)

:: Install dependencies if node_modules is missing
if not exist "%FRONTEND_DIR%\node_modules" (
    echo Installing dependencies...
    cd /d "%FRONTEND_DIR%"
    call npm install
    if %errorlevel% neq 0 (
        echo Error: Dependency installation failed.
        pause
        exit /b 1
    )
    cd /d "%SCRIPT_DIR%"
)

echo.
echo Open http://localhost:3000 in your browser.
echo ===================================================
echo.

cd /d "%FRONTEND_DIR%"
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo Application stopped with an error.
    pause
)
