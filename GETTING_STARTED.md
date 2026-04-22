# Getting Started — Luca General Ledger Development with Claude Code (Windows)

This guide walks you through setting up the project and using Claude Code to build the Luca General Ledger. All instructions are for Windows and use GUI actions wherever possible. Command-line steps are only included when there is no GUI alternative.


## Prerequisites

You need four things installed on your machine before starting.

### 1. Docker Desktop

Go to https://www.docker.com/products/docker-desktop/ and download Docker Desktop for Windows. Run the installer and follow the prompts — accept the defaults. You may need to restart your computer after installation.

Once installed, Docker Desktop should start automatically. Look for the whale icon in your system tray (bottom-right of your screen, near the clock). If it's there and not showing any errors, Docker is running. Leave it running throughout development.

If Docker asks you to enable WSL 2 (Windows Subsystem for Linux), follow its instructions to do so — this is required for Docker to work on Windows.

### 2. Node.js 20+

Go to https://nodejs.org/ and download the **LTS** version (the one with the green button). Run the installer and accept all defaults. Make sure the option "Automatically install the necessary tools" is ticked if it appears.

### 3. Git

Go to https://git-scm.com/downloads and download Git for Windows. Run the installer. Accept the defaults on every screen — the defaults are fine for this project.

### 4. GitHub Desktop

Go to https://desktop.github.com/ and download GitHub Desktop. This gives you a visual interface for Git so you rarely need to use the command line for version control. Install it and sign in with your GitHub account (create a free account at https://github.com if you don't have one).


## Step 1: Copy the Project Files

Clone the repository to somewhere sensible on your computer — for example, your Documents folder:

```bash
git clone https://github.com/roger296/lucaV0.5.git
```

This creates a `lucaV0.5` folder with all the project files. You can move it anywhere you like, but remember where it is.


## Step 2: Install the JavaScript Dependencies

This is the one step that requires a command prompt. The reason is that `npm install` reads the `package.json` file in the project and downloads all the libraries the project depends on. There is no GUI for this.

1. Open the `lucaV0.5` folder in File Explorer.
2. Click in the address bar at the top of the File Explorer window (where it shows the folder path).
3. Type `powershell` and press Enter. This opens a PowerShell window already pointed at your project folder.
4. Type the following and press Enter:

```
npm install
```

Wait for it to finish. You'll see some progress messages and then it will return to the prompt. A new folder called `node_modules` will appear in your project — this contains all the downloaded libraries.

You can close this PowerShell window now.


## Step 3: Create a GitHub Repository and Push Your Code

This is all done through GitHub Desktop — no command line needed.

1. Open **GitHub Desktop**.
2. Go to **File → Add Local Repository**.
3. Browse to your `lucaV0.5` folder and select it.
4. GitHub Desktop will say "This directory does not appear to be a Git repository." Click **create a repository** (the blue link in that message).
5. In the dialog that appears:
   - **Name**: `lucaV0.5` (should be pre-filled)
   - **Local Path**: should show your lucaV0.5 folder
   - **Initialize this repository with a README**: leave this **unticked** (you already have files)
   - **Git Ignore**: select **Node** from the dropdown
   - Click **Create Repository**
6. You'll now see all your project files listed as changes. In the bottom-left, type a commit message: `Initial project scaffold with CLAUDE.md and configuration`
7. Click **Commit to main**.
8. Now click **Publish repository** (the blue button at the top). In the dialog:
   - **Name**: `lucaV0.5`
   - **Keep this code private**: tick this box
   - Click **Publish Repository**

Your code is now on GitHub. You can verify by going to https://github.com/YOUR_USERNAME/lucaV0.5 in your browser.


## Step 4: Start the Databases

The project needs two PostgreSQL databases running — one for development and one for testing. Docker handles this for you.

1. Open **Docker Desktop** and make sure it's running (whale icon in system tray, no error messages).
2. Open the `lucaV0.5` folder in File Explorer.
3. Click in the address bar, type `powershell`, press Enter.
4. Type the following and press Enter:

```
docker compose up db db-test -d
```

