---
paths:
  - "frontend/src/lib/domain/mascot.ts"
  - "frontend/src/lib/components/mascot/**"
  - "frontend/scripts/epiduck/**"
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
- **He greets each visit, once**: when the talent arrives he stops and says hello, which is why the header carries no « Salut, {prénom} » of its own (the mockup's choice: one greeting, said by the character). Once per visit, kept in the tab's `sessionStorage`, never on each page change, where by the third click it would be noise. The greeting reads the last visit before today off the streak's visit days (`Talent.streakLastDay`, and `streakPreviousDay`, the day the first visit of today moved past), in `locals.talentTimezone`, the day the streak counts in, so the two never disagree about what « today » is: weeks away, it becomes the welcome back. Never off `streakLastDay` alone: the streak is counted before the route guards, so a first request a guard redirects has already moved it by the time a page greets.
- **He keeps his spot on the screen from page to page.** The lane writes back where he was, in window coordinates, read off his swim animation rather than the page, whose elements are out of the document by the time its teardown runs. That only holds because the header's first row is the same on every page: a page that put something in it would move his water.
- **The questionnaires**: a form with no persona of its own is hosted by the talent's duck (`PersonaAvatar`, `ChatScreen`), and `{canard}` in its texts is whoever speaks. A form may still set a guest persona, which wins.

## Drawing and moving him

He is an illustration, so `DESIGN.md` § Mascot holds his palette (`art/palette.json`, the only place his colours are written) and the one licence he has from § Motion: a character moves continuously, overshoots and squashes, which a control never does. Asked for less motion, he stays put, does not bob, squash or follow the pointer, and his dives are fades.

- **He is modelled in Blender, and the script is the source** (`frontend/scripts/epiduck/build.py`, run by `bun run art:epiduck`). The first duck was hand-drawn SVG, refused before merge: a duck drawn twice, once per pose, never agreed with itself, and the front one was a stack of circles. One model gives both poses. Never edit `art/epiduck.webp` or `art/epiduck.json` by hand, and never commit a `.blend`, which would become a second source nobody can review: change the script and run it, so a review reads what changed. How to open him in Blender, iterate through the Blender MCP and judge the result (`sheet.png`) is the script's header.
- **One atlas of layers, never a picture per look.** Each layer (body, pupils, lids, every hair, pair of glasses and scarf colour) is rendered alone with the body as a holdout, so stacking the ones a talent chose draws the dressed duck, and a new accessory adds one cell per pose rather than multiplying the combinations. `epiduckAtlas.test.ts` fails on an accessory of the catalogue the atlas does not draw.
- **He still blinks and looks around**, because his eyes are layers: the lids replace the pupils, and a gaze moves the pupils within the eye. Both pupils rest on one point (the reader, or ahead of him in profile): centred on eyes turned outward, they made him look walleyed. The pupils are clipped to the eye whites, so a hard look meets the edge of the eye instead of sliding off it, and the lane aims his gaze from his eyes (`eyesOnScreen`) on every frame and eases it there, so it stays on a still pointer while he swims. The white sticker outline is drawn round the whole stack by the component, never baked into a layer, so it follows whatever he wears.

Accessories are all free (decided 22/11/2026). Earning one is a possible later reward and would be a rule on the badge side, never a lock in this code.
