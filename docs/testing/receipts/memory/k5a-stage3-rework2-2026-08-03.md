# K5A stage-3 rework round 2

- Curator claims now carry the real `sourceCreatedAt` and `sessionId` from the
  079 event join; operational filtering uses the existing recent-session set
  rather than an always-true missing-session branch.
- Prompt composition performs one graph read per person root. The result is
  passed into curator; the duplicate claim-budget-64 read is gone.
- The stale `<50ms` curator comment and post-cutover promotion-boost wording
  are removed.
- Both remember paths use the same message-event contract: voyage context plus
  `preference` classification.
- Added a behavioral tier-placement test covering preference, operational, and
  domain claims.
- Removed dead generated row types/imports, unused context snippet, and stale
  share-test wording.

Verification: full suite 95 files / 500 tests green; type-check and diff-check
green. No live database touched.
