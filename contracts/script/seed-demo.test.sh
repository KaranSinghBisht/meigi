#!/usr/bin/env bash
# Tests seed-demo.sh's registration guard with a stubbed `cast`: no chain, no keys, nothing sent.
#   bash contracts/script/seed-demo.test.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=seed-demo.sh
. "$here/seed-demo.sh"

REGISTRY=0x205c977cF1f4Ed42e51a48759550eF40160A6396
RPC=http://stub.invalid
OFFICER=0x01
EVIDENCE=0x02
ATTESTER_PRIVATE_KEY=not-a-key
STATUS=0
SENT=0
failures=0

# payeeOf's tuple as `cast call` prints it; the legal name holds a comma on purpose.
cast() {
  [ "$1" = "call" ] || { echo "unexpected: cast $*" >&2; return 1; }
  echo "(\"合同会社テスト, 支店\", 0x48Fb4b07fC4E9366D07B7611Fe57E1a2261dE17F, 0xba5Ea94C62C2a86FE0d2FE50c6DB8002155D389b, $ZERO, 0, $ZERO, 0, 1, 1, $STATUS, 0xf8b96e6b0387f0ec42ba9d83575afbfe17774918210bba7a834f3b562e3248ae)"
}
send() { SENT=$((SENT + 1)); }

expect() { # expect <description> <actual> <expected>
  if [ "$2" = "$3" ]; then
    echo "ok: $1"
  else
    echo "FAIL: $1 (expected $3, got $2)"
    failures=$((failures + 1))
  fi
}

for STATUS in 1 2; do
  SENT=0
  register "$BAYSIDE_T_NUMBER" "$BAYSIDE_NAME" 0xc0 "$BAYSIDE_PAYOUT" >/dev/null
  expect "status $STATUS (registered) is skipped, nothing sent" "$SENT" 0
done

STATUS=0
SENT=0
register "$BAYSIDE_T_NUMBER" "$BAYSIDE_NAME" 0xc0 "$BAYSIDE_PAYOUT" >/dev/null
expect "an unregistered number is registered" "$SENT" 1

STATUS=2
expect "payee_status reads the status past a comma in the name" "$(payee_status "$BAYSIDE_T_NUMBER")" 2

cast() { echo "garbage"; }
if payee_status "$BAYSIDE_T_NUMBER" >/dev/null 2>&1; then
  expect "unparseable payeeOf output fails loudly" "passed" "failed"
else
  expect "unparseable payeeOf output fails loudly" "failed" "failed"
fi

[ "$failures" -eq 0 ] && echo "all seed-demo checks passed" || { echo "$failures failed"; exit 1; }
