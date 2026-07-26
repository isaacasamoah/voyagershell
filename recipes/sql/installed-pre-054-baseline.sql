-- Deterministic local model of only the installed public facts required by
-- migrations 054-059 and their adversarial authority proof.
\ir installed-pre-054/core.sql
SELECT format(
  'ALTER DATABASE %I SET search_path = public, extensions',
  current_database()
)
\gexec
\ir installed-pre-054/knowledge.sql
\ir installed-pre-054/functions.sql
