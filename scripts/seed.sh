#!/usr/bin/env bash
# fills the app with demo inventory through the public API (same path the browser uses)
# usage: BASE_URL=http://localhost:3000 ./scripts/seed.sh
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"

post() { curl -fsS -X POST "$BASE_URL$1" -H 'Content-Type: application/json' -d "$2" >/dev/null; }

#        sku       name                         category       qty reorder price    supplier
while IFS='|' read -r sku name category qty reorder price supplier; do
  post /api/products "{\"sku\":\"$sku\",\"name\":\"$name\",\"category\":\"$category\",\"quantity\":$qty,\"reorder_level\":$reorder,\"unit_price\":\"$price\",\"supplier\":\"$supplier\"}" \
    && echo "created $sku" || echo "skipped $sku (exists?)"
done <<'DATA'
KB-104|Mechanical Keyboard (TKL)|Peripherals|42|10|3499.00|Keychron India
MS-220|Wireless Mouse|Peripherals|8|15|1299.00|Logitech
MN-270|27-inch 4K Monitor|Displays|12|4|28999.00|Dell Technologies
CB-010|USB-C to USB-C Cable 1m|Cables|160|50|349.00|Anker
HB-007|7-port USB Hub|Accessories|0|5|2199.00|Anker
LS-015|Aluminium Laptop Stand|Accessories|25|8|1899.00|Portronics
HS-330|Noise-cancelling Headset|Audio|6|6|7499.00|Sony
WC-108|1080p Webcam|Video|19|5|3299.00|Logitech
SSD-1T|1TB NVMe SSD|Storage|31|10|6799.00|Samsung
RT-AX3|Wi-Fi 6 Router|Networking|3|4|5499.00|TP-Link
DATA

# a few movements so the activity feed and grafana counter have data
id_of() { curl -fsS "$BASE_URL/api/products?search=$1" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])'; }
move() { post "/api/products/$(id_of "$1")/movements" "{\"change\":$2,\"reason\":\"$3\",\"note\":\"$4\"}"; }
move KB-104 -4 SALE "order #1041"
move CB-010 60 RESTOCK "PO-2210"
move MS-220 -3 SALE "order #1042"
move SSD-1T -2 SALE "order #1043"
move LS-015 -1 ADJUSTMENT "damaged in storage"
echo "seeded $BASE_URL"
