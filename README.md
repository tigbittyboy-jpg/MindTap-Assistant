# MindTap Assistant — v0.6.2

A Chrome extension with two modes: find saved textbook passages without AI, or ask a local AI model for an answer. It answers in one pass, using matching saved textbook excerpts first. Relevant textbook facts take priority; the model can use its own knowledge when excerpts do not cover the question.

The model assumes stationary residential and light commercial HVAC, refrigeration, and heat pumps. Automotive context applies only when the question explicitly calls for it.

The AI can still be wrong, even with textbook references. 

## Textbook-only setup: no AI or backend

1. Download and unzip the project using the link below.
2. Open `chrome://extensions`, turn on **Developer mode**, and click **Load unpacked**. Select the **extension** folder inside the project.
3. Open the assistant and change **Mode** to **Textbook only · no AI needed**. The setting stays saved, including in the detached window.
4. Open your textbook sections in MindTap with auto-save on. Wait until the textbook progress card says the section is saved. Each classmate builds their own saved library from their textbook access.
5. Open a multiple-choice question and click **Find textbook passages**. Read the matching passages and section titles, then choose the answer and click Next on the MindTap page.

This mode runs entirely in Chrome. Skip the Ollama, Python, and backend steps below. It finds up to three matching passages; it does not determine the correct answer or submit answers. Missing matches mean you may need to open more relevant textbook sections. Switching modes stops automation and clears the current suggestion. Existing users stay in Local AI mode until they change the setting.

## What you need

Textbook-only mode needs Chrome and your textbook access. For optional Local AI mode, use Chrome, Python, and Ollama on the **same computer**. These instructions are for a Mac.

