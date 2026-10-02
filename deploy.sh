#!/usr/bin/env bash
# Deploy site/ to the arena server (ssh alias `arena`) and restart the Node service.
# Usage: ./deploy.sh            (from Git Bash, in "IBB Arena")
set -euo pipefail
cd "$(dirname "$0")/site"

SSH="ssh -o BatchMode=yes arena"
REMOTE=C:/inetpub/IBBArena

echo "== syntax check server code on the box"
scp -q -o BatchMode=yes server/server.js server/kids.js server/kids-questions.js "arena:$REMOTE/server/"
$SSH "cd /d C:\\inetpub\\IBBArena\\server && node --check server.js && node --check kids.js && node -e \"require('./kids-questions')\"" 2>/dev/null

echo "== front end"
$SSH "if not exist C:\\inetpub\\IBBArena\\public\\kids mkdir C:\\inetpub\\IBBArena\\public\\kids" 2>/dev/null
scp -q -o BatchMode=yes public/kids/* "arena:$REMOTE/public/kids/"

echo "== restart Node service"
$SSH "powershell -NoProfile -Command \"Restart-Service nodejsserver.exe; Start-Sleep 4; (Get-Service nodejsserver.exe).Status\"" 2>/dev/null

echo "== health"
curl -s -m 5 http://192.168.0.102:3000/health; echo
curl -s -m 5 "http://192.168.0.102:3000/api/kids/state?team=red" | head -c 200; echo
curl -s -m 5 -o /dev/null -w "kids page: %{http_code}\n" http://192.168.0.102/kids/team.html
