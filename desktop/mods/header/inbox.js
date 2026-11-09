import { div } from "gpui-kit";
import { Popover } from "gpui-base";
import { Name, NameState } from "voyager_native";
import {
  coordination,
  coordination_watch,
  request_id,
} from "voyager_workspace";
import { projection } from "voyager_header";
import { actionButton, menuButton, menuSurface } from "./ui.js";
import { coordinationResponse as validateResponse } from "./validate.js";
function problem(error) {
  return error instanceof Error ? error.message : String(error);
}
function body(message) {
  const payload = message.payload;
  switch (payload.kind) {
    case "conversation":
      return payload.text;
    case "instruction":
      return payload.task;
    case "start":
      return `Start ${payload.name} as ${payload.rank}: ${payload.task}`;
    case "escalation":
      return `${payload.title}: ${payload.decision}`;
    case "decision":
      return payload.decision.kind === "reply"
        ? payload.decision.text
        : payload.decision.kind === "approve"
          ? "Approved"
          : "Denied";
  }
}
export class Inbox {
  constructor(id) {
    this.id = id;
    this.snapshot = null;
    this.error = "";
    this.pending = false;
    this.visible = false;
    this.observing = false;
    this.observationFailed = false;
    this.messagesOpen = false;
    this.drafts = new Map();
    this.uncertain = null;
  }
  async exchange(action, id = request_id()) {
    const request = { requestId: id, action };
    const value = JSON.parse(await coordination(JSON.stringify(request)));
    if (!validateResponse(value) || value.requestId !== id)
      throw Error(
        "The coordination result could not be verified; do not repeat the operation",
      );
    return value;
  }
  receive(response, observing = false) {
    if (
      response.snapshot &&
      (!this.snapshot || response.snapshot.revision >= this.snapshot.revision)
    )
      this.snapshot = response.snapshot;
    if (response.outcome !== "applied")
      throw Error(response.message || "The operation did not apply");
    if (!observing) this.error = response.message || "";
    for (const id of this.drafts.keys())
      if (
        !this.snapshot?.messages.some(
          (message) => message.id === id && !message.resolved,
        )
      )
        this.drafts.delete(id);
  }
  send(action, cx) {
    if (this.pending || this.uncertain) return;
    this.pending = true;
    const id = request_id();
    let knownResult = false;
    cx.spawn(async (task) => {
      try {
        const response = await this.exchange(action, id);
        knownResult = true;
        if (response.outcome === "uncertain")
          this.uncertain = { requestId: id, action };
        this.receive(response);
      } catch (error) {
        this.error = problem(error);
        if (!knownResult) this.uncertain = { requestId: id, action };
      } finally {
        this.pending = false;
        task.notify();
      }
    });
    cx.notify();
  }
  inspect(cx) {
    if (this.pending) return;
    this.pending = true;
    const original = this.uncertain;
    this.observationFailed = false;
    cx.spawn(async (task) => {
      try {
        const response = await this.exchange(
          original
            ? { operation: "inspect-request", id: original.requestId }
            : { operation: "inspect" },
        );
        if (
          original &&
          this.uncertain?.requestId === original.requestId &&
          response.outcome !== "uncertain" &&
          response.snapshot !== null
        )
          this.uncertain = null;
        this.receive(response);
      } catch (error) {
        this.observationFailed = true;
        this.error = problem(error);
      } finally {
        this.pending = false;
      }
      task.notify();
    });
  }
  observe(cx) {
    if (this.observing || this.observationFailed) return;
    this.observing = true;
    cx.spawn(async (task) => {
      try {
        while (this.visible) {
          const revision = this.snapshot?.revision;
          this.receive(await this.exchange({ operation: "inspect" }), true);
          if (!this.visible) break;
          if (this.snapshot?.revision !== revision) task.notify();
          await coordination_watch(String(this.snapshot?.revision || 0));
        }
      } catch (error) {
        this.observationFailed = true;
        this.error = problem(error);
        if (this.visible) task.notify();
      } finally {
        this.observing = false;
      }
    });
  }
  agentName(id) {
    return this.snapshot?.agents.find((agent) => agent.id === id)?.name || id;
  }
  supervisor(agent) {
    const choices = menuSurface(
      `supervisors-${agent.id}`,
      `Supervisor for ${agent.name}`,
    );
    choices.child(
      menuButton(
        `unassigned-${agent.id}`,
        `Use scope supervisor for ${agent.name}`,
      )
        .child("Use scope supervisor")
        .on_click((_event, cx) =>
          this.send(
            { operation: "assign", agent: agent.id, supervisor: null },
            cx,
          ),
        ),
    );
    for (const target of this.snapshot?.agents || []) {
      if (!target.live || target.id === agent.id || target.rank === "crew")
        continue;
      choices.child(
        menuButton(
          `assign-${agent.id}-${target.id}`,
          `Assign ${agent.name} to ${target.name}`,
        )
          .child(`${target.name} · ${target.rank}`)
          .on_click((_event, cx) =>
            this.send(
              { operation: "assign", agent: agent.id, supervisor: target.id },
              cx,
            ),
          ),
      );
    }
    return Popover.new(`supervisor-${agent.id}`)
      .trigger(
        actionButton(
          `supervisor-trigger-${agent.id}`,
          `Choose supervisor for ${agent.name}`,
        ).child(
          agent.supervisor ? this.agentName(agent.supervisor) : "By scope",
        ),
      )
      .content(choices);
  }
  escalation(message) {
    const payload = message.payload;
    if (payload.kind !== "escalation") throw Error("Expected an escalation");
    const colors = projection();
    let draft = this.drafts.get(message.id);
    if (!draft) {
      draft = NameState.new("");
      this.drafts.set(message.id, draft);
    }
    const reply = draft;
    const card = div()
      .id(`escalation-${message.id}`)
      .flex()
      .flex_col()
      .gap(8)
      .p(10)
      .rounded(5)
      .border_1()
      .border_color("#c0b1f030")
      .child(
        div().text_size(11).text_color(colors.muted).child(message.senderName),
      )
      .child(div().text_size(13).child(payload.title))
      .child(div().text_size(12).child(payload.context))
      .child(div().text_size(12).child(`Decision: ${payload.decision}`))
      .child(
        div()
          .text_size(11)
          .text_color(colors.muted)
          .child(`Affected work: ${payload.blastRadius}`),
      );
    const actions = div().flex().flex_wrap().gap(6);
    for (const kind of ["approve", "deny"])
      actions.child(
        actionButton(
          `${kind}-${message.id}`,
          `${kind === "approve" ? "Approve" : "Deny"} ${payload.title}`,
        )
          .disabled(this.pending || Boolean(this.uncertain))
          .child(kind === "approve" ? "Approve" : "Deny")
          .on_click((_event, cx) =>
            this.send(
              { operation: "resolve", id: message.id, decision: { kind } },
              cx,
            ),
          ),
      );
    return card.child(actions).child(
      div()
        .flex()
        .gap(6)
        .items_center()
        .child(
          Name.new(reply)
            .accessibility_label(`Write reply to ${payload.title}`)
            .flex_1()
            .min_w(0)
            .h(26),
        )
        .child(
          actionButton(`reply-${message.id}`, `Reply to ${payload.title}`)
            .child("Reply")
            .disabled(this.pending || Boolean(this.uncertain))
            .on_click((_event, cx) =>
              this.send(
                {
                  operation: "resolve",
                  id: message.id,
                  decision: { kind: "reply", text: reply.value() },
                },
                cx,
              ),
            ),
        ),
    );
  }
  render(cx) {
    this.visible = true;
    this.observe(cx);
    const colors = projection();
    const root = div()
      .id(`coordination-inbox-${this.id}`)
      .size_full()
      .min_h(0)
      .overflow_y_scroll()
      .p(12)
      .flex()
      .flex_col()
      .gap(10)
      .text_color(colors.foreground);
    const waiting =
      this.snapshot?.messages.filter(
        (message) =>
          message.to.kind === "user" &&
          message.payload.kind === "escalation" &&
          !message.resolved,
      ) || [];
    root.child(
      div()
        .text_size(12)
        .text_color(colors.muted)
        .child(`Needs your decision · ${waiting.length}`),
    );
    if (!this.snapshot)
      root.child(
        div()
          .text_size(12)
          .child(this.error ? "Inbox unavailable" : "Opening inbox"),
      );
    else if (!waiting.length)
      root.child(
        div()
          .text_size(12)
          .text_color(colors.muted)
          .child("No decisions waiting."),
      );
    for (const message of waiting) root.child(this.escalation(message));
    if (this.error) root.child(div().text_size(11).child(this.error));
    if (this.error || this.uncertain)
      root.child(
        actionButton("inspect-inbox-result", "Inspect inbox result")
          .child("Inspect")
          .on_click((_event, cx) => this.inspect(cx)),
      );
    root.child(
      div()
        .text_size(12)
        .text_color(colors.muted)
        .child("Agents and supervisors"),
    );
    for (const agent of this.snapshot?.agents || []) {
      if (!agent.live) continue;
      root.child(
        div()
          .flex()
          .flex_wrap()
          .items_center()
          .gap(6)
          .child(
            div()
              .flex_1()
              .min_w(0)
              .text_size(12)
              .child(`${agent.name} · ${agent.rank}`),
          )
          .child(this.supervisor(agent)),
      );
    }
    root.child(
      actionButton(
        "toggle-coordination-messages",
        "Show or hide agent messages",
      )
        .child(this.messagesOpen ? "Hide messages" : "Agent messages")
        .on_click((_event, cx) => {
          this.messagesOpen = !this.messagesOpen;
          cx.notify();
        }),
    );
    if (this.messagesOpen)
      for (const message of this.snapshot?.messages || [])
        root.child(
          div()
            .flex()
            .flex_col()
            .gap(3)
            .p(8)
            .border_1()
            .border_color("#c0b1f020")
            .child(
              div()
                .text_size(10)
                .text_color(colors.muted)
                .child(
                  `${message.senderName} → ${message.to.kind === "user" ? "You" : this.agentName(message.to.id)} · ${message.payload.kind}${message.acknowledged ? " · read" : ""}`,
                ),
            )
            .child(div().text_size(12).child(body(message))),
        );
    return root;
  }
}
