#!/bin/sh
# VideoLoader helper для macOS / Linux. Требование: node и yt-dlp в PATH
# (yt-dlp: https://github.com/yt-dlp/yt-dlp#installation).
cd "$(dirname "$0")" || exit 1
echo "VideoLoader helper starting..."
exec node server.js
