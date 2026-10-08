# MindTap Assistant — v0.6.5

A study helper for your MindTap questions and textbook.

**Start with the easy setup below. You do not need Terminal, Python, or AI for it.**

[Download v0.6.5](https://github.com/tigbittyboy-jpg/MindTap-Assistant/archive/refs/tags/v0.6.5.zip)

## Easy setup: textbook mode

These steps work on **Mac and Windows**. You need **Google Chrome** and access to your **MindTap textbook**.

### 1. Download and open the folder

1. Click **Download v0.6.5** above.
2. Open your computer's **Downloads** folder.
3. Open the downloaded ZIP. On a Mac, double-click it. On Windows, right-click it and choose **Extract All**.
4. Open the folder that was created. Its name should look like **MindTap-Assistant-0.6.5**.
5. You should see **backend**, **extension**, and this README inside it.
6. Move this whole folder somewhere you will keep it, such as **Documents**. You can rename it **MindTap Assistant**.

**Keep this folder. Chrome needs it every time you use the extension.**

### 2. Put the extension in Chrome

1. Open **Google Chrome**.
2. Click the address bar at the top, where website addresses go.
3. Type `chrome://extensions` and press **Enter**.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Find the project folder you just saved.
7. Open that folder. Select the **extension** folder inside it, then click **Select** or **Select Folder**.

Select this folder:

```text
MindTap Assistant
└── extension       ← SELECT THIS FOLDER
    └── manifest.json
```

**Do not select the ZIP, the backend folder, or the big outer folder.**

You should now see a card called **MindTap Study Assistant**, with version **0.6.5**.

### 3. Put its icon beside the address bar

1. Click Chrome's **puzzle-piece icon** near the top right.
2. Find **MindTap Study Assistant**.
3. Click the **pin** beside it.
4. Click the new book icon to open the assistant.

If Chrome asks for access to Cengage pages, allow it. If access is set to **On click**, open the extension's **Details** at `chrome://extensions` and allow access to the listed Cengage sites.

### 4. Pick textbook mode

1. At the top of the assistant, find **Mode**.
2. Choose **Textbook only · no AI needed**.
3. Make sure **Auto-save opened textbook sections** is checked.

The setting stays saved. You do not need to choose it every time.

### 5. Let it save your textbook pages

1. Sign in to **MindTap**.
2. Open your **eTextbook**.
3. Refresh the textbook tab once after installing the extension.
4. Open a section you want help with. Wait for its words to finish loading.
5. Check the assistant's **Textbook auto-save** box. Wait until it says **Saved** or **Current section is saved**.
6. Open the next section you need and wait for it to save too.

It saves the sections you open. **It does not download the whole book.** Each classmate needs to open sections from their own textbook account.

### 6. Use it on a question

1. Open a multiple-choice question in MindTap.
2. Click the assistant's book icon.
3. Click **Find textbook passages**.
4. Read the result and the matching textbook passages.
5. Select your answer on the **MindTap page**, then click the page's **Next** button.

Sometimes it shows a **Possible answer (text match)** and a short reason. This means one choice matched the saved text; it is not a guaranteed correct answer. If it cannot find a clear match, it shows passages for you to read.

It can also calculate supported **R-410A subcooling** questions without AI. See [calculator details](#calculator-details) below.

**Textbook-mode setup is finished. Skip the AI steps unless you want AI answers.**

## Keep the assistant open

Click **Open in window**. A small separate Chrome window will open.

It follows the active tab in the **original browser window**. Keep that window on your textbook or MindTap question. If you switch it to another website, the assistant will try to read that website instead.

The small window can fall behind other windows; Chrome does not provide an always-on-top option.

## Optional AI setup: pick your computer

- **Mac:** follow [Mac AI setup](#mac-ai-setup).
- **Windows:** follow [Windows AI setup](#windows-ai-setup).

AI mode uses your own computer. The default 8B model is a large download and works best with around **16 GB RAM or more**. If your computer struggles with it, textbook-only mode remains available.

## Mac AI setup

AI mode needs **Ollama**, **Python**, and a running **Terminal** window on the same computer as Chrome. Textbook-only mode does not need any of these.

### A. Install Ollama

1. Go to [ollama.com/download](https://ollama.com/download).
2. Download the Mac version and install it.
3. Open **Ollama**. It may appear in the menu bar rather than a normal window.
4. Follow any first-run instructions. If asked to install its command-line tool, accept.

### B. Install Python

1. Go to [python.org/downloads](https://www.python.org/downloads/).
2. Download the installer for **macOS**.
3. Open it and follow the installer steps.

Python **3.10 or newer** is required. A current download is fine.

### C. Download the AI model once

1. Press **Command + Space** on your keyboard.
2. Type **Terminal**, then press **Enter**.
3. Copy the command below.
4. Paste it into Terminal with **Command + V**, then press **Enter**.

```bash
ollama pull qwen3:8b
```

Wait for the download to finish. It is several gigabytes, so this can take a while. You only need to download it once.

### D. Tell Terminal where the project is

1. In Terminal, type `cd ` — the letters **cd**, then **one space**.
2. **Do not press Enter yet.**
3. In Finder, find the whole project folder you saved earlier.
4. Drag that folder into the Terminal window.
5. Now press **Enter**.

Drag the folder that contains **backend** and **extension**. Do not drag the extension folder by itself.

### E. Start the AI helper

Copy this entire block, paste it into Terminal, and press **Enter**:

```bash
export OLLAMA_MODEL=qwen3:8b
export OLLAMA_THINK=false
python3 backend/server.py
```

When it works, you will see:

```text
MindTap backend listening on 127.0.0.1:8765 (provider: ollama)
```

**Leave this Terminal window open while using AI mode.** It is supposed to stay busy rather than return to a typing prompt. The helper starts loading the model; the first answer may take longer.

To stop it, click its Terminal window and press **Control + C**. Closing it also stops the helper. Later, repeat steps D and E to start it again. Keep Ollama open too.

Then follow [Use AI mode](#use-ai-mode) below.

## Windows AI setup

Use **PowerShell** for the commands in this section. Do not copy the Mac `export` commands into it.

### 1. Install Ollama

1. Go to [ollama.com/download](https://ollama.com/download).
2. Choose the **Windows** download.
3. Open the downloaded installer and follow its steps.
4. Open **Ollama** from the Start menu. It may appear as an icon near the clock instead of a normal window.

### 2. Install Python

1. Go to [python.org/downloads/windows](https://www.python.org/downloads/windows/).
2. Download the current Python installer or Python install manager for Windows.
3. Open the download and finish the installation.
4. If the installer shows **Add python.exe to PATH**, check it before clicking **Install Now**.
5. If you already had PowerShell open, close it and open it again after installation.

Python **3.10 or newer** is required. If the install manager asks you to install a Python version when you first run it, accept and let it finish.

### 3. Open PowerShell inside the project folder

1. Open **File Explorer** using the folder icon on your taskbar.
2. Open the project folder you saved earlier. You should see **backend** and **extension** inside it.
3. Click File Explorer's **address bar** at the top. This is the folder path, not the search box on the right.
4. Type `powershell` and press **Enter**.
5. A PowerShell window opens, already working inside that folder.

Leave File Explorer open too so you can find the folder again later.

### 4. Check Python

Copy this command, paste it into PowerShell with **Ctrl + V**, then press **Enter**:

```powershell
py -3 --version
```

You should see something like **Python 3.14.0**. Any version **3.10 or newer** is fine.

If `py` is not recognized, try:

```powershell
python --version
```

If that shows Python 3.10 or newer, use **python** instead of **py -3** in the commands below. If it opens the Microsoft Store or neither command works, finish installing Python, then close and reopen PowerShell using step 3.

### 5. Download the AI model once

Paste this into PowerShell and press **Enter**:

```powershell
ollama pull qwen3:8b
```

Wait for the download to finish. It is several gigabytes and can take a while. You only need to download it once.

If `ollama` is not recognized, open the Ollama app, close PowerShell, and reopen it using step 3. Then try again.

### 6. Start the AI helper

Copy the whole block below into PowerShell, then press **Enter**:

```powershell
$env:OLLAMA_MODEL = "qwen3:8b"
$env:OLLAMA_THINK = "false"
py -3 backend/server.py
```

If step 4 showed that you need **python** instead, use this block:

```powershell
$env:OLLAMA_MODEL = "qwen3:8b"
$env:OLLAMA_THINK = "false"
python backend/server.py
```

When it works, you will see:

```text
MindTap backend listening on 127.0.0.1:8765 (provider: ollama)
```

**Leave PowerShell and Ollama open while using AI mode.** The helper is supposed to keep running. The first answer may take longer while the model loads.

To stop the helper, click PowerShell and press **Ctrl + C**. Later, repeat steps 3 and 6 to start it again. The `$env:` settings last only for that PowerShell window.

## Use AI mode

1. Open the assistant in Chrome.
2. Change **Mode** to **Local AI**.
3. Open a question and click **Analyze question**.
4. Read the suggested answer and explanation.
5. Click **Select suggested answer** if you want it selected on the page.
6. Click **Click Next** to move on after the answer is selected.

Saved textbook sections help AI mode too. AI answers can still be wrong, especially without relevant textbook text.

**Automation On** starts selecting answers and advancing immediately. **Automation Off** stops it before its next action. At the end, automation can click **Review → Finish**, which may submit the activity. Closing the assistant does not stop automation; use the switch. It does not click a separate **Check Answer** button.

## Update without losing your saved textbook

**Do not remove the extension from Chrome. Removing it deletes its saved textbook archive.**

1. Turn **Automation Off**. If using AI mode, stop the old helper with **Control + C**.
2. Download and unzip the new version.
3. Open the new project folder. Copy **everything inside it**.
4. Open the old project folder that Chrome already uses. Paste the new contents there. Choose **Replace** when asked.
5. Go to `chrome://extensions`. Click the **Reload** arrow on the MindTap Study Assistant card.
6. Close the old detached assistant window, if open.
7. Refresh your MindTap and textbook tabs. Open the assistant again and check its version.
8. For AI mode, restart the helper: **Mac steps D and E**, or **Windows steps 3 and 6**.

For copying and pasting files, use **Command + C / Command + V** on Mac or **Ctrl + C / Ctrl + V** in Windows File Explorer.

Keep the old folder's name and location the same. You are replacing its contents, not switching Chrome to a different folder.

## Something went wrong?

| What you see | What to do |
| --- | --- |
| **Manifest file is missing or unreadable** | Click **Load unpacked** again. Select the **extension** folder inside the unzipped project. That folder must contain **manifest.json**. |
| **Cannot access contents of the page** | Switch the original Chrome window to the MindTap question or eTextbook tab. Allow the extension's Cengage site access, then refresh the page. Chrome settings pages and unrelated sites are not supported. |
| **No textbook sections saved yet** | Turn auto-save on, open an eTextbook section, refresh its tab, and wait for **Saved**. |
| **No matching saved passages** | Open and save the textbook section that covers this question, then try again. |
| **No readable textbook paragraphs** | Open a section in the actual eTextbook reader and wait for the text. Image-only pages and inaccessible frames cannot be saved. |
| **Cannot read question or answer labels** | Open one supported multiple-choice question and wait for it to load. Refresh the tab and try again. |
| **No reply from the extension** | Reload it at `chrome://extensions`, then close and reopen its detached window. |
| **Textbook archive has reached its limit** | The archive allows 10 MB. Clear it only if you no longer need the saved sections. |
| **Subcooling calculation paused** | Check the units and refrigerant. Unsupported inputs or no unique matching choice require manual review. |

**AI-only problems:**

| What you see | What to do |
| --- | --- |
| **ollama not found / not recognized** | Open Ollama and finish its installation. Close and reopen Terminal on Mac or PowerShell on Windows, then try again. |
| **python3 / py / python not found** | Finish installing Python, then reopen your command window. Mac uses **python3**. Windows normally uses **py -3**, or **python** if its version check works. |
| **Can't open file … backend/server.py** | Your command window is in the wrong folder. Mac: repeat step D. Windows: reopen PowerShell from the project folder using Windows step 3. |
| **Address already in use** | Stop the old helper with **Ctrl + C** in its Terminal or PowerShell window. Then start the new one. |
| **Could not connect to local Ollama** | Open Ollama. If needed, run `ollama serve` in a second Terminal or PowerShell window and leave it open. |
| **Model not found** | Run `ollama pull qwen3:8b` and wait for it to finish. |
| **Restart the backend / textbook context not accepted** | Stop the old helper, replace the project files with the current version, and start the updated helper. |
| **Answers are slow** | Keep Ollama open, use `OLLAMA_THINK=false` as shown above, and close memory-heavy apps. Repeat questions may reuse a cached answer. |

## Delete saved textbook sections

Click **Clear textbook archive** in the assistant.

It deletes all saved sections immediately and turns auto-save off. There is no confirmation. Turn auto-save back on when you want to start saving again.

Saved sections stay in this extension's local Chrome storage. They are not automatically shared with classmates. Textbook-only mode searches them in Chrome; AI mode sends matching passages to the helper and Ollama on your own computer. No cloud AI service is used.

## Calculator details

The built-in calculator supports **R-410A subcooling** with one pressure in **psig**, one condenser outlet/liquid-line temperature in **°F**, and temperature answer choices.

**Subcooling = saturation temperature − liquid temperature.**

It uses a bundled bubble-point table from [CoolProp 7.2.0's R410A model](https://coolprop.org/fluid_properties/fluids/R410A.html), covering −40°F through 140°F. A choice must uniquely match within 0.5°F. For **417.4 psig** and **108°F**, it calculates about **11.6°F**, matching the rounded choice **12°F**. Charts can differ slightly.

Other refrigerants, Celsius, psia, multiple measured temperatures, and superheat need manual review. You do not need to install CoolProp to use the calculator.

## AI speed settings

The helper keeps the model loaded between questions. To free its memory when finished, run:

```bash
ollama stop qwen3:8b
```

Answers have a 512-token output limit with thinking off. If you get incomplete responses with unusually long choices, stop the helper and restart with the commands for your computer. Open the command window in the project folder first.

**Mac:**

```bash
export OLLAMA_MODEL=qwen3:8b
export OLLAMA_THINK=false
export OLLAMA_MAX_TOKENS=1024
python3 backend/server.py
```

**Windows PowerShell:**

```powershell
$env:OLLAMA_MODEL = "qwen3:8b"
$env:OLLAMA_THINK = "false"
$env:OLLAMA_MAX_TOKENS = "1024"
py -3 backend/server.py
```

Use `python backend/server.py` on the last line if your installation uses **python** instead of **py -3**.

Repeat answers are cached only when the question, ordered choices, textbook passages, and model settings match. The cache is limited to 256 answers / 8 MB and clears when the helper restarts. Cached answers can preserve mistakes too.

## For people changing the code

Ordinary users do not need Node, npm, API keys, or extra Python packages.

From the project folder, developers can run:

```bash
python3 -m unittest discover -s tests -v
npm ci
npm test
```

JavaScript tests need Node 20.19 or newer. Most model tests use simulated answers; passing tests do not guarantee factual AI accuracy. The maintenance script `scripts/build_r410a_table.py` needs CoolProp 7.2.0 only if regenerating the bundled table.

[Release notes](CHANGELOG.md)

Austin Taylor · [@atslo.m4a](https://www.instagram.com/atslo.m4a/)
