---
paths:
  - "frontend/src/lib/domain/mascot.ts"
  - "frontend/src/lib/components/mascot/**"
  - "frontend/src/lib/server/services/mascotService.ts"
  - "frontend/src/lib/server/adminApi/writes/mascot.ts"
  - "frontend/src/lib/components/feedback/{PersonaAvatar,ChatScreen}.svelte"
---

# EpiDuck, the talent space's mascot

EpiDuck is the blue duck in every talent header (#539). He exists for what Jump exists for, bringing a talent back: a character who recognises the talent, answers them and welcomes them when they return gives the space a reason to be opened beyond what it lists. He replaced « Bernard le canard », a photo of a rubber duck that hosted the questionnaires, so there is one mascot, and he is the talent's own: named and dressed by them (`Talent.mascot*`), hosting their questionnaires under that name.

## The code decides when he speaks, an admin decides what he says

- **The moments are a closed catalogue in code** (`MASCOT_MOMENTS` in `domain/mascot.ts`), each with the tokens its lines may cite. A moment exists because something in the code fires it, so adding one is code: the trigger, its entry, a default line in the migration that adds it. Retiring one deletes its lines in a migration, as a retired usage key does.
- **The lines are data** (`Mascot_Line`), written over `write_mascot_line` and read back by `config_mascot_lines`, common to every campus. A seasonal line is a window (`startsOn`, `endsOn`), never code. This is why he is not `devVoice.ts`: the dev space's lines are a developer's to write, his are the PO's, and a badge created over the API (#448) has to be explained by a line nobody could have written in advance.
- **A token is refused at write, never left in a bubble**, the certificate contract rather than the feedback form's: `{jours}` printed on a minor's screen is a bug the reader cannot report.
- **Silence is a valid state.** A moment with no live line says nothing, without an error and without a fallback in code, which would be a second place a line lives.
- **Lines rotate by a key, never at random** (`pickLine`): the first poke of a day does not always open with the same one, and a greeting holds still all day. His movements are random, and may be: nothing about them is rendered on the server.

## His voice

Talents are often minors, and he speaks to each one by name. A line:

1. **says « tu »**, short enough for a bubble (`MASCOT_LINE_MAX`), warm, with no developer jargon (the mockup's « T'as push ton code ? » was rewritten before it shipped);
2. **never reproaches.** He welcomes a talent back after weeks away, he never counts the days against them: guilt is the dark pattern a mascot makes easiest, and the one this audience is most exposed to;
3. **is never said over a failure**, where the copy only says what failed and what to do;
4. **is never at the talent's expense.**

The tool description of `write_mascot_line` carries these rules to the model that writes for the PO, since that model is the author in practice.

## Where he lives, and what holds his state

- **In every talent header** (`TalentPageHeader` mounts `MascotLane` and the sleep button), never in the staff or parent spaces. A page without that header (émargement, welcome) has no duck unless a moment brings him there.
- **His state outlives the page**: `MascotController` is made once per talent in `(talent)/+layout.svelte` and handed down by context, because each page draws its own header and a duck rebuilt on every navigation would jump back to the start. It is never a module-level object, which the server would share between requests.
- **Asleep is a preference, stored** (`Talent.mascotAsleepAt`, through `putMascotToSleep`): it lasts on every page and device. A sulk, after too many pokes, is his own and ends by itself (`nextPhase`).
- **The greeting reads the previous visit** off `Talent.streakLastDay` as the request loaded it, in `locals.talentTimezone`, the day the streak counts in, so the two never disagree about what « today » is.
- **The questionnaires**: a form with no persona of its own is hosted by the talent's duck (`PersonaAvatar`, `ChatScreen`), and `{canard}` in its texts is whoever speaks. A form may still set a guest persona, which wins.

## Drawing and moving him

He is an illustration, so `DESIGN.md` § Mascot holds his palette (`art/palette.ts`, the only place his colours are written) and the one licence he has from § Motion: a character moves continuously, overshoots and squashes, which a control never does. Asked for less motion, he stays put, does not bob, squash or follow the pointer, and his dives are fades. The sprite sheets the mockup was built with are not shipped: the SVG layers they were drawn from are (`EpiDuck.svelte`), because a sheet is raster, weighs megabytes and cannot blink.

Accessories are all free (decided 22/11/2026). Earning one is a possible later reward and would be a rule on the badge side, never a lock in this code.
