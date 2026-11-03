# Notes

Notes is one content type. A Vessel places an instance inside a Fleet. A Portal
places another instance across its Voyage. Each instance has an independent
content ID, title, body and revision. Its placement and data are separate.

`main.ts` is the checked shipped source; `main.js` is its emitted, editable native
package entry. It composes the retained native Title and Body controls from the private
`voyager_input` registry. Create SessionState before RetainedTitleState and
RetainedBodyState. Their values are read-only script handles to the existing
native editors. Rust keeps their draft, original revision, input focus and save
bookkeeping through supported source replacement. Native blur saves;
SessionState.save requests the same save explicitly. `voyager_content` supplies only the captured instance's
identity, request identity, theme, versioned change notification and typed data operations. It does not expose workspace controls
or terminal constructors. The Rust content contract generates the validators in
`validate.js`. Package source is seeded once into the profile and remains editable.
Editing source affects all copies of that package. Editing instance data affects
only its content ID.

Per-instance presentation is separate from package source and title/body data.
The supported setting is `showHeading`, a Boolean defaulting to true. The script
reads `SessionState.show_heading()` to show the existing NOTES eyebrow. Keep the
same retained title/body controls when it changes. Both Notes and Header declare
numeric `contentConfiguration: 1` in their manifests for this capability.

Describe the instance before configuring it. When configuration is declared,
Inspect returns its effective configuration and workspaceVersion beside the data
snapshot. Use that workspaceVersion as the content tool's expectedVersion for
`configure`, with the content ID and complete `{ "showHeading": false }` value.
The configured result returns the accepted value and resulting workspace version.
The title/text revision stays unchanged. A stale request requires fresh inspection;
an uncertain result permits read-only inspection, never automatic replay.

The retained native session keeps the draft and native focus. Rust owns persisted title/body data.
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
The administrator exposes voyager_content describe, inspect, configure and
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

Native journeys have separate receipts and limits. This guide describes the
supported interface, not acceptance of the full content or lifecycle module.

Personal packages are never overwritten. Old TitleState/BodyState and bound
voyager_content signatures remain available for their original controller. They
do not automatically acquire retained native draft migration. Upgrade the
personal source deliberately to use the retained session. A broken supported
source edit keeps the prior usable composition with its error. A retired
generation cannot queue a new data operation; an accepted save still settles
the same retained session. General deferred/layout failure detection and actual
native repeated-reload resource limits remain unproved.

An older personal package without the configuration declaration retains its
default behavior. Update it explicitly. Loading an older strict Header after
saving configuration may expose its validation/load error; preserve the source,
configuration and data until that Header is explicitly updated or restored.
