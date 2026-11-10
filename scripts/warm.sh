#!/bin/sh
# Presentation-day warm-up: wakes the Render backend and fills the archive cache (cap 4, 3 repeats = what the UI sends).
# Usage: scripts/warm.sh https://apa-course-project-api.onrender.com   (run it ~10 min before showing the QR code)
set -e
API="${1:?usage: warm.sh <backend-url>}"
API="${API%/}"
echo "waking $API ..."
curl -sS -m 120 -o /dev/null -w "health %{http_code} in %{time_total}s\n" "$API/api/health"
curl -sS -m 60 -o /dev/null -w "messages %{http_code} in %{time_total}s\n" "$API/api/messages"
curl -sS -m 120 -N -X POST "$API/api/archive/stream" -H 'content-type: application/json' \
  -d '{"max_key_length":4,"repeats":3}' -o /dev/null -w "archive (fills cache) %{http_code} in %{time_total}s\n"
curl -sS -m 60 -N -X POST "$API/api/archive/stream" -H 'content-type: application/json' \
  -d '{"max_key_length":4,"repeats":3}' -o /dev/null -w "archive again (should be ~0 s) %{http_code} in %{time_total}s\n"
