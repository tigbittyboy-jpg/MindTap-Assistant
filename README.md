# MindTap Study Assistant

A Chrome Manifest V3 extension with a local Python gateway to Gemini. It reads one visible multiple-choice question, explains a suggested answer, selects that answer on request, and can click Next. Optional automatic mode selects and advances up to 25 questions, stopping below 90% model-reported confidence. Confidence is an AI estimate, not a guarantee of correctness.

## Install

1. Install Python 3.10+ on the **same computer as Chrome**. No Python packages are required.
2. Obtain a Gemini API key in Google AI Studio. Set `GEMINI_API_KEY` in your terminal environment; do not put it in the extension or commit it. Optionally set `GEMINI_MODEL` (default: `gemini-2.5-flash`).
3. From this repository, run `python3 backend/server.py`. On Windows, use `python backend/server.py`. Leave the terminal running. The backend binds only to `127.0.0.1:8765`.
4. Open Chrome's Extensions page, enable Developer mode, click **Load unpacked**, and select the `extension` folder.
5. Open a MindTap question and click the extension. Use **Analyze question**, review the suggestion, then **Select suggested answer**. **Click Next** advances when exactly one recognizable Next or Continue control is present.
6. To automate, enable **Automatically select and advance**, set the question limit, then click **Analyze question**. Reopen the popup to view status or stop. Closing the popup does not stop the run. Stop takes effect before the next action; a click already in progress cannot be undone.

Question text and choices are sent to Google Gemini when you analyze. API usage may incur charges. The backend does not save questions or credentials. Use it where assistance is permitted.

## Supported scope and limitations

This first version uses generic DOM detection; it has **not been tested against a real MindTap question page**. It supports a single visible radio-button question with readable labels and ordinary HTML controls. It refuses ambiguous groups, unreadable labels, detected diagrams, and stale suggestions. Hidden or separated prompts may not be readable. Cross-origin iframes, shadow DOM, multiple-answer questions, equations rendered as images, and free-text questions need site-specific adapters. No separate Submit button is clicked. If the workflow requires Submit before Next, handle it manually. A Next button may itself submit the selected answer.

Automatic mode stops if navigation does not expose a different question. Full document navigation and browser service-worker suspension can interrupt a run; analyze again to resume. Suggestions are held in service-worker memory and may be lost on restart. AI answers can be wrong. Review mode is the default.

The local gateway accepts Chrome extension origins and command-line clients; ordinary website origins are rejected. Install only trusted extensions. Do not expose the gateway on a public interface. A cloud-hosted backend is not reachable at your computer's loopback address: run the backend locally alongside Chrome.

## Validation

Run `python3 -m unittest discover -s tests -v` from the repository root. Provider responses are mocked: these tests check request formatting, validation, missing-key behavior, and invalid-response rejection. Live Gemini and MindTap browser behavior require your key and an accessible question page.

To adapt this to your MindTap layout, provide a sanitized HTML sample of one question and its navigation controls, or screenshots showing those controls. Do not include account details or credentials.
