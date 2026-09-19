#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Builds the ultra-cinematic 720p24 tool preview clips with ffmpeg-static,
# derived in-house from the photorealistic showcase assets so every clip stays
# geometry-matched to the tool's real output imagery.
#
#   1 exterior   — day → dusk transformation of the luxury villa facade
#   2 interior   — penthouse walkthrough pan, obsidian & gold styling
#   3 sketch     — hand-drawn concept morphing into the photorealistic render
#   4 masterplan — aerial drone flyover of the masterplanned community
#   5 landscape  — infinity pool / fire-pit / garden golden-hour sweep
#   6 staging    — unfurnished room morphing into the staged luxury interior
#   7 enhancer   — draft texture wiping into 8K photorealism
#   8 floorplan  — 2D colour plan assembling into the technical CAD sheet
#
# Frame-generation note: inputs are SINGLE-FRAME images and `zoompan d=FRAMES`
# emits the Ken Burns animation itself. (Never feed `-loop 1 -t N` stills into
# zoompan — every input frame would be expanded N×, producing an ~20k-frame
# clip instead of a 6-second one.)
#
# Usage:  bash scripts/build-tool-videos.sh [clip ...]   # default: all 8
# Output: public/videos/tool-*.mp4  (1280×720, 24fps, H.264 high, faststart)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

FFMPEG="$(node -e "process.stdout.write(require('ffmpeg-static'))")"
PUB=public
OUT=$PUB/videos
mkdir -p "$OUT"

