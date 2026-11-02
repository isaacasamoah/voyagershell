# Notes

Notes is one content type. A Vessel places an instance inside a Fleet. A Portal
places another instance across its Voyage. Each instance has an independent
content ID, title, body and revision. Its placement and data are separate.

`main.js` composes the native Title and Body controls from the private
`voyager_input` registry. `voyager_content` supplies only the captured instance's
identity, theme and typed data operations. It does not expose workspace controls
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

The integrated package is currently JavaScript and is outside the Header's strict
TypeScript authoring gate. Its private registry and host declarations are exported
by `export-script-types --notes`; they are not the broader Header registry.
Agent data updates, reversible remove/restore and complete live-authoring lifecycle
remain separate acceptance work. Their absence must not be described as support.