This downloads the PostgreSQL database image (first time only — about 80MB) and starts two database instances in the background. Wait until you see messages saying both containers have started.

To verify they're running, open **Docker Desktop** and click on **Containers** in the left sidebar. You should see `lucaV0.5-db` and `lucaV0.5-db-test` both showing a green "Running" status.

Leave Docker Desktop running. The databases will keep running in the background until you stop them.

**To stop the databases later** (when you're done for the day): open Docker Desktop, find the containers, and click the stop button. Or in PowerShell: `docker compose down`

**To start them again next time**: repeat step 4 above, or open Docker Desktop and click the start button on the containers.


## Step 5: Open Claude Code

1. Open the **Claude desktop app**.
2. Flip the switch at the top from **Cowork** to **Claude Code**.
3. Claude Code will ask you to open a project folder. Navigate to your `lucaV0.5` folder and select it.
4. Claude Code will automatically read the CLAUDE.md file and understand the project structure, tech stack, and architectural rules.

You're now ready to start building.


## Step 6: Build the GL Module

Give Claude Code these prompts in sequence. Wait for each one to complete before moving to the next. Each prompt builds on the work done by the previous one.

After each prompt completes, Claude Code will show you what files it created or changed. Review the output, check that tests passed, and then move to the next prompt.

### Prompt 1 — Database Schema and Migrations

```
Read the CLAUDE.md file and the architecture document in docs/. Then create the database migration files for the GL mirror database. Include tables for: accounts (chart of accounts), periods, transactions, transaction_lines, staging (approval queue), approval_rules, and transaction_type_mappings. Also create a seed file that populates the chart of accounts listed in CLAUDE.md, creates the default approval rules, creates the default transaction type mappings, and creates an initial open period for the current month. Run the migrations and seeds against the local database to verify they work.
```

### Prompt 2 — Chain File Writer and Verifier

```
Implement the chain file writer and reader in src/chain/. The writer must: create period-based chain files, append JSON entries with SHA-256 hash linking, fsync each write to ensure durability, and reject writes to closed period files. The reader must: verify the hash chain is unbroken, read individual entries by sequence number, and read all entries for a period. Write comprehensive unit tests that verify: hash chain integrity after multiple writes, rejection of writes after close, correct handling of the genesis entry, and that a tampered entry is detected by the verifier. Run the tests to confirm they pass.
```

### Prompt 3 — Core Posting Engine

```
Implement the posting engine in src/engine/. This is the core business logic. It must: accept a transaction submission, validate that debits equal credits, expand human-friendly transaction types (CUSTOMER_INVOICE, SUPPLIER_INVOICE, etc.) into double-entry postings using the configured account mappings, evaluate approval rules to determine if the transaction is auto-approved or needs manual review, write approved transactions to both the chain file and the database mirror, and place transactions needing review in the staging table. Write unit tests for validation logic and integration tests for the full posting flow (API call through to chain file and database). Run all tests.
```

### Prompt 4 — REST API

```
Implement the REST API in src/api/. Endpoints needed: POST /api/v1/gl/transactions (submit a transaction for posting), GET /api/v1/gl/transactions (query journal with filters), GET /api/v1/gl/transactions/:id (get transaction detail), GET /api/v1/gl/accounts (list chart of accounts), POST /api/v1/gl/accounts (create account), PUT /api/v1/gl/accounts/:code (update account), GET /api/v1/gl/periods (list periods with status), POST /api/v1/gl/periods/:id/soft-close (initiate soft close), POST /api/v1/gl/periods/:id/close (initiate hard close), GET /api/v1/gl/staging (list pending approvals), POST /api/v1/gl/staging/:id/approve (approve a staged transaction), POST /api/v1/gl/staging/:id/reject (reject with reason), GET /api/v1/gl/reports/trial-balance (trial balance for a period). Use Zod for request validation. Include proper error handling middleware. Write integration tests for the key endpoints. Run all tests.
```

### Prompt 5 — Period Management

```
Implement period management in src/engine/periods.ts. This must handle: transitioning periods through OPEN -> SOFT_CLOSE -> HARD_CLOSE states, enforcing sequential closing (can't close March before February), running the closing checklist (trial balance must balance, staging area must be clear), computing the closing checkpoint and sealing the chain file, computing opening balances for the next period, and flagging database mirror data as 'closed — authoritative' vs 'open — provisional'. Write integration tests that verify: the full closing sequence works, closed periods reject new postings, periods must close in order, and that opening balances are correctly carried forward. Run all tests.
```

### Prompt 6 — Web Frontend

```
Build the React frontend in src/web/. Create these pages: Dashboard (current period status, approval queue count, recent transactions, trial balance summary), Journal (filterable/searchable transaction list with expandable detail), Chart of Accounts (tree view with balances, add/edit accounts), Approval Queue (list pending items, approve/reject/modify actions), Trial Balance (debit/credit columns, period selector, provisional/authoritative flag), Period Management (period list, soft close and hard close actions with validation checklist). Use a clean, professional design with good table formatting. Monospaced numbers aligned on decimal points. Debit and credit in separate columns. Keyboard shortcuts for the approval queue. Make all API calls go through src/web/src/hooks/ using fetch. Configure the Express server to serve the built frontend as static files. Build the frontend and verify it loads in the browser.
```

### Prompt 7 — Docker and Final Integration

```
Update the Dockerfile and docker-compose.yml so that 'docker compose up' starts the complete stack: PostgreSQL database, the API server (with migrations and seeding on startup), and the frontend served from the same Express server. Verify that the full stack starts cleanly, the frontend loads in a browser at http://localhost:3000, you can create a manual journal entry through the UI, and the entry appears in the journal view and the trial balance updates. Run the full test suite one final time. Commit everything.
```


## After Each Prompt — Saving Your Work

After Claude Code completes each prompt, save your progress using GitHub Desktop:

1. Open **GitHub Desktop**. It will automatically detect all the new and changed files.
2. In the bottom-left panel, you'll see a summary field and a description field.
3. Type a short summary of what was built (e.g., "Add database schema and migrations" or "Implement chain file writer with tests").
4. Click **Commit to main**.
5. Click **Push origin** (the button at the top) to upload your changes to GitHub.

That's it — your work is saved both locally and on GitHub.


## Testing the Final Result

Once all seven prompts are complete and the Docker stack is running:

1. Open your web browser.
2. Go to **http://localhost:3000**
3. You should see the GL module dashboard showing the current period, an empty approval queue, and the trial balance.
4. Try creating a manual journal entry through the web interface to verify everything works end-to-end.


## Troubleshooting

**Docker Desktop says "WSL 2 is not installed":** Follow the link Docker provides to install WSL 2. This usually involves running a Windows update and restarting your computer.

**Docker Desktop says a port is already in use:** Another application is using port 5432 (probably another PostgreSQL installation). Open `docker-compose.yml` in a text editor (right-click → Open with → Notepad), find `"5432:5432"` under the `db` service, and change it to `"5434:5432"`. Then update `knexfile.ts` to use port 5434 instead of 5432 in the development connection.

**npm install fails with "node is not recognised":** Node.js didn't install correctly or the system PATH wasn't updated. Try closing and reopening the PowerShell window. If that doesn't help, restart your computer.

**GitHub Desktop can't find the repository:** Make sure you're pointing it at the exact `lucaV0.5` folder (the one that contains `CLAUDE.md` and `package.json`), not a parent folder or a subfolder.

**Claude Code seems confused about the project:** Tell Claude Code: "Read CLAUDE.md and the architecture document in docs/ to understand the project." This resets its understanding of the project structure and rules.

**Tests fail with "connection refused":** The database containers aren't running. Open Docker Desktop and check that `lucaV0.5-db` and `lucaV0.5-db-test` are both showing green "Running" status. If not, start them.

**Everything worked yesterday but won't start today:** Docker Desktop may not be running. Check for the whale icon in your system tray. If it's not there, open Docker Desktop from the Start menu and wait for it to finish starting up, then start the database containers.
