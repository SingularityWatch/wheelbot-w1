#!/usr/bin/env bash
# Build the launch GIF for Twitter: the figure first, then the four Blender clips.
set -e
FF="/c/Users/Иван/AppData/Local/hermes/tools/ffmpeg-9.0.1-win32-x64/bin/ffmpeg"
SRC="E:/figures/phonebot/renders/anim2"
FIG="E:/figures/phonebot/repo/renders/figure-dark.png"
OUT="E:/figures/phonebot/repo/renders"
TMP="C:/Users/Иван/AppData/Local/hermes/cache/scratch/tw"
rm -rf "$TMP"; mkdir -p "$TMP"

# 1. the figure, slowly zooming — 1.6 s at 15 fps
"$FF" -y -loglevel error -loop 1 -i "$FIG" -t 1.6 \
  -vf "scale=2200:-1,zoompan=z='min(zoom+0.0009,1.14)':d=24:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=15" \
  -frames:v 24 "$TMP/fig_%04d.png"

# 2. the four clips as a two-by-two contact grid — 2.4 s each, cropped to 16:9
for c in walk turret drive stand; do
  "$FF" -y -loglevel error -framerate 24 -i "$SRC/$c/f%04d.png" -frames:v 58 \
    -vf "crop=1100:619:90:150,scale=640:360,fps=15" "$TMP/${c}_%04d.png"
done

n=$(for c in walk turret drive stand; do ls "$TMP"/${c}_*.png | wc -l; done | sort -n | head -1)
echo "grid frames: $n"
i=1
while [ "$i" -le "$n" ]; do
  f=$(printf "%04d" "$i")
  "$FF" -y -loglevel error -i "$TMP/walk_$f.png" -i "$TMP/turret_$f.png" \
    -i "$TMP/drive_$f.png" -i "$TMP/stand_$f.png" \
    -filter_complex "[0:v][1:v]hstack[top];[2:v][3:v]hstack[bot];[top][bot]vstack" \
    "$TMP/grid_$f.png"
  i=$((i + 1))
done

# 3. one list, figure first, then the grid; three loops of the grid keeps it under 10 s
(
  for f in "$TMP"/fig_*.png; do echo "file '$f'"; echo "duration 0.0667"; done
  for rep in 1 2 3; do
    for f in "$TMP"/grid_*.png; do echo "file '$f'"; echo "duration 0.0667"; done
  done
  echo "file '$(ls "$TMP"/grid_*.png | tail -1)'"
) > "$TMP/list.txt"

"$FF" -y -loglevel error -f concat -safe 0 -i "$TMP/list.txt" \
  -vf "fps=15,split[a][b];[a]palettegen=max_colors=192:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 "$OUT/wheelbot-twitter.gif"

ls -la "$OUT/wheelbot-twitter.gif" | awk '{printf "gif: %.1f MB\n", $5/1048576}'
"$FF" -v error -i "$OUT/wheelbot-twitter.gif" -f null - 2>&1 | head -2
echo done
