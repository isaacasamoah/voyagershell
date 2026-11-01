const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { ContentApplication } = require("./generated/content.cjs");

class PortalHost {
  constructor(workspace, library) {
    this.workspace = workspace;
    this.library = library;
    this.contentOwner = new ContentApplication({
      describe: (id) => {
        const place = workspace.portal(id);
        if (place.portal.id !== id)
          throw Error("Use the content ID, not a process address.");
        const definition = library.definition(place.portal.type || "terminal");
        return { typeId: definition.id, stateSchema: definition.stateSchema };
      },
      read: (id) => library.read(id),
      write: (id, data, expected) => library.write(id, data, expected),
      inFocus: (id) => workspace.containsPortal(id),
    });
  }

  content(input, caller) {
    return this.contentOwner.handle(input, caller);
  }

  async call(input, scoped = false, bound) {
    const { action, id, type } = input;
    if (
      bound &&
      (!["inspect", "update", "action"].includes(action) || bound !== id)
    )
      throw Error("A view can act only on its bound portal.");
    const global = () => {
      if (bound || (scoped && this.workspace.focus().kind !== "home"))
        throw Error("Package changes need whole-workspace focus.");
    };
    if (action === "catalog") {
      const focus = this.workspace.focus();
      const globalFocus = !scoped || focus.kind === "home";
      return {
        root: globalFocus ? this.library.root : undefined,
        types: globalFocus
          ? this.library.catalog()
          : this.library
              .catalog()
              .map(({ id, name, description, renderer }) => ({
                id,
                name,
                description,
                renderer,
              })),
        removed: globalFocus
          ? fs.readdirSync(path.join(this.library.root, ".uninstalled"))
          : [],
        layouts: this.library
          .layouts()
          .filter(
            (item) =>
              globalFocus ||
              item.owner === focus.dimension ||
              (focus.kind === "realm" &&
                this.workspace
                  .places()
                  .some(
                    (place) =>
                      place.dimension.id === item.owner &&
                      place.realm.id === focus.realm,
                  )),
          ),
      };
    }
    if (["source", "uninstall", "restore"].includes(action)) {
      global();
      if (action === "source")
        return this.library.source(
          type,
          input.file,
          input.text,
          input.expected,
        );
      return this.library.uninstall(type, action === "restore");
    }
    if (bound && bound !== id)
      throw Error("A view can act only on its bound portal.");
    const current = this.workspace.portal(id);
    if (scoped && !this.workspace.containsPortal(id))
      throw Error("That portal is outside Voyager's current focus.");
    const definition = this.library.definition(
      current.portal.type || "terminal",
    );
    if (action === "describe")
      return this.content(
        {
          version: "1",
          requestId: randomUUID(),
          contentId: current.portal.id,
          operation: "content.describe",
        },
        bound
          ? { kind: "frame", contentId: bound }
          : scoped
            ? { kind: "agent" }
            : { kind: "owner" },
      );
    if (action === "inspect") {
      this.library.seed(id, definition.id);
      const snapshot = {
        id,
        type: definition.id,
        contract: definition.contract || "Package-defined JSON data.",
        ...this.library.read(id),
        dataFile: this.library.dataFile(id),
        source: path.join(this.library.root, "packages", definition.id),
      };
      if (definition.workspace) {
        const result = await this.workspace.core.rpc("terminal.list", {
          all: true,
        });
        if (scoped && !this.workspace.containsPortal(id))
          throw Error("Voyager's focus changed before inspection.");
        snapshot.workspace = {
          processes: result.terminals.filter(
            (item) => !scoped || this.workspace.includes(item.address),
          ),
          context: scoped ? this.workspace.context() : this.workspace.state,
        };
      }
      return snapshot;
    }
    if (action === "update") {
      const result = this.content(
        {
          version: "1",
          requestId: randomUUID(),
          contentId: current.portal.id,
          operation: "content.update",
          data: input.data,
          expectedRevision: input.expected,
        },
        bound
          ? { kind: "frame", contentId: bound }
          : scoped
            ? { kind: "agent" }
            : { kind: "owner" },
      );
      if (result.status !== "applied")
        throw Object.assign(Error(result.message), {
          code: result.code || result.status,
        });
      return {
        data: result.snapshot.data,
        version: result.snapshot.revision,
        error: result.snapshot.warning,
      };
    }
    if (action === "action") {
      if (
        !definition.workspaceActions?.includes(input.kind) ||
        input.kind !== "show"
      )
        throw Error("This package does not declare that workspace action.");
      await this.workspace.action(
        "show",
        { terminal: input.input?.terminal },
        scoped,
      );
      return { shown: true };
    }
    throw Error("Unknown portal action.");
  }
}

module.exports = { PortalHost };
