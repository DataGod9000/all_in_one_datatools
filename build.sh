#!/usr/bin/env bash
set -e
# Install Python deps
pip install -r requirements.txt
# Build React frontend → static/
cd frontend
npm ci
npm run build
cd ..
