#!/usr/bin/env bash

set -e

echo "==================================================="
echo "Starting Cardinal Skill..."
echo "==================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"

if [ ! -f "${FRONTEND_DIR}/package.json" ]; then
    echo "Error: Could not locate frontend folder at '${FRONTEND_DIR}'."
    echo "Please run this script from the repository root directory."
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is not installed or not in PATH."
    echo "Please install Node.js (>=22 recommended) to run Cardinal Skill."
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm is not installed or not in PATH."
    echo "Please ensure npm is installed and added to PATH."
    exit 1
fi

if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
    echo "Installing dependencies..."
    cd "${FRONTEND_DIR}"
    npm install
    cd "${SCRIPT_DIR}"
fi

echo ""
echo "Open http://localhost:3000 in your browser."
echo "==================================================="
echo ""

cd "${FRONTEND_DIR}"
npm run dev
