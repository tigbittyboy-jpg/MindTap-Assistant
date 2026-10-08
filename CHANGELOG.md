# Release notes

## v0.6.8

- Match smaller/larger compressor comparisons while preserving which compressor is being compared with which.
- Resolve “these compressors” from one nearby sentence with an unambiguous named compressor type.
- Treat same/similar/equal capacity wording as equivalent and show a comparison explanation with its source.
- No AI or backend required; incompatible comparisons remain inconclusive.

## v0.6.7

- Require retrieved passages to describe the asked HVAC component connection; do not qualify text from section titles or generic words alone.
- Focus passage windows on the relevant connection and exclude following explanations of another connection.
- Connect relevant subcooling definitions to normal subcooled-liquid state questions, with a stated reasoning rule and source passage.
- Deduplicate identical windows; retain manual selection and no-AI operation.

## v0.6.6

- Match condenser/compressor/evaporator inlets and outlets separately, including leaving/entering wording.
- Recognize reordered pure-phase descriptions such as “100% liquid and subcooled.”
- Prioritize question wording and add passage windows around the asked component connection.
- Keep ambiguity and negation checks; no AI or backend needed for textbook matching.

## v0.6.5

- Rewrite the README as a beginner walkthrough, with no-AI installation first and separate optional Mac and Windows AI steps.
- Add Windows PowerShell commands, Python launcher checks, and Windows-specific troubleshooting to the same v0.6.5 release.
- Show the exact extension folder to select, expected success messages, and simple troubleshooting.
- Make archive-preserving updates the default; explain that removing the extension deletes saved sections.
- Documentation update; no backend changes or restart required.

## v0.6.4

- Add deterministic R-410A subcooling calculations using a bundled CoolProp 7.2.0 bubble-point PT table.
- Show the formula, calculated result, closest rounded choice, and table source rather than AI confidence.
- Support one psig pressure and one Fahrenheit liquid temperature; stop unsupported inputs and unmatched/ambiguous choices instead of guessing.
- Works in both modes, without AI; textbook-only mode still needs no backend.
- Update extension and backend; restart the backend if using it directly.

## v0.6.3

- Show a possible answer text match, short matching reason, and source sentence alongside passages in textbook-only mode.
- Require one distinct choice match in relevant, non-negated sentences; ambiguous and unsupported question forms show passages only.
- Keep manual selection, no AI calls, and no backend requirement.

## v0.6.2

- Add a saved Textbook-only mode that finds up to three relevant passages without Ollama or the backend.
- Show source section titles and passages; leave answer selection and navigation to the reader.
- Disable AI selection/automation controls in this mode and discard stale AI suggestions when switching.
- Keep Local AI optional and preserve existing AI mode defaults. Add simple textbook-only setup instructions.
- Extension-only update; no backend restart required.

## v0.6.1

- Adds "Austin Taylor · @atslo.m4a" footer with an Instagram link.
- Extension-only update; no backend restart needed.

## v0.6

- Warm the model on backend startup and keep it loaded between questions.
- Lower the default output limit from 2048 to 512 tokens with thinking off; allow OLLAMA_MAX_TOKENS overrides.
- Cache up to 256 validated answers / 8 MB in memory, keyed by exact question, ordered choices, excerpts, settings, and instructions.
- Serialize generation to avoid duplicate simultaneous work; failed responses are not cached.
- Show cached reuse in answer status. Restart the updated backend to apply these changes.

## v0.5.5.6

- Add stationary residential/light commercial HVAC and heat pump context to the model instructions.
- Require matching the exact application, distinguishing blends from pure refrigerants, and checking choice/explanation consistency within the single pass.
- Preserve textbook context and one AI request; no independent second check.
- Restart the updated backend to apply the new instructions.

## v0.5.5.5

- Swap the answer/status card and textbook save progress card, placing answers higher in the assistant.
- Extension-only layout update; no backend restart required.

## v0.5.5.4

- Keep one AI answer with relevant textbook excerpts as context.
- Remove textbook-only generation and mandatory quote matching that blocked valid answers.
- Retain answer validation, short explanations, and faster textbook capture.
- Update extension and backend, then restart the backend.

## v0.5.5.3

- Remove independent double checking: one model request per question.
- Keep textbook references and verify supporting quotes when excerpts are supplied.
- Reduce textbook capture polling from 2 seconds to 750 ms while retaining the two-poll stability check.
- Update both backend and extension; restart the backend.

## v0.5.5.2

- Accept control messages from the detached assistant extension page.
- Continue rejecting commands from ordinary webpage tabs.
- Show recovery instructions when a reply is missing instead of an undefined-property error.

## v0.5.5.1

- Replaced automatic-mode checkbox and Stop button with a single On/Off switch.
- On starts immediately; Off requests a stop without needing an active page.
- Synchronizes state in popup/detached windows and resets Off when automation ends.
- Analyze question remains a manual action.

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
