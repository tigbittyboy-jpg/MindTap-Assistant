# MindTap Study Assistant

A Chrome Manifest V3 extension with a local Python gateway to Gemini or local Ollama. It reads one visible multiple-choice question, explains a suggested answer, selects that answer on request, and can click Next. Optional automatic mode selects and advances up to 25 questions, stopping below 90% model-reported confidence. Confidence is an AI estimate, not a guarantee of correctness.

## Install

1. Install Python 3.10+ on the **same computer as Chrome**. No Python packages are required.
2. Obtain a Gemini API key in Google AI Studio. Set `GEMINI_API_KEY` in your terminal environment; do not put it in the extension or commit it. Optionally set `GEMINI_MODEL` (default: `gemini-2.5-flash`).
3. From this repository, run `python3 backend/server.py`. On Windows, use `python backend/server.py`. Leave the terminal running. The backend binds only to `127.0.0.1:8765`.
4. Open Chrome's Extensions page, enable Developer mode, click **Load unpacked**, and select the `extension` folder.
5. Open a MindTap question and click the extension. Use **Analyze question**, review the suggestion, then **Select suggested answer**. **Click Next** advances when exactly one recognizable Next or Continue control is present.
6. To automate, enable **Automatically select and advance**, set the question limit, then click **Analyze question**. Reopen the popup to view status or stop. Closing the popup does not stop the run. Stop takes effect before the next action; a click already in progress cannot be undone.

With the Gemini provider, question text and choices are sent to Google Gemini when you analyze. With Ollama, the backend sends them only to your local Ollama service; no cloud API key is used. API usage may incur charges. The backend does not save questions or credentials. Use it where assistance is permitted.

## Local Ollama (no cloud quota)

Install and open Ollama on the same computer as Chrome, then run `ollama pull qwen3:8b` to download the model (or `ollama run qwen3:8b` to download and try a chat). Keep the Ollama app/service running. In a separate terminal, from this repository:

```bash
export AI_PROVIDER="ollama"
export OLLAMA_MODEL="qwen3:8b"
python3 backend/server.py --check-connection
python3 backend/server.py
```

No Gemini key or TLS certificate configuration is required for local Ollama. Stop any previous backend before starting this one, since port 8765 must be free. The existing extension works with either provider. Optional `OLLAMA_TIMEOUT_SECONDS` accepts 5–90 seconds (default 90). First generation may be slower while the model loads; the backend requests non-streaming structured JSON with thinking disabled. Local requests bypass HTTP proxy settings. Ollama must be listening at `127.0.0.1:11434`. Close memory-heavy applications if generation is slow. Changing to another installed model is supported through `OLLAMA_MODEL`; model accuracy and speed vary.

The connection check verifies that Ollama responds and the selected model is installed; it does not validate real model inference. Automated integration tests use a simulated Ollama HTTP server. Qwen3 generation on your Mac still needs a live test. Local inference has no cloud quota, but is limited by your computer’s resources and can give incorrect answers.

## Supported scope and limitations

This first version uses generic DOM detection; it has **not been tested against a real MindTap question page**. It supports a single visible radio-button question with readable labels and ordinary HTML controls. It refuses ambiguous groups, unreadable labels, detected diagrams, and stale suggestions. Hidden or separated prompts may not be readable. Cross-origin iframes, shadow DOM, multiple-answer questions, equations rendered as images, and free-text questions need site-specific adapters. No separate Submit button is clicked. If the workflow requires Submit before Next, handle it manually. A Next button may itself submit the selected answer.

Automatic mode stops if navigation does not expose a different question. Full document navigation and browser service-worker suspension can interrupt a run; analyze again to resume. Suggestions are held in service-worker memory and may be lost on restart. AI answers can be wrong. Review mode is the default.

The local gateway accepts Chrome extension origins and command-line clients; ordinary website origins are rejected. Install only trusted extensions. Do not expose the gateway on a public interface. A cloud-hosted backend is not reachable at your computer's loopback address: run the backend locally alongside Chrome.

## Validation

Run `python3 -m unittest discover -s tests -v` from the repository root. Provider responses are mocked: these tests check request formatting, validation, missing-key behavior, and invalid-response rejection. Live Gemini and MindTap browser behavior require your key and an accessible question page.

To adapt this to your MindTap layout, provide a sanitized HTML sample of one question and its navigation controls, or screenshots showing those controls. Do not include account details or credentials.

DOM detection regression tests: with Node 20.19+ (or a newer supported release), run `npm ci` and `npm test`. These use jsdom fixtures rather than a live MindTap page. Node and npm are optional developer tools; the extension and backend do not require them to run.

## Gemini connection troubleshooting on macOS

From the repository folder, run `python3 backend/server.py --check-connection`. This checks HTTPS without sending an API key or question. Any HTTP response confirms the connection; it does not validate your API key or model access.

If Python cannot verify the certificate and you installed Python from python.org, open Finder → Applications → Python 3.x and double-click **Install Certificates.command**. Keep certificate verification enabled.

For other Python installations, a trusted CA bundle can be installed with `python3 -m pip install --upgrade certifi` (use an activated virtual environment if your Python requires one). Then run `export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"` in the same terminal before starting the backend. If pip itself cannot verify certificates, repair that Python installation’s trust configuration first. Networks that inspect HTTPS may need an administrator-provided CA bundle instead; certifi does not include private organizational roots.

After fixing certificates, stop the running backend with Control+C, run the connection check again, then start `python3 backend/server.py` in the terminal where your API key is set. DNS or timeout errors require checking your Internet connection, VPN, proxy, or firewall rather than changing the API key.

Generation requests wait up to 75 seconds by default. Set `GEMINI_TIMEOUT_SECONDS=90` before starting the backend to allow a longer wait (valid range: 5–90 seconds). The extension waits up to 105 seconds. Backend connection checks and health checks do not establish that model generation is working. HTTP 503 indicates provider overload; longer timeouts do not guarantee success. Automatic mode stops on request errors and does not silently retry potentially billable generation requests.

If Next detection fails, turn off automatic mode, click **Choose Next button** in the extension, then click the actual Next control on the page within 30 seconds. That identifying click is intercepted and does not advance. Reopen the extension and click **Click Next**, or restart automatic mode. The chosen control is remembered for the current document; refresh, full navigation, or replacement of that element requires choosing it again. Escape cancels selection. Automatic detection still refuses ambiguous controls.
