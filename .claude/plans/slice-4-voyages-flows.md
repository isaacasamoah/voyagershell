# Slice 4: Historical Voyage User Flows

These sketches belong to the superseded Slice 4 plan in
[slice-4-voyages.md](slice-4-voyages.md). They preserve the original
interaction intent without describing the current implementation boundary.

## Create Voyage

```
User: /create-voyage
Voyager: What would you like to call this voyage?

User: Sophiie Team
Voyager: Great! I'll create the Sophiie Team voyage.
         Slug: sophiie-team (this is the URL identifier)

         ✓ Voyage created

         Invite link: https://voyager.app/join/a8f3b2c1
         Share this with your team to let them join.

         Want me to customize how I behave for this team?

User: No, defaults are fine
Voyager: Perfect. You're now in the Sophiie Team voyage.
         Everything you share here stays with this team.
```

## Join Voyage

```
[User clicks invite link: /join/a8f3b2c1]
[If not logged in → sign up flow → redirect back]

Voyager: Welcome to Sophiie Team! 🚀

         You've joined as a crew member.

         This voyage has 3 other members:
         - Isaac (captain)
         - Sarah (navigator)
         - Mike (crew)

         What would you like to work on?
```

## Switch Context

```
User: /voyages
Voyager: Your voyages:

         → sophiie-team (current, captain)
           Sophiie AI voice agent development

         ○ side-project (crew)
           Weekend hack project

         ○ Personal (always available)
           Your private space

         Type /switch <name> to change context.

User: /switch personal
Voyager: Switched to Personal context.
         This is your private space - nothing shared here.
```
