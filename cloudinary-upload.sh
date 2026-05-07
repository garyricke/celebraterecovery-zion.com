#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  Cloudinary Upload Script — Celebrate Recovery Zion 20th Anniversary
#  Uploads all campaign images and outputs Cloudinary URLs
# ─────────────────────────────────────────────────────────────────
#
#  Usage:
#    1. Set your credentials below (or export them as env vars before running)
#    2. chmod +x cloudinary-upload.sh
#    3. ./cloudinary-upload.sh
# ─────────────────────────────────────────────────────────────────

CLOUD_NAME="${CLOUDINARY_CLOUD_NAME:-YOUR_CLOUD_NAME}"
API_KEY="${CLOUDINARY_API_KEY:-YOUR_API_KEY}"
API_SECRET="${CLOUDINARY_API_SECRET:-YOUR_API_SECRET}"
FOLDER="cr-zion-20th"

IMAGES_DIR="$(dirname "$0")/images"

# ── Validate ──
if [[ "$CLOUD_NAME" == "YOUR_CLOUD_NAME" ]]; then
  echo "❌  Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET first."
  echo "    Example: CLOUDINARY_CLOUD_NAME=mycloud CLOUDINARY_API_KEY=123 CLOUDINARY_API_SECRET=abc ./cloudinary-upload.sh"
  exit 1
fi

echo "☁️   Uploading to Cloudinary → cloud: $CLOUD_NAME / folder: $FOLDER"
echo ""

# ── Upload function ──
upload_image() {
  local file="$1"
  local public_id="$2"
  local filename
  filename=$(basename "$file")

  echo -n "  Uploading $filename ... "

  TIMESTAMP=$(date +%s)
  # Build signature string
  SIG_STRING="folder=${FOLDER}&public_id=${public_id}&timestamp=${TIMESTAMP}${API_SECRET}"
  SIGNATURE=$(echo -n "$SIG_STRING" | shasum -a 256 | awk '{print $1}')

  RESPONSE=$(curl -s -X POST \
    -F "file=@${file}" \
    -F "public_id=${public_id}" \
    -F "folder=${FOLDER}" \
    -F "api_key=${API_KEY}" \
    -F "timestamp=${TIMESTAMP}" \
    -F "signature=${SIGNATURE}" \
    "https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload")

  # Extract secure_url
  URL=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('secure_url','ERROR'))" 2>/dev/null)

  if [[ "$URL" == ERROR* ]] || [[ -z "$URL" ]]; then
    echo "❌ FAILED"
    echo "     Response: $RESPONSE"
  else
    echo "✅  $URL"
    echo "$public_id=$URL" >> cloudinary-urls.txt
  fi
}

# Clear previous output
rm -f cloudinary-urls.txt
touch cloudinary-urls.txt

echo "── Campaign Images ──────────────────────────────────────"
upload_image "$IMAGES_DIR/hero-aurora-church.png"        "hero-aurora-church"
upload_image "$IMAGES_DIR/social-chena-aurora.png"       "social-chena-aurora"
upload_image "$IMAGES_DIR/social-story-birch-path.png"   "social-story-birch-path"
upload_image "$IMAGES_DIR/print-alaska-range.png"        "print-alaska-range"
upload_image "$IMAGES_DIR/community-gathering.jpeg"      "community-gathering"
upload_image "$IMAGES_DIR/hands-connecting.jpeg"         "hands-connecting"
upload_image "$IMAGES_DIR/zion-church-professional.png"  "zion-church-professional"
upload_image "$IMAGES_DIR/zion-church-rainbow.jpg"       "zion-church-rainbow"
upload_image "$IMAGES_DIR/tommy-woodard-cutout.png"       "tommy-woodard-cutout"
upload_image "$IMAGES_DIR/tommy-woodard-whitebackground-with-light-shadow-crop-headshot.png" "tommy-woodard-headshot"

echo ""
echo "── Church & Existing Assets ─────────────────────────────"
for img in "$IMAGES_DIR"/zion-lutheran-church-*.jpg "$IMAGES_DIR"/zion-lutheran-church-*.png; do
  [[ -f "$img" ]] || continue
  base=$(basename "${img%.*}")
  upload_image "$img" "$base"
done

upload_image "$IMAGES_DIR/Celebrate-Recovery-Logo-Left-White_RM.svg" "cr-logo-white"
upload_image "$IMAGES_DIR/anniversary-seal.svg"                      "anniversary-seal"
upload_image "$IMAGES_DIR/anniversary-seal-mark.svg"                  "anniversary-seal-mark"
upload_image "$IMAGES_DIR/aurora-bg-email.png"                        "aurora-bg-email"

# Also upload Tommy's portrait from project root
TOMMY="$(dirname "$0")/tommy-woodard-portait-b.jpg"
[[ -f "$TOMMY" ]] && upload_image "$TOMMY" "tommy-woodard-portrait"

echo ""
echo "── Complete ─────────────────────────────────────────────"
echo "✅  All URLs saved to cloudinary-urls.txt"
echo ""
cat cloudinary-urls.txt
