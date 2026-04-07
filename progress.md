Original prompt: Plan a second level. The toggle to switch to this should be in the title card that says "Clockwork Atelier" at the top of the sidebar. That title card should switch to the words "Orrery Atelier". The mechanics of this are very similar, with some changes:
- No clock face
- Instead of clock hands, there should be 6 "arms" of different radii, connected to 6 concentric arbors at the center corresponing to 6 levels, for Mercury, Venus, Earth, Mars, Jupiter, and Saturn. The other end of each arm should be connected to an image of each planet.
- There should be an image of the sun in the center. When no level is selected this image obscures everything it overlaps with. When a level is selected it disappears.
- Motor in the same place. It should rotate at 1 rpm in reality, but it should be labelled 1 rev/year. The goal state for the Earth is to orbit at the same rate, and for the other planets to orbit at the correct relative period to the Earth.
- All interactions with gears should be the same as for building clocks.
- Right clicking on a planet should pull up a dialog box showing its target period (relative to the Earth) as a fraction.
- use a dark theme for this. Planets should look like the attached image.

2026-04-06
- Started implementation of dual-mode editor architecture.
- Confirmed clean worktree before edits.
- Next: refactor core types/constants/project schema to support clock + orrery workspaces.

2026-04-06
- Refactored core types, constants, geometry, solver, store, and project schema for clock + orrery modes.
- Next: generate local planet assets, then rewire the editor UI and tests against the new mode-aware state.

2026-04-06
- Rebuilt the main editor UI for dual-mode rendering, dark orrery visuals, planet assets, and per-mode persistence.
- Build now passes; next step is updating tests and e2e coverage for the new mode behavior.

2026-04-06
- Replaced the component/unit test suite for the dual-mode editor and added orrery e2e fixtures/spec coverage.
- Next: run Playwright and fix any remaining interaction regressions.

2026-04-06
- Playwright coverage passes for mode switching, planet dialogs, right-drag panning, and Earth-train badges.
- Final verification: lint the repo and clean up anything remaining.

2026-04-06
- Cleared React hook lint warnings by removing useEffectEvent handlers from dependency arrays.

2026-04-06
- Final verification complete: lint, build, unit tests, and Playwright all pass.

2026-04-06
- Adjusted the orrery sun glyph toward a denser engraved stipple fill so it reads closer to the planet art.
- Verified the updated sun in-browser with a direct screenshot after toggling to Orrery mode and deselecting the active planet layer.
- Next: keep an eye on whether the contour lines still feel too strong if the user wants the sun pushed even closer to the planet engraving style.

2026-04-06
- Gated the full orrery overlay so planets, arms, and the sun render only in the no-selection overview state.
- Updated component and Playwright coverage for the overview-only overlay behavior and verified with a fresh browser screenshot that selected-layer editing is unobstructed.

2026-04-06
- Reworked Saturn asset extraction to use a filled rotated ring-band mask from the original source image instead of a narrow outline mask.
- Regenerated the planet PNGs and verified in a fresh live-app screenshot that Saturn's rings are visible again on the orrery canvas.

2026-04-06
- Restored faint planet and arm overlays while an orrery layer is selected, but left the sun and occluder passes overview-only.
- Removed planet popup interactivity outside the no-selection overview state, updated unit/e2e coverage, and verified with a live screenshot that selected-layer editing still shows dim overlays without opening planet dialogs.

2026-04-06
- Added a Saturn-specific ring accent in the renderer because the extracted Saturn PNG was present but the rings were not reading clearly enough at the dim selected-layer opacity on the dark canvas.
- Verified with fresh selected-layer and overview screenshots that Saturn now reads with visible rings in both states, and reran unit/build/e2e checks after the change.

2026-04-06
- Replaced the Saturn asset with the user-supplied standalone Saturn PNG from the desktop and removed the temporary renderer-only ring accent so the app now uses the image directly.
- Extended the planet asset generator with an optional `--saturn-source` override, regenerated the assets, and verified the live canvas plus unit/build/e2e checks.

2026-04-06
- Increased the sun glyph stipple density substantially and added a stronger underfill so the disc reads almost opaque while still staying engraved rather than flat.
- Verified the updated sun in a fresh live orrery screenshot and reran the unit suite plus production build.

2026-04-06
- Replaced the procedural sun glyph with assets generated from the user-supplied standalone `sun.png`, using a separate corona-only occluder image so the center detail stays visible while edge flames still hide overlaps.
- Added `scripts/generate_sun_asset.py`, wired the new sun assets into the orrery overlay, and verified the live overview canvas plus unit/build checks.

2026-04-06
- Added a dedicated neutral gear palette for the no-selection overview state so gears render lighter when no layer is active, without changing the active/above/below layer styling.
- Verified the lighter overview gears in a fresh live orrery screenshot and reran the build plus unit suite.

2026-04-07
- Added orrery-only Jupiter and Saturn visibility checkboxes beside their layer buttons, defaulting both to unchecked so the sidebar starts as a 4-planet setup.
- Disabled and greyed out those layer buttons while unchecked, filtered the hidden layers out of orrery rendering/analysis, and hid their planets, arms, arbors, and layer content until re-enabled.
- Verified with `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e`, plus fresh live screenshots for the default 4-planet view and the Jupiter-enabled state.

2026-04-07
- Added optional `AM/PM` and `Day` clock layers with checkboxes, default-disabled buttons, and matching off-center outputs so those complications can be enabled without affecting the base three-hand clock.
- Generalized clock/orrery outputs to carry explicit arbor centers, updated placement/solver logic for off-center arbors, and rendered the AM/PM and Day subdials plus hands above gears and below the hand stack.
- Verified with `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e`, plus fresh screenshots for the default clock, the enabled complication state, and the full-opacity overview with both complications visible.
