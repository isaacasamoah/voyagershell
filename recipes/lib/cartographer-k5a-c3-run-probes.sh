# Sourced after migrations 078-080 so every call-path probe is unconstrained.
run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-poc.sql" \
  > "$TEMP_DIR/c3-small-verdict.out" \
  || fail 'C3 seeded-corpus assertions failed'
verdict="$(<"$TEMP_DIR/c3-small-verdict.out")"
[ "$verdict" = CARTOGRAPHER_K5A_C3_R7_SMALL_GREEN ] \
  || fail 'exact small-regime C3 verdict missing'

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -v per_claim_partner_cap="$PER_CLAIM_PARTNER_CAP" \
  -v relation_candidate_limit="$RELATION_CANDIDATE_LIMIT" \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-r7-shapes.sql" \
  > "$TEMP_DIR/c3-shape-verdict.out" \
  || fail 'C3 R7 shape-space assertions failed'
shape_verdict="$(<"$TEMP_DIR/c3-shape-verdict.out")"
[ "$shape_verdict" = CARTOGRAPHER_K5A_C3_R7_SHAPES_GREEN ] \
  || fail 'exact C3 R7 shape-space verdict missing'

for index in $(seq 1 8); do
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-probe.sql" \
    > "$TEMP_DIR/probe-$index.out" 2>&1 &
  track_pid "$!"
done
reap_pids || fail 'one or more small-regime concurrent probes failed'
probe_verdicts="$(rg --no-filename -N '^K5A_C3_CONCURRENT_PROBE_GREEN$' \
  "$TEMP_DIR"/probe-*.out | wc -l | tr -d ' ')"
[ "$probe_verdicts" = 8 ] \
  || fail "8 small-regime concurrent probes produced $probe_verdicts green verdicts"

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-realistic.sql" \
  > "$TEMP_DIR/c3-realistic-verdict.out" \
  || fail 'C3 realistic-regime assertions failed'
realistic_verdict="$(<"$TEMP_DIR/c3-realistic-verdict.out")"
[ "$realistic_verdict" = CARTOGRAPHER_K5A_C3_R7_REALISTIC_GREEN ] \
  || fail 'exact realistic-regime C3 verdict missing'

for index in $(seq 1 8); do
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-probe.sql" \
    > "$TEMP_DIR/realistic-probe-$index.out" 2>&1 &
  track_pid "$!"
done
reap_pids || fail 'one or more realistic-regime concurrent probes failed'
probe_verdicts="$(rg --no-filename -N '^K5A_C3_CONCURRENT_PROBE_GREEN$' \
  "$TEMP_DIR"/realistic-probe-*.out | wc -l | tr -d ' ')"
[ "$probe_verdicts" = 8 ] \
  || fail "8 realistic-regime concurrent probes produced $probe_verdicts green verdicts"

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c4-r5-assertions.sql" \
  > "$TEMP_DIR/c4-r5-verdict.out" \
  || fail 'C4 R5 exact authorized-subset assertions failed'
c4_verdict="$(<"$TEMP_DIR/c4-r5-verdict.out")"
[ "$c4_verdict" = CARTOGRAPHER_K5A_C4_R5_GREEN ] \
  || fail 'exact C4 R5 verdict missing'

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-v5-dynamics.sql" \
  > "$TEMP_DIR/c3-v5-dynamics-verdict.out" \
  || fail 'C3 recoverable type-error dynamics assertion failed'
dynamics_verdict="$(<"$TEMP_DIR/c3-v5-dynamics-verdict.out")"
[ "$dynamics_verdict" = CARTOGRAPHER_K5A_C3_V5_DYNAMICS_GREEN ] \
  || fail 'exact C3 v5 dynamics verdict missing'

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c5-structural-falsifier.sql" \
  > "$TEMP_DIR/c5-structural-verdict.out" \
  || fail 'structural audience-inheritance assertions failed'
structural_verdict="$(<"$TEMP_DIR/c5-structural-verdict.out")"
[ "$structural_verdict" = CARTOGRAPHER_K5A_C5_STRUCTURAL_GREEN ] \
  || fail 'exact structural audience-inheritance verdict missing'

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-082-session-repair.sql" \
  > "$TEMP_DIR/082-session-repair-verdict.out" \
  || fail '082 session-id projection assertions failed'
session_repair_verdict="$(<"$TEMP_DIR/082-session-repair-verdict.out")"
[ "$session_repair_verdict" = CARTOGRAPHER_K5A_082_SESSION_REPAIR_GREEN ] \
  || fail 'exact 082 session-id projection verdict missing'

if [ "${K5A_FLOOR_MEASUREMENT:-0}" = 1 ]; then
  run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
    -v ON_ERROR_STOP=1 -v response_floor_ms="$RESPONSE_FLOOR_MS" \
    -v boundary_overhead_ms="$BOUNDARY_OVERHEAD_MS" \
    -v g5_exact_units="$G5_EXACT_UNITS" \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-floor-measurement.sql" \
    > "$TEMP_DIR/floor-database-verdict.out" \
    || fail 'clean floor database measurement failed'
  floor_verdict="$(<"$TEMP_DIR/floor-database-verdict.out")"
  [ "$floor_verdict" = CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN ] \
    || fail 'exact clean floor database verdict missing'
  printf '%s\n' CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN
fi

if [ "${K5A_G8_CURVE_MEASUREMENT:-0}" = 1 ]; then
  run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
    -v ON_ERROR_STOP=1 -v response_floor_ms="$RESPONSE_FLOOR_MS" \
    -v boundary_overhead_ms="$BOUNDARY_OVERHEAD_MS" \
    -v boundary_jitter_stddev_ms="$BOUNDARY_JITTER_STDDEV_MS" \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-g8-curve.sql" \
    > "$TEMP_DIR/g8-curve.out" \
    || fail 'clean post-G8 curve measurement failed'
  curve_verdict="$(tail -n 1 "$TEMP_DIR/g8-curve.out")"
  [ "$curve_verdict" = CARTOGRAPHER_K5A_G8_CURVE_GREEN ] \
    || fail 'exact post-G8 curve verdict missing'
  sed -n '1,$p' "$TEMP_DIR/g8-curve.out"
fi

printf '%s\n' CARTOGRAPHER_K5A_C3_LOCAL_GREEN
