@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo Starting Cardinal Skill...
echo ===================================================

set "SCRIPT_DIR=%~dp0"

if not exist "%SCRIPT_DIR%package.json" (
    echo Error: Could not locate package.json at "%SCRIPT_DIR%".
    echo Please run this script from the repository root directory.
    pause
    exit /b 1
)

:: Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js v22 or higher to run Cardinal Skill.
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

:: Install dependencies if Expo is missing (node_modules may exist after a partial install)
if not exist "%SCRIPT_DIR%node_modules\.bin\expo.cmd" (
    echo Installing dependencies...
    cd /d "%SCRIPT_DIR%"
    call npm install
    if %errorlevel% neq 0 (
        echo Error: Dependency installation failed.
        pause
        exit /b 1
    )
    cd /d "%SCRIPT_DIR%"
)

echo.
echo Open http://localhost:8081 in your browser.
echo ===================================================
echo.

cd /d "%SCRIPT_DIR%"
call npm run web -- --port 8081

if %errorlevel% neq 0 (
    echo.
    echo Application stopped with an error.
    pause
)
