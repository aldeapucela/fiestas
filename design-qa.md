# Design QA — ficha de actividad

## Source visual truth

- Reference: `/var/folders/8r/kmn758jj0h7cq06fx_44sb100000gp/T/codex-clipboard-4887ee84-3a40-47fd-8637-422ae7c13c17.jpg`
- Reference pixels: 853 × 1844. It was downsampled to 428 × 922 for comparison, matching the target mobile CSS viewport at approximately 2× density.

## Implementation evidence

- URL: `http://127.0.0.1:8002/e/2026-09-04-1630-concentracion-de-penas-de-valladolid-con-sesion-de-djs-chack-yaiza-rub-2a24cb5b/`
- Screenshot: `/private/tmp/fiestas-detail-map-marker-label-428x922.png`
- Combined comparison: `/private/tmp/fiestas-detail-comparison-map-marker-label.png`
- Implementation pixels and CSS viewport: 428 × 922.
- State: light theme, mobile detail page, map loaded, activity not saved.

## Full-view comparison evidence

The normalized side-by-side comparison was opened before this report. The implementation now has the requested compact hierarchy: a smaller, lighter “Detalle de actividad”, a reduced event title, a smaller category pill, tighter fact rows, and earlier visibility of the map and description.

The reference contains an editorial hero image and four fact rows; the tested activity has no `image` field and has three fact rows. This is content-data variation, not a layout regression introduced by this change.

## Focused region comparison evidence

- Header: title label uses a smaller muted treatment; back and share icons are solid; the bookmark is hollow when inactive.
- Title and category: the title clamp and category pill were reduced so long activity names occupy less vertical space. Each category pill is now a keyboard-accessible link to the all-days category filter.
- Facts: row height, padding, icon size, and text size were reduced while preserving readable wrapping.
- Map and lower content: the map and description move upward without overlapping the fixed bottom navigation. The map starts at zoom 16 so adjacent streets remain visible; the marker is green and permanently labels the place.

## Required fidelity surfaces

- Fonts and typography: existing project font stack and weight hierarchy are preserved; the detail header, title, category, and facts are now scaled down to match the reference density.
- Spacing and layout: detail padding, grid gaps, title/tag gap, category height, and fact row height were tightened.
- Colors and tokens: the muted header color and existing teal/purple tokens remain consistent with the reference direction.
- Image quality and assets: no new image asset was required; the missing hero image is explained by the tested event data.
- Copy and content: dynamic event copy is unchanged.
- Icons: back and share are solid; the inactive bookmark is regular/hollow; the active bookmark switches to solid and was tested by toggling it on and back off. Fact and category icons retain the outline treatment.
- States and interactions: map rendering was verified; bookmark toggle was verified in both states and restored to its initial state.
- Category navigation: clicking a category navigated to `/?date=all&type=Música`; the all-days date control was active and the filtered result count rendered.
- Directions action: the route icon is solid to match the mockup while the map icon remains outlined.
- Directions target: desktop keeps the generated Google Maps URL; Android rewrites it to a `geo:` intent and iOS to an Apple Maps link so the operating system can use the configured navigation app or chooser.
- Map marker: the default blue Leaflet pin was replaced by a solid green location marker with the place name visible on the map; the label now has a minimal white text edge for contrast over map tiles.
- Accessibility: semantic buttons and labels remain unchanged; no console warnings or errors were reported.

## Comparison history

1. Initial implementation review: header label, title, category pill, and facts were materially larger than the reference. Fix: reduced the detail spacing and typography scale in `src/styles/fiestas-2026.css`.
2. Post-fix review at 428 × 922: no actionable P0, P1, or P2 findings remained; the map default was corrected from zoom 18 to zoom 16 so surrounding streets remain visible.

## Follow-up polish

- P3: if editorial imagery is later added to event data, compare the hero crop and title spacing again against the reference state.

## Implementation checklist

- [x] Compact detail header and muted label.
- [x] Smaller title and category pill.
- [x] Smaller, tighter fact rows.
- [x] Solid back and share icons.
- [x] Hollow inactive bookmark and solid active bookmark.
- [x] Map and description remain visible earlier in the viewport.
- [x] Build and browser verification completed.

final result: passed
