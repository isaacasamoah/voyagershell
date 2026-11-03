# Notes

Notes is one content type. A Vessel places an instance inside a Fleet. A Portal
places another instance across its Voyage. Each instance has an independent
content ID, title, body and revision. Its placement and data are separate.

`main.ts` is the checked shipped source; `main.js` is its emitted, editable native
package entry. It composes the native Title and Body controls from the private
`voyager_input` registry. `voyager_content` supplies only the captured instance's
identity, request identity, theme, versioned change notification and typed data operations. It does not expose workspace controls
or terminal constructors. The Rust content contract generates the validators in
`validate.js`. Package source is seeded once into the profile and remains editable.
Editing source affects all copies of that package. Editing instance data affects
only its content ID.

The view keeps the draft and native focus. Rust owns persisted title/body data.
Inspect the current revision before updating. Known stale or invalid-data refusals
keep the draft usable. Clear the known cause before a deliberate retry. A lost
confirmation is uncertain, so another unchanged blur must not repeat the save.
The host binds the caller outside the request. Changing a content ID in JSON does
not grant access to another instance.

Run the existing `npm run scripts:generate` and `npm test` from the repository
when changing the shipped TypeScript. The same strict pipeline checks Notes in its
own private declaration scope using `export-script-types --notes` and the generated
content definitions. It does not expose Header or Terminal constructors to Notes.
The profile's personal JavaScript remains editable and is not overwritten or
automatically typechecked by repository commands.
The administrator source candidate exposes voyager_content describe, inspect and
update through this same owner. First inspect voyager_workspace for the captured
content ID and workspace version, then describe and inspect that exact Notes ID.
Update requires its original expectedRevision and complete title/text data. IDs,
paths, roles, thread and scope cannot grant authority through payload fields. New
Notes must be created through workspace create-content; inspect never recreates
missing data. Hidden data requires current captured membership. Preserve every
schema/freshness warning. Limited results are incomplete and identify their known
revision and warning presence. Never repeat an Uncertain update automatically.

The view listens for targeted owner changes and rereads outside rendering. Dirty
text and its original base revision remain unchanged when another writer updates
that instance. A stale refusal is deliberate protection of that draft, not a reason
to replace its revision with an agent receipt. A change signal may follow an
Uncertain write, but its read is not a repeated update.

Real-provider/native N3 acceptance, reversible remove/restore and complete
live-authoring lifecycle remain separate gates. The source interface alone does
not establish them.
