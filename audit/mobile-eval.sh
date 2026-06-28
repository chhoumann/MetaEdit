#!/usr/bin/env bash
# Evaluate JS inside the Obsidian mobile WebView on the running emulator via CDP.
#
#   audit/mobile-eval.sh <jsfile>     # JS should end with an expression that
#                                     # returns JSON.stringify(...) (awaited)
#   echo '<js>' | audit/mobile-eval.sh -
#
# Re-establishes the adb CDP forward each call, then runs the safdeb CDP client.
set -euo pipefail

ANDROID_HOME=${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}
ADB="$ANDROID_HOME/platform-tools/adb"
SERIAL=${SERIAL:-emulator-5554}
SAFDEB=${SAFDEB:-/Users/christian/Developer/safdeb}

src="${1:?usage: mobile-eval.sh <jsfile|->}"
if [ "$src" = "-" ]; then JS="$(cat)"; else JS="$(cat "$src")"; fi

pid="$("$ADB" -s "$SERIAL" shell pidof md.obsidian | tr -d '\r')"
if [ -z "$pid" ]; then
	echo "Obsidian is not running on $SERIAL; start it with: $ADB -s $SERIAL shell am start -n md.obsidian/.MainActivity" >&2
	exit 1
fi
"$ADB" -s "$SERIAL" forward tcp:9333 "localabstract:webview_devtools_remote_$pid" >/dev/null

( cd "$SAFDEB" && uv run --no-project --with websockets python android_cdp.py eval "$JS" )
