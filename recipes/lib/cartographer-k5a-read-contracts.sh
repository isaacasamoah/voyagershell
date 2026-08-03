[ -f "$BOUNDARY_SOURCE" ] || fail 'knowledge-kernel boundary source is missing'
[ -f "$RELATION_CONTRACT_SOURCE" ] || fail 'relation contract source is missing'
[ -f "$FLOOR_RECEIPT_SOURCE" ] || fail 'floor measurement receipt is missing'

PER_CLAIM_PARTNER_CAP="$(node -e '
  const fs = require("node:fs")
  const ts = require("typescript")
  const source = fs.readFileSync(process.argv[1], "utf8")
  const file = ts.createSourceFile(
    process.argv[1], source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )
  const caps = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "normalizeBudget" && node.arguments.length === 4) {
      const [value, , , maximum] = node.arguments
      if (ts.isPropertyAccessExpression(value) &&
          ts.isIdentifier(value.expression) && value.expression.text === "options" &&
          value.name.text === "perClaimPartnerCap" && ts.isNumericLiteral(maximum)) {
        caps.push(maximum.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (caps.length !== 1) process.exit(1)
  process.stdout.write(caps[0])
' "$BOUNDARY_SOURCE")" || fail 'could not read per-claim partner cap from source'

RESPONSE_FLOOR_MS="$(node -e '
  const fs = require("node:fs")
  const ts = require("typescript")
  const source = fs.readFileSync(process.argv[1], "utf8")
  const file = ts.createSourceFile(
    process.argv[1], source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )
  const floors = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        node.name.text === "RESPONSE_FLOOR_MS" && node.initializer &&
        ts.isNumericLiteral(node.initializer)) floors.push(node.initializer.text)
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (floors.length !== 1) process.exit(1)
  process.stdout.write(floors[0])
' "$BOUNDARY_SOURCE")" || fail 'could not read RESPONSE_FLOOR_MS from source'

RELATION_CANDIDATE_LIMIT="$(node -e '
  const fs = require("node:fs")
  const contract = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  process.stdout.write(String(contract.blocking.candidateLimit))
' "$RELATION_CONTRACT_SOURCE")" || fail 'could not read active relation candidateLimit'

BOUNDARY_OVERHEAD_MS="$(node -e '
  const fs = require("node:fs")
  const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  process.stdout.write(String(receipt.boundary.phase_overhead_p95_ms))
' "$FLOOR_RECEIPT_SOURCE")" || fail 'could not read measured boundary overhead'

G5_EXACT_UNITS="$(node -e '
  const fs = require("node:fs")
  const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  process.stdout.write(String(receipt.proposal.g5_exact_recall_through_authorized_units))
' "$FLOOR_RECEIPT_SOURCE")" || fail 'could not read measured G5 exact horizon'

[[ "$PER_CLAIM_PARTNER_CAP" =~ ^[1-9][0-9]*$ ]] \
  || fail 'per-claim partner cap is not a positive integer'
[[ "$RESPONSE_FLOOR_MS" =~ ^[1-9][0-9]*$ ]] \
  || fail 'response floor is not a positive integer'
[[ "$RELATION_CANDIDATE_LIMIT" =~ ^[1-9][0-9]*$ ]] \
  || fail 'relation candidate limit is not a positive integer'
[[ "$BOUNDARY_OVERHEAD_MS" =~ ^[0-9]+([.][0-9]+)?$ ]] \
  || fail 'boundary overhead is not a nonnegative number'
[[ "$G5_EXACT_UNITS" =~ ^[1-9][0-9]*$ ]] \
  || fail 'G5 exact horizon is not a positive integer'
