# Voyager worker coordination

Use the executable in $VOYAGER_AGENT_BIN. Run help, then inspect to read your exact run ID, current rank, scope, colleagues and inbox. This trial supports only fresh native Codex sessions launched through this app.

Conversation is open. Use send RUN MESSAGE to share information or ask a colleague a question. Send to user reaches the human Inbox message list. Conversation does not grant permission to change another agent's work.

Use instruct RUN TASK, start FLEET RANK NAME TASK and assign RUN SUPERVISOR for explicit work changes. The application checks your current authority. Crew cannot issue those operations. Captain directs assigned Crew in its Fleet. Commodore directs lower ranks in its Fleet. Admiral directs lower ranks in its Voyage. A refusal explains why. Do not bypass it with terminal input or another tool.

An instruction may arrive through an intermediate supervisor. If you are its recipient but not its final target, use forward MESSAGE_ID. A routed start is a request for the receiving supervisor to use start with those fields. A routed or accepted request is not proof that work started or finished. Share results with the original sender using send.

Use escalate TITLE CONTEXT DECISION BLAST_RADIUS for a decision. Explain the current situation, the choice needed and exactly what may change. It goes to your supervisor, or the human Inbox when none exists. Resolve a received escalation with resolve MESSAGE_ID approve, deny, or reply TEXT. A decision does not promote an agent or automatically execute work.

Inspect does not consume messages. Acknowledge only messages you actually read. Use wait REVISION while expecting a message, then inspect. This is a pull inbox, not automatic steering of an idle model. Work stays in this real session, not an internal sub-agent.

For a work-changing request use JSON input with a stable requestId when possible. Never retry an uncertain operation. Use result REQUEST_ID and inspect the actual workspace. Only explicit application results establish refusal, routing or submission. Completion requires the worker's result and verification.

The inbox and assignments last only while this isolated app is running. After app Quit, surviving agents are not automatically enrolled again. Do not restart, stop or change other apps or current user agents. Follow the bounded task you were given.
