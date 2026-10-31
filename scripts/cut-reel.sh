#!/usr/bin/env bash
# Cuts the 19-second hero reel from the five generated clips. Reproducible: `npm run reel`.
#
#   coil (ramp to motion-interpolated slow-mo) │flash│ braze (fast → slow-mo → fast)
#   │flash│ manifold (2× in, then real time) │flash│ diffuser (real time → slow-mo hold).
#   The generated heat-pump clip is not used: its unit morphs and grows fake lettering.
#
# Grade: warm split-tone + gentle contrast curve + vignette. No grain is baked in: the browser adds
# it live (baked grain roughly triples the file size at the same quality).
# Outputs: public/media/video/reel-1080.mp4, reel-720.mp4, poster.webp
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=assets-src/video
TMP=assets-src/reel-tmp
OUT=public/media/video
mkdir -p "$TMP" "$OUT"

FPS=24
# Normalise every source to 1920×1080, 24 fps, yuv420p before cutting.
NORM="scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},format=yuv420p"
# Motion-interpolated slow motion: synthesise in-between frames, then stretch time.
slow() { # $1 factor (e.g. 2.5 = 2.5× slower)
  local f=$1
  local up; up=$(awk "BEGIN{printf \"%d\", ${FPS}*${f}+0.5}")
  echo "minterpolate=fps=${up}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=${f}*PTS,fps=${FPS}"
}
fast() { echo "setpts=PTS/$1,fps=${FPS}"; }

# seg <name> <src> <start> <dur> <speed-filter-or-empty>
seg() {
  local name=$1 src=$2 ss=$3 dur=$4 sp=${5:-}
  local vf="$NORM"
  [ -n "$sp" ] && vf="$vf,$sp"
  ffmpeg -hide_banner -loglevel error -y -ss "$ss" -t "$dur" -i "$SRC/$src" -vf "$vf" -an \
    -c:v libx264 -preset medium -crf 14 -pix_fmt yuv420p "$TMP/$name.mp4"
  echo "  cut $name"
}

echo "Cutting segments…"
seg a1 v1-coil.mp4      0.00 2.20
seg a2 v1-coil.mp4      2.20 1.10 "$(slow 2.5)"        # ramp: 1.1 s → 2.75 s
seg b1 v3-braze.mp4     0.40 1.40 "$(fast 1.6)"        # ramp in fast
seg b2 v3-braze.mp4     1.80 1.00 "$(slow 2.6)"        # sparks in slow motion
seg b3 v3-braze.mp4     3.60 1.20 "$(fast 2.0)"        # snap out
seg c1 v4-manifold.mp4  0.00 1.60 "$(fast 2.0)"
seg c2 v4-manifold.mp4  1.60 2.60
seg e1 v5-diffuser.mp4  0.00 3.40
seg e2 v5-diffuser.mp4  3.40 1.40 "$(slow 2.2)"        # end on the cold air falling

# Two-frame flash frame at the cuts (warm white, not pure white, so bloom reads as light).
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0xFFF1DE:s=1920x1080:r=${FPS}:d=$(awk "BEGIN{print 2/${FPS}}")" \
  -vf format=yuv420p -c:v libx264 -crf 14 "$TMP/flash.mp4"

cat > "$TMP/list.txt" <<EOF
file 'a1.mp4'
file 'a2.mp4'
file 'flash.mp4'
file 'b1.mp4'
file 'b2.mp4'
file 'b3.mp4'
file 'flash.mp4'
file 'c1.mp4'
file 'c2.mp4'
file 'flash.mp4'
file 'e1.mp4'
file 'e2.mp4'
EOF

# Warm grade: lift the shadows toward Armaflex blue-black, push the highlights toward copper,
# a soft S-curve, then a vignette. No grain.
GRADE="colorbalance=rs=-0.03:bs=0.04:rh=0.05:bh=-0.04,curves=all='0/0.02 0.25/0.21 0.5/0.5 0.78/0.82 1/0.97',eq=saturation=1.06,vignette=angle=PI/4.2:mode=forward"

echo "Concatenating + grading…"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$TMP/list.txt" -vf "$GRADE,format=yuv420p" -an \
  -c:v libx264 -preset slow -crf 22 -profile:v high -movflags +faststart "$OUT/reel-1080.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$OUT/reel-1080.mp4" -vf "scale=1280:720:flags=lanczos" -an \
  -c:v libx264 -preset slow -crf 24 -profile:v high -movflags +faststart "$OUT/reel-720.mp4"
# Poster: a frame from the frosted coil, as WebP.
ffmpeg -hide_banner -loglevel error -y -ss 1.2 -i "$OUT/reel-1080.mp4" -frames:v 1 -c:v libwebp -quality 80 "$OUT/poster.webp"

for f in "$OUT"/reel-*.mp4; do
  printf '%-34s %6s KB  %ss\n' "$f" "$(( $(stat -c %s "$f") / 1024 ))" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
echo "done."