WANT=("$@")
if [ ${#WANT[@]} -eq 0 ]; then
  WANT=(exterior interior sketch masterplan landscape staging enhancer floorplan)
fi
want() { local n; for n in "${WANT[@]}"; do [ "$n" = "$1" ] && return 0; done; return 1; }

ENC=(-c:v libx264 -profile:v high -crf 19 -preset veryfast -pix_fmt yuv420p -r 24 -movflags +faststart)

# Ken Burns headroom canvas (small enough for fast zoompan on CI-class boxes).
ZC=1680x945
CROP=1680:945 # crop takes colon-separated expressions, unlike scale
FRAMES=144    # 6 seconds at 24fps

# Shared segment: single still → cover-scale headroom → Ken Burns zoom → 720p.
seg() { # $1=input index  $2=zoompan expr  $3..=extra filters
  local idx=$1 zp=$2; shift 2
  printf '[%s:v]scale=%s:force_original_aspect_ratio=increase,crop=%s,fps=24,' "$idx" "$ZC" "$CROP"
  printf 'zoompan=%s:s=1280x720:fps=24:d=%s' "$zp" "$FRAMES"
  for f in "$@"; do printf ',%s' "$f"; done
  printf '[a%s]' "$idx"
}

CINEMA=(vignette=PI/5.5,fade=t=in:st=0:d=0.6)

if want exterior; then
echo "== 1 exterior — daylight villa → dusk =="
"$FFMPEG" -y -v error -i "$PUB/hero-after-villa.jpg" -i "$PUB/hero-night-pool.jpg" -filter_complex "
    $(seg 0 "z='1+0.08*in/144':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" eq=saturation=1.05);
    $(seg 1 "z='1+0.05*in/144':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)/2'" eq=brightness=-0.05:saturation=1.18 colorbalance=rm=0.06:gm=0.01:bm=-0.08);
    [a0][a1]xfade=transition=fade:duration=2.4:offset=3.4,trim=duration=6,setpts=PTS-STARTPTS,${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-exterior.mp4"
fi

if want interior; then
echo "== 2 interior — penthouse walkthrough pan =="
"$FFMPEG" -y -v error -i "$PUB/poster-interior.jpg" -filter_complex "
    $(seg 0 "z='1.06':x='(iw-iw/zoom)*(1-in/144)':y='(ih-ih/zoom)/2'" eq=saturation=1.08:brightness=0.01 colorbalance=rm=0.04:bm=-0.04);
    [a0]${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-interior.mp4"
fi

if want sketch; then
echo "== 3 sketch — pencil morph → photoreal render =="
"$FFMPEG" -y -v error -i "$PUB/poster-sketch.jpg" -i "$PUB/hero-after-villa.jpg" -filter_complex "
    $(seg 0 "z='1+0.10*in/144':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" eq=contrast=1.05);
    $(seg 1 "z='1+0.10*in/144':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
    [a0][a1]xfade=transition=dissolve:duration=2.4:offset=3.4,trim=duration=6,setpts=PTS-STARTPTS,${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-sketch.mp4"
fi

if want masterplan; then
echo "== 4 masterplan — aerial drone flyover =="
"$FFMPEG" -y -v error -i "$PUB/poster-masterplan.jpg" -filter_complex "
    $(seg 0 "z='1.10':x='(iw-iw/zoom)*in/144':y='(ih-ih/zoom)*in/144'" eq=saturation=1.06);
    [a0]${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-masterplan.mp4"
fi

if want landscape; then
echo "== 5 landscape — infinity pool & garden golden hour =="
"$FFMPEG" -y -v error -i "$PUB/poster-landscape.jpg" -filter_complex "
    $(seg 0 "z='1.07':x='(iw-iw/zoom)*in/144':y='(ih-ih/zoom)/2'" eq=saturation=1.12:brightness=0.015 colorbalance=rm=0.05:gm=0.01:bm=-0.05);
    [a0]${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-landscape.mp4"
fi

if want staging; then
echo "== 6 staging — unfurnished → luxury staged =="
"$FFMPEG" -y -v error -i "$PUB/preview-staging-before.jpg" -i "$PUB/poster-staging.jpg" -filter_complex "
    $(seg 0 "z='1.04':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
    $(seg 1 "z='1+0.06*in/144':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
    [a0][a1]xfade=transition=fade:duration=2.4:offset=3.4,trim=duration=6,setpts=PTS-STARTPTS,${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-staging.mp4"
fi

if want enhancer; then
echo "== 7 enhancer — draft texture wiping into 8K =="
"$FFMPEG" -y -v error -i "$PUB/preview-enhancer-before.jpg" -i "$PUB/poster-enhancer.jpg" -filter_complex "
    $(seg 0 "z='1.02':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
    $(seg 1 "z='1.02':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
    [a0][a1]xfade=transition=wiperight:duration=2:offset=3.8,trim=duration=6,setpts=PTS-STARTPTS,${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-enhancer.mp4"
fi

if want floorplan; then
echo "== 8 floorplan — 2D plan assembling into CAD sheet =="
"$FFMPEG" -y -v error -i "$PUB/preview-floorplan-before.jpg" -i "$PUB/preview-floorplan-after.jpg" -filter_complex "
    $(seg 0 "z='1.05':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
    $(seg 1 "z='1+0.07*in/144':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
    [a0][a1]xfade=transition=circleopen:duration=2.2:offset=3.6,trim=duration=6,setpts=PTS-STARTPTS,${CINEMA[*]},fade=t=out:st=5.4:d=0.6[v]
  " -map "[v]" "${ENC[@]}" "$OUT/tool-floorplan.mp4"
fi

echo "== verification: decode + duration of requested clips =="
rc=0
for name in "${WANT[@]}"; do
  f="$OUT/tool-$name.mp4"
  if [ ! -f "$f" ]; then echo "MISSING $f"; rc=1; continue; fi
  "$FFMPEG" -v error -i "$f" -f null - >/dev/null 2>&1 || { echo "DECODE FAIL $f"; rc=1; }
  dur=$("$FFMPEG" -i "$f" 2>&1 | sed -n 's/.*Duration: \([0-9:.]*\).*/\1/p' | head -1)
  printf '%-40s %6s KB  %s\n' "$f" "$(( $(stat -c%s "$f") / 1024 ))" "$dur"
done
[ "$rc" -eq 0 ] && echo "requested cinematic tool clips built and verified"
exit "$rc"