- **Chrome:** your web browser.
- **Python 3.10 or newer:** install it from [python.org](https://www.python.org/downloads/).
- **Ollama:** install it from [ollama.com](https://ollama.com/download), then open the app.

You do not need an API key, Node, or npm to use the extension.

## 1. Download the extension

1. [Download v0.6.2](https://github.com/tigbittyboy-jpg/MindTap-Assistant/archive/refs/tags/v0.6.2.zip).
2. Double-click the ZIP to unzip it.
3. Keep the extracted folder somewhere easy to find. Inside it, you should see folders named **backend** and **extension**.

## 2. Download the AI model (Local AI mode only)

Open **Terminal** using Spotlight: press **Command + Space**, type **Terminal**, and press Enter.

Copy this command into Terminal and press Enter:

```bash
ollama pull qwen3:8b
```

Wait until it finishes. This is a large download; you usually only need to do it once. Keep the Ollama app open.

## 3. Start the helper

The helper connects the extension to Ollama. It must stay running while you use the extension.

1. In Terminal, type `cd ` with a space after it. Do not press Enter yet.
2. Drag the extracted project folder from Finder into Terminal.
3. Press Enter. Terminal is now working inside that folder.
4. Copy and run these commands:

```bash
export OLLAMA_MODEL="qwen3:8b"
export OLLAMA_THINK=false
python3 backend/server.py --check-connection
```

If it says the connection succeeded and the model is installed, run:

```bash
python3 backend/server.py
```

You should see:

```text
MindTap backend listening on 127.0.0.1:8765 (provider: ollama)
```

**Leave this Terminal window open.** To stop the helper, press **Control + C**. The settings above last for that Terminal session.

## 4. Add it to Chrome

1. Type `chrome://extensions` into Chrome’s address bar and press Enter.
2. Turn on **Developer mode** at the top right.
3. Click **Load unpacked**.
4. Open your extracted project folder and select the **extension** folder inside it.
5. Click Chrome’s puzzle-piece icon and pin **MindTap Study Assistant** if you want it on the toolbar.

Chrome shows version **0.6.2**. The popup badge shows **v0.6.2**.

## 5. Use it

Open one multiple-choice question in MindTap, then click the extension icon.

- **Analyze question:** reads the question and generates one answer with a short explanation.
- **Select suggested answer:** selects the agreed answer after you review it.
- **Click Next:** advances after verifying that the suggested answer is selected.
- **Automation On/Off:** turn On to start answering and advancing immediately. Turn Off to stop before the next action. An action already happening cannot be undone. The switch resets to Off when the run ends or stops on an error.

At the last question, automatic mode clicks **Review**, waits for one available **Finish** button, then clicks it once and stops. Finish may submit the activity. If it cannot identify Finish, it stops for you to finish manually. Manual **Click Next** can open Review, but you must click Finish yourself.

Closing the popup does **not** stop automatic mode. Reopen it to see progress or turn Automation Off.

One model pass is faster than the previous double check. Thinking mode stays off. Textbook excerpts are context for that single AI answer. Exact quotes are not required, and search matches do not guarantee correctness.

The extension does not click a separate **Check Answer** or **Submit** button. Handle those yourself if needed. A page’s Next button may itself submit an answer.

## Keep the assistant open in its own window

Click **Open in window** in the extension. A separate small Chrome window stays open while you click around MindTap. It controls the active tab in the browser window you launched it from; switch tabs in that original window to choose another question or textbook page. Closing the assistant window does not stop quiz automation or textbook auto-save. Turn Automation Off or turn off the auto-save toggle for that.

This is a detached Chrome window, not a separate desktop app. Keep your original browser window open. If you close it, reopen the assistant from the toolbar in another browser window. Chrome may ask you to accept updated site access for ng.cengage.com so the detached controls can read question pages.

## Use your textbook for reference

1. Open a textbook section in Cengage's eTextbook reader.
2. Auto-save is on by default. If you previously turned it off or cleared the archive, enable **Auto-save opened textbook sections** again.
3. Refresh the textbook tab once after installing this update. As you open sections, they are saved automatically after the text settles (usually about 0.75–1.5 seconds after the text loads). There is no manual save button. You do not need to copy text into chat.
4. Return to MindTap and analyze a question normally. The extension searches your saved sections and sends up to three matching excerpts to the single answer pass.

The **Textbook auto-save** card shows Reading, Saving, Waiting, or Stopped, plus the last saved section and archive usage. If no reader has been detected, refresh the textbook tab. Background Chrome tabs can be throttled, so saving may take longer.

The answer status lists the section titles supplied as references. These are search matches, not proof the answer is correct. If nothing matches, the model answers from its own knowledge. Only opened sections are saved, not the whole book. Auto-save works on the opened textbook reader even while the detached assistant has focus, skips duplicates, and stays enabled between browser sessions until you turn it off. It turns off on a save error, including a full archive; the textbook status displays the error. The extension requests access to ebooks.cengage.com to watch the reader. The Cengage reader’s same-origin iframe-page frame is supported. Pages stored as images or inside inaccessible frames cannot be captured this way.

Chrome’s unlimitedStorage permission allows the archive to exceed the normal extension storage quota. The app checks its own 10 MB limit before adding a section. Saved text stays in this extension's local Chrome storage (up to 10 MB of saved text, with a one-million-character limit per section). It is sent only to your local helper and Ollama. Removing the extension deletes its saved library; reloading the same installed extension preserves it. Section titles are captured where available; page numbers are not yet captured. Click **Clear textbook archive** to immediately delete saved sections without removing the extension. Clearing turns auto-save off so the current page does not refill the archive. Reloading this update does not delete an existing archive larger than 10 MB; new sections are blocked until you clear it. Use textbook material you are permitted to save for personal study.

## Updating to a new version

Update **both** parts: the Chrome extension and the Python helper.

1. Stop the old helper with **Control + C** in its Terminal window.
2. Download and unzip the new version.
3. Repeat step 3 above using the **new** project folder.
4. At `chrome://extensions`, remove the old extension, then click **Load unpacked** and select the new **extension** folder.
5. Refresh your MindTap page. Check the version in the popup.

If you replace files inside the folder Chrome already uses, you can click **Reload** on the extension card instead. Do not delete the folder Chrome is loading.

## Common problems

### “Can’t open file … backend/server.py”

Terminal is in the wrong folder. Repeat the `cd ` and drag-folder steps above. Choose the folder containing **backend** and **extension**, not the extension folder itself.

### “Address already in use”

An old helper is still running. Find its Terminal window and press **Control + C**, then start the new helper. Only one helper can use port 8765 at a time.

### “Could not connect to local Ollama”

Open the Ollama app. If that does not work, open another Terminal window and run `ollama serve`. Leave it running, then retry. If it says the address is already in use, Ollama is already running.

### “Model not found” or “not installed”

Run `ollama pull qwen3:8b` and wait for the download to finish.

### Faster answers in v0.6

The helper starts loading your model when it opens and keeps it loaded between questions. This uses RAM until Ollama unloads it; run `ollama stop qwen3:8b` when finished if you want to free it.

Answers use a 512-token output limit with thinking off (previously 2048). This is a ceiling, so already-short answers may take about the same time. If unusually long choices cause incomplete answers, restart with `export OLLAMA_MAX_TOKENS=1024`. Thinking mode retains a 2048-token default.

Repeat questions reuse a cached answer when the question, ordered choices, supplied textbook excerpts, model settings, and instructions match exactly. The status says **Cached answer reused**. The cache holds up to 256 answers and 8 MB in backend memory. Restart the helper to clear it; it does not persist after a restart. A cached answer preserves the original result, including any mistakes.

### Answers are taking too long

Stop the helper with **Control + C**, then restart it with thinking off:

```bash
export OLLAMA_THINK=false
python3 backend/server.py
```

Close memory-heavy apps. The first question can be slower if model warm-up is still running. The single model request can wait up to 90 seconds; the extension allows 100 seconds total.

### It cannot find Next or Review

Advance using the page’s own button, then reopen the assistant and analyze the next question. Automatic mode pauses when the navigation button is missing or ambiguous. The Choose Next button has been removed.

### “Double check missing”

The extension is talking to an old helper. Stop it and start `backend/server.py` from the newest downloaded folder.

### It cannot read the question or answer labels

Open one question and wait for it to finish loading. If it still fails, share the error and a screenshot or a small HTML sample of the answer row. Remove account details before sharing.

## What it supports

Single-answer multiple-choice questions with readable text. Diagrams, image-based equations, questions inside embedded frames, multiple-answer questions, and free-text answers are not supported. Refreshing or changing pages can interrupt a run; analyze again to restart.

Questions and choices go to Ollama on your computer. No cloud AI service is used. Recent questions and suggestions are kept in Chrome’s temporary session storage, limited to 100 entries; there is no export button. Do not expose the helper publicly—it is intended to run locally alongside Chrome.

## For developers

From the project folder:

```bash
python3 -m unittest discover -s tests -v
npm ci
npm test
```

Python needs no extra packages. The JavaScript tests require Node 20.19+ or a newer supported release. Tests use simulated model responses and example webpages; they verify the workflow, not factual answer accuracy. The connection check verifies service/model availability, not successful answer generation.

[Release notes](CHANGELOG.md)
