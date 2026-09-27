#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 INPUT_IMAGE [OUTPUT_IMAGE]" >&2
  echo "Example: $0 photo.jpg photo-pixel-art.jpg" >&2
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 2
fi

input=$1
if [[ $# -eq 2 ]]; then
  output=$2
else
  input_name=$(basename -- "$input")
  input_stem=${input_name%.*}
  output="${input_stem}-pixel-art.jpg"
fi

ffmpeg -hide_banner -i "$input" \
  -filter_complex \
  "[0:v]scale=200:-2:flags=area,split[small][palette_src];[palette_src]palettegen=max_colors=32:stats_mode=full[palette];[small][palette]paletteuse=dither=none,scale=1600:-2:flags=neighbor[out]" \
  -map "[out]" -q:v 2 "$output"

printf 'Created %s\n' "$output"
