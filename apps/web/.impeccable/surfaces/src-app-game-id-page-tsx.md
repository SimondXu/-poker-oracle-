---
version: 1
slug: "src-app-game-id-page-tsx"
primary_target: "src/app/game/[id]/page.tsx"
related_targets: ["src/app/page.tsx","src/app/room/[id]/page.tsx"]
---

# Surface brief: AiPoker app (home → waiting room → table → hand end)

Scope: whole web app; visitor mode Operate. Primary target the table screen; home and waiting room inherit its world.
Audience/job: solo NLHE learner practicing vs AI bots; reads the table under a 30s clock; acts by button or hotkey; wants coaching at the decision point.
Showcase (user-approved recommendation): one-click quick start into a seated table; coach on by default on hero turn; bot personalities and status visible (opponents tab, thinking state); light per-hand summary.
Constraints: no fabricated capabilities (no coach chat box, no action-frequency mix unless the engine supplies it); i18n EN / 中文 toggle; 4-color deck; hotkeys; reduced motion; 390px phone works.
Memorable moment: the pot living inside a card-back medallion at table center, the acting seat ringed in vermilion.

## Direction contract

THESIS: The table set like a premium printed deck: two inks, engraved line, index typography. Refuses the category default of flat neon-green felt with white plates and yellow bubbles (and the navy-gold casino glow).

OWN-WORLD: Ink-navy ground and panels from one 11-step tinted ramp; deep baize green felt with a darker rail and a faint engraved guilloche rosette; court-card vermilion as the single loud ink (to-act, raise, error); ivory card stock only on playing cards and seat plates; muted brass for hairlines and the dealer disc. Condensed index face for every number and label; quiet UI face for prose. Seat state vocabulary: to-act (vermilion ring + timer, lifts), waiting (ivory), folded (sunk, one ink step down), all-in (vermilion stamp), winner (brass rule + payout).

STORY: The learner sees whose turn it is, the pot and every stack instantly, reads the coach's equity vs required equity, acts in one keystroke, then sees who won with what and moves to the next hand without a modal.

FIRST VIEWPORT: Top bar 48px (wordmark, room code chip, NLHE 10/20, Hand #, EN/中文). 56px left icon rail. Felt oval fills the stage; pot medallion centered above the board; five card slots; seats on the rail; bets as engraved chips toward center. Hero cards large at bottom center over an ivory plate with timer. Action bar docked bottom-right of the stage, clear of the hero (sizing row, then Fold | Call | Raise). Right 340px panel: Log | Coach | Opponents, Coach open on hero turn.

FORM: Card-Room Print (classic playing-card printing), position 4 of the ordered grounded list; seed key 875631b0. Raises: one tinted ramp for neutrals; strict seat state vocabulary; actor lifts, others dim; log bet bars sized to bet/pot; right-aligned tabular numbers that reconcile; one display face at fixed scale steps.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
