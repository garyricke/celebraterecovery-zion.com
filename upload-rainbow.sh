#!/usr/bin/env bash
# One-off upload for the new Zion church rainbow hero image.
# Run with your Cloudinary creds set:
#   CLOUDINARY_CLOUD_NAME=dsbllwpbh CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… ./upload-rainbow.sh

set -e
CLOUD_NAME="${CLOUDINARY_CLOUD_NAME:-dsbllwpbh}"
API_KEY="${CLOUDINARY_API_KEY:?set CLOUDINARY_API_KEY}"
API_SECRET="${CLOUDINARY_API_SECRET:?set CLOUDINARY_API_SECRET}"
FOLDER="cr-zion-20th"
PUBLIC_ID="zion-church-rainbow"
FILE="$(dirname "$0")/images/zion-church-rainbow.jpg"

TIMESTAMP=$(date +%s)
SIG=$(echo -n "folder=${FOLDER}&overwrite=true&public_id=${PUBLIC_ID}&timestamp=${TIMESTAMP}${API_SECRET}" \
      | shasum -a 256 | awk '{print $1}')

echo "☁️   Uploading $(basename "$FILE") → ${CLOUD_NAME}/${FOLDER}/${PUBLIC_ID}"

curl -s -X POST \
  -F "file=@${FILE}" \
  -F "public_id=${PUBLIC_ID}" \
  -F "folder=${FOLDER}" \
  -F "overwrite=true" \
  -F "api_key=${API_KEY}" \
  -F "timestamp=${TIMESTAMP}" \
  -F "signature=${SIG}" \
  "https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅ ',d.get('secure_url',d))"
