#!/bin/bash
# usage: woff2ify <output=./public/fonts> <input_ttfs...>
#
# converts each input ttf to woff2 and writes to output directory
#
# requires woff2_compress from: https://github.com/google/woff2
# $ brew install woff2
#

# fail on error
set -e

# get output directory
output=${1:-./public/fonts}
shift

# create output directory
mkdir -p "$output"

# convert each input ttf to woff2
for ttf in "$@"; do
  woff2_compress "$ttf"
  mv "${ttf%.ttf}.woff2" "$output"
done

echo "---- woff2ify: done ----"
