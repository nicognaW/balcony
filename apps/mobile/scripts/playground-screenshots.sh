#!/usr/bin/env bash
# Opens every playground scenario and screen on a running emulator (or
# device) through the `balcony://playground` deep link and saves a
# screenshot of each, then logcat. Run by .github/workflows/android-apk.yml.
#
#   playground-screenshots.sh <apk> <output dir>
set -euo pipefail

apk=$1
out=$2
package=dev.balcony.mobile
mkdir -p "$out"

adb install -r "$apk"
adb logcat -c

# Saves the screen as <out>/<n>-<name>.png, numbered in the order taken.
shot_count=0
shot() {
  shot_count=$((shot_count + 1))
  adb exec-out screencap -p >"$out/$(printf '%02d' "$shot_count")-$1.png"
}

# Opens a playground link and waits for it to render.
open_link() {
  adb shell am start -W -a android.intent.action.VIEW \
    -d "'balcony://playground?$1'" "$package" >/dev/null
  sleep "${2:-4}"
}

# The centre of the first view whose text or content description is $1.
centre_of() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  adb shell cat /sdcard/ui.xml | python3 -I -c '
import re, sys
xml = sys.stdin.read()
for node in re.finditer(r"<node [^>]*>", xml):
    tag = node.group(0)
    text = re.search(r"\btext=\"([^\"]*)\"", tag)
    desc = re.search(r"content-desc=\"([^\"]*)\"", tag)
    if sys.argv[1] in ((text and text.group(1)), (desc and desc.group(1))):
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", re.search(r"bounds=\"([^\"]*)\"", tag).group(1)))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
' "$1"
}

# The centre of the view labelled $1, waiting up to 30s for it to appear.
# Empty (and a "missing-" screenshot) when it never does.
find_view() {
  local point=""
  for _ in $(seq 1 15); do
    point=$(centre_of "$1" || true)
    if [ -n "$point" ]; then
      echo "$point"
      return 0
    fi
    sleep 2
  done
  echo "No view labelled '$1' on screen" >&2
  shot "missing-$(echo "$1" | tr -c 'a-zA-Z0-9' '-')"
}

# Taps the view labelled $1.
tap() {
  local point
  point=$(find_view "$1")
  if [ -n "$point" ]; then
    # shellcheck disable=SC2086
    adb shell input tap $point
    sleep "${2:-2}"
  fi
}

# Long-presses the view labelled $1.
long_press() {
  local point
  point=$(find_view "$1")
  if [ -n "$point" ]; then
    # shellcheck disable=SC2086
    set -- $point
    adb shell input swipe "$1" "$2" "$1" "$2" 1200
    sleep 3
  fi
}

scroll_to_end() {
  for _ in 1 2 3 4 5 6; do
    adb shell input swipe 540 1800 540 400 150
    sleep 0.4
  done
  sleep 1
}

# Every scenario and screen.
pass() {
  local suffix=$1

  # The hidden entry: long-press the pairing title, then leave again.
  adb shell am force-stop "$package"
  adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  find_view "Pair with your Mac" >/dev/null
  shot "pair-real$suffix"
  long_press "Pair with your Mac"
  shot "long-press-busy-day$suffix"
  tap "Exit playground"
  shot "after-exit$suffix"

  open_link "scenario=busy-day&screen=sessions"
  shot "busy-day-sessions$suffix"
  open_link "scenario=busy-day&screen=transcript&session=pg-auth" 7
  shot "busy-day-transcript-working$suffix"
  open_link "scenario=busy-day&screen=transcript&session=pg-ci"
  shot "busy-day-transcript-table$suffix"
  open_link "scenario=busy-day&screen=panel"
  shot "busy-day-panel$suffix"
  scroll_to_end
  shot "busy-day-panel-end$suffix"

  open_link "scenario=empty&screen=sessions"
  shot "empty-sessions$suffix"

  open_link "scenario=edge-cases&screen=sessions"
  shot "edge-cases-sessions$suffix"
  scroll_to_end
  tap "Settled  60"
  shot "edge-cases-settled-open$suffix"
  scroll_to_end
  shot "edge-cases-settled-end$suffix"
  tap "Show more (50 settled hidden)"
  scroll_to_end
  shot "edge-cases-settled-more$suffix"

  for session in edge-long-title edge-kinds edge-markdown edge-cjk edge-rtl \
    edge-unbreakable edge-markup edge-untitled edge-no-transcript; do
    open_link "scenario=edge-cases&screen=transcript&session=$session"
    shot "edge-cases-transcript-$session$suffix"
  done

  open_link "scenario=edge-cases&screen=transcript&session=edge-kinds"
  adb shell input swipe 540 600 540 1800 150
  sleep 1
  shot "edge-cases-transcript-edge-kinds-top$suffix"
  open_link "scenario=edge-cases&screen=transcript&session=edge-markdown"
  adb shell input swipe 540 600 540 1800 150
  adb shell input swipe 540 600 540 1800 150
  sleep 1
  shot "edge-cases-transcript-edge-markdown-top$suffix"

  open_link "scenario=edge-cases&screen=transcript&session=edge-long"
  for _ in 1 2 3; do
    adb shell input swipe 540 600 540 1800 150
    sleep 0.4
  done
  sleep 1
  tap "Load earlier" 3
  shot "edge-cases-transcript-load-earlier$suffix"

  open_link "scenario=edge-cases&screen=pair"
  shot "edge-cases-pair$suffix"
  open_link "scenario=edge-cases&screen=panel"
  shot "edge-cases-panel$suffix"

  open_link "scenario=connecting&screen=sessions"
  shot "connecting-sessions$suffix"
  open_link "scenario=reconnecting&screen=sessions"
  shot "reconnecting-sessions$suffix"
  open_link "scenario=refused&screen=sessions"
  shot "refused-sessions$suffix"

  for scenario in pairing-wrong pairing-expired pairing-locked; do
    open_link "scenario=$scenario&screen=pair"
    tap "Pair" 3
    shot "$scenario-pair$suffix"
  done
}

pass ""

# Dark mode.
adb shell cmd uimode night yes
sleep 2
pass "-dark"
adb shell cmd uimode night no

# The worst environment: a 320dp-wide screen with the largest text.
density=$(adb shell wm density | tr -dc '0-9\n' | tail -1)
width=$(adb shell wm size | tr -dc '0-9x\n' | tail -1 | cut -dx -f1)
adb shell wm density $((width * 160 / 320))
adb shell settings put system font_scale 1.3
sleep 2
open_link "scenario=edge-cases&screen=sessions"
shot "narrow-edge-cases-sessions"
open_link "scenario=edge-cases&screen=transcript&session=edge-kinds"
shot "narrow-edge-cases-transcript-kinds"
open_link "scenario=edge-cases&screen=transcript&session=edge-long-title"
shot "narrow-edge-cases-transcript-long-title"
open_link "scenario=edge-cases&screen=pair"
shot "narrow-edge-cases-pair"
open_link "scenario=pairing-wrong&screen=pair"
tap "Pair" 3
shot "narrow-pairing-wrong"
open_link "scenario=edge-cases&screen=panel"
shot "narrow-edge-cases-panel"
open_link "scenario=busy-day&screen=sessions"
shot "narrow-busy-day-sessions"
adb shell settings put system font_scale 1.0
adb shell wm density "$density"

adb logcat -d >"$out/logcat.txt"
adb logcat -d -b crash >"$out/logcat-crash.txt" || true
