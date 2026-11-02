# Voyager Home

`home.js` composes the native Home overview from the current workspace snapshot.
Edit this file to change its arrangement or presentation. `navigate` accepts the
workspace's generated selection actions. Selecting a Voyage or Fleet changes the
view; it does not change the avatar's explicit context or start another program.
The application keeps the last usable package when a live edit fails.

Fleet saved layouts are separate workspace data. They retain placement and
content identities and do not change this source composition.
