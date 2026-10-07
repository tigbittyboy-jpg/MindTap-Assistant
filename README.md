# MindTap Study Assistant v.0.3.7

A Chrome Manifest V3 extension with a local Python gateway to local Ollama. It reads one visible multiple-choice question, explains a suggested answer, selects that answer on request, and can click Next. Optional automatic mode selects and advances without a question-count limit, regardless of model-reported confidence. It continues until stopped or a navigation or request error occurs. Confidence is an AI estimate, not a guarantee of correctness.

## Install

1. Install Python 3.10+ on the **same computer as Chrome**. No Python packages are required.
2. Install and start Ollama on the same computer as Chrome, then run `ollama pull qwen3:8b`. Optionally set `OLLAMA_MODEL` to another installed model.
3. From this repository, run `python3 backend/server.py`. On Windows, use `python backend/server.py`. Leave the terminal running. The backend binds only to `127.0.0.1:8765`.
4. Open Chrome's Extensions page, enable Developer mode, click **Load unpacked**, and select the `extension` folder.
5. Open a MindTap question and click the extension. Use **Analyze question**, review the suggestion, then **Select suggested answer**. **Click Next** advances when exactly one recognizable Next or Continue control is present.
6. To automate, enable **Automatically select and advance**, then click **Analyze question**. Reopen the popup to view status or stop. Closing the popup does not stop the run. Stop takes effect before the next action; a click already in progress cannot be undone.

Question text and choices are sent only to your local Ollama service when you analyze. No cloud API key is used. The backend does not save questions. Use it where assistance is permitted.

## Local Ollama (no cloud quota)

Install and open Ollama on the same computer as Chrome, then run `ollama pull qwen3:8b` to download the model (or `ollama run qwen3:8b` to download and try a chat). Keep the Ollama app/service running. In a separate terminal, from this repository:

```bash
export OLLAMA_MODEL="qwen3:8b"
python3 backend/server.py --check-connection
python3 backend/server.py
```

No API key is required. Stop any previous backend before starting this one, since port 8765 must be free. Optional `OLLAMA_TIMEOUT_SECONDS` accepts 5–90 seconds (default 90). First generation may be slower while the model loads; the backend requests non-streaming structured JSON with thinking disabled. Local requests bypass HTTP proxy settings. Ollama must be listening at `127.0.0.1:11434`. Close memory-heavy applications if generation is slow. Changing to another installed model is supported through `OLLAMA_MODEL`; model accuracy and speed vary.

The connection check verifies that Ollama responds and the selected model is installed; it does not validate real model inference. Automated integration tests use a simulated Ollama HTTP server. Qwen3 generation on your Mac still needs a live test. Local inference has no cloud quota, but is limited by your computer’s resources and can give incorrect answers.

## Supported scope and limitations

This first version uses generic DOM detection; it has **not been tested against a real MindTap question page**. It supports a single visible radio-button question with readable labels and ordinary HTML controls. It refuses ambiguous groups, unreadable labels, detected diagrams, and stale suggestions. Hidden or separated prompts may not be readable. Cross-origin iframes, shadow DOM, multiple-answer questions, equations rendered as images, and free-text questions need site-specific adapters. No separate Submit button is clicked. If the workflow requires Submit before Next, handle it manually. A Next button may itself submit the selected answer.

Automatic mode stops if navigation does not expose a different question. Full document navigation and browser service-worker suspension can interrupt a run; analyze again to resume. Suggestions are held in service-worker memory and may be lost on restart. AI answers can be wrong. Review mode is the default.

The local gateway accepts Chrome extension origins and command-line clients; ordinary website origins are rejected. Install only trusted extensions. Do not expose the gateway on a public interface. A cloud-hosted backend is not reachable at your computer's loopback address: run the backend locally alongside Chrome.

## Validation

Run `python3 -m unittest discover -s tests -v` from the repository root. Tests use a simulated Ollama HTTP server to check request formatting, validation, and invalid-response rejection. Live inference and MindTap browser behavior require a running local model and an accessible question page.

To adapt this to your MindTap layout, provide a sanitized HTML sample of one question and its navigation controls, or screenshots showing those controls. Do not include account details or credentials.

DOM detection regression tests: with Node 20.19+ (or a newer supported release), run `npm ci` and `npm test`. These use jsdom fixtures rather than a live MindTap page. Node and npm are optional developer tools; the extension and backend do not require them to run.

## Local connection troubleshooting

Run `python3 backend/server.py --check-connection` to verify that Ollama responds and the selected model is installed. If connection fails, open the Ollama app or run `ollama serve`. If the model is missing, run `ollama pull qwen3:8b` (or your selected `OLLAMA_MODEL`). Generation waits up to 90 seconds by default; `OLLAMA_TIMEOUT_SECONDS` accepts 5–90 seconds. The extension waits up to 105 seconds. Health and connection checks do not establish that generation works. Automatic mode stops on request errors.

If Next detection fails, turn off automatic mode, click **Choose Next button** in the extension, then click the actual Next control on the page within 30 seconds. That identifying click is intercepted and does not advance. Reopen the extension and click **Click Next**, or restart automatic mode. The chosen control is remembered for the current document; refresh, full navigation, or replacement of that element requires choosing it again. Escape cancels selection. Automatic detection still refuses ambiguous controls.

## Diagnosing answer accuracy

The extension reads visible text directly, excludes answer elements structurally instead of deleting matching words from the prompt, filters hidden explanations, and deduplicates radio wrappers. The model receives explicitly indexed choices and must return matching answer text and index. Selection is rechecked against the current page before navigation, and automatic mode waits for a stable next question. These checks catch extraction/mapping errors; they do not prove factual accuracy. Automated tests use DOM fixtures and simulated model responses, not a scored subject-matter benchmark.

Qwen3’s thinking mode is optional: set `OLLAMA_THINK=true` before restarting the backend to try it, or `OLLAMA_THINK=false` for the default faster mode. Thinking can slow requests or cause timeouts and is not a guarantee of improved accuracy. The prompts now emphasize negations, units, exponents, rounding, and a concise calculation where relevant. Update both the extension and backend to use the latest changes. Previously removed confidence and question-count cutoffs remain removed.

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
