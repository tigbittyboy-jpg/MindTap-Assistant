# Release notes

## v0.5.5

- Removed Choose Next button and balanced the question-control grid.

- Disagreements trigger a textbook-only third pass when matching saved excerpts exist.
- Require a supporting quote found in the cited excerpt before continuing automation.
- Display the source and quote; pause if reference evidence is missing or invalid.
- Allow up to 285 seconds for the three passes. Update backend and extension.

## v0.5.4

- Added a dedicated live textbook status card showing reading, saving, waiting, and errors.
- Display section count and storage usage even when revisiting an already saved section.
- Continue capture while the detached assistant has focus; suggest refreshing when no reader is detected.

## v0.5.3

- Added Open in window for a persistent detached assistant controlling the original browser window’s active tab.
- Textbook auto-save defaults on; explicit off settings and archive clearing stay respected.
- Removed manual Save textbook section.
- Added ng.cengage.com site access for detached question controls.

## v0.5.2.1

- Added one-click Clear textbook archive; clearing disables auto-save.
- Reduced the archive limit to 10 MB. Existing larger archives are preserved but cannot accept new sections.
- Kept Chrome unlimitedStorage permission so quiz history and settings do not compete with the 10 MB archive cap.

## v0.5.2

- Optional automatic saving of each opened Cengage textbook section after text stabilizes.
- Persistent toggle, duplicate detection, separate textbook status, and stop on save errors.
- Added ebook reader access for automatic capture; no automated navigation or whole-book fetching.

## v0.5.1

- Read textbook paragraphs from Cengage’s same-origin iframe-page reader frame.
- Capture the heading inside that frame and use its own styles to filter hidden text.
- Avoid saving reader shell/sidebar text if the book frame is empty.

## v0.5

- Save readable Cengage textbook sections in local Chrome storage, with a 500 MB archive limit and unlimitedStorage permission.
- Search saved sections and supply up to three bounded excerpts to both independent checks.
- Show reference section titles or indicate that no excerpts matched.
- Update both backend and extension to enable textbook context.

## v0.4.2

- Automatically opens Review after the last verified answer, then clicks Finish once and stops.
- Stops if Finish is missing or ambiguous; respects Stop before finishing.
- Recognizes Review labels and checklist icons.

## v0.4.1

- Short explanations for both answer checks: 1–2 sentences requested, with a 360-character limit per explanation.
- Rewrote setup and troubleshooting instructions in plain language.

## v.0.3.4 patch notes

- Uses local Ollama exclusively.
- Reads Learnosity displayed answer text marked `aria-hidden` without duplicate screen-reader text.
- Handles empty labels, repeated selection labels, and nested custom radio controls.
- Reports unreadable and duplicate answer-label counts for troubleshooting.

## v.0.3.5 patch notes

- Resolves Learnosity screen-reader label references to the displayed answer copy.
- Reads displayed answers inside aria-hidden row wrappers while excluding visually hidden rows.

## v.0.3.6 patch notes

- Redesigned the popup with a navy palette, indigo and teal actions, and a rose Stop control.
- Arranged actions and automatic mode in a symmetrical two-column grid.
- Removed the Export recent run button and its download handler.
- Added a visible version badge, keyboard focus indicators, and a compact status panel.

## v.0.3.7 patch notes

- Added a navy and indigo book icon with a mint sparkle.
- Configured 16px/32px toolbar icons and 48px/128px extension listing icons.
- Removed white corner backgrounds and regenerated all icon sizes with transparency.

## v0.4 patch notes

- Every analysis runs two sequential Ollama conversations; the second receives the original question without the first answer.
- The second pass emphasizes exact application, qualifiers, every option, and unit checks.
- Agreement returns both explanations and the lower confidence estimate. Agreement is not proof of correctness.
- Disagreement stops automatic mode before selecting or advancing and displays both answers for manual review. No suggestion is stored on failure.
- The extension refuses unchecked responses from older backends. Update both extension and backend.
- Each pass uses OLLAMA_TIMEOUT_SECONDS (5–90, default 90); the extension allows 195 seconds total. Expect roughly twice the generation time. Thinking remains off by default; to turn it off in an existing terminal, run `export OLLAMA_THINK=false` before restarting.
