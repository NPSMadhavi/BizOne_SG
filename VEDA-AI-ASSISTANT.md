# Veda AI Assistant — Very Simple Team Guide

This guide explains only the **BizOne Veda AI Assistant**.

It explains:

- what Veda is;
- where to find it;
- how Veda understands a request;
- how Veda answers;
- how Veda searches BizOne;
- how Veda opens pages and documents;
- how Veda fills forms;
- what Veda can create or change;
- how voice mode works;
- what Veda remembers;
- what can go wrong;
- where the code lives (for developers).

---

## 1. What is Veda?

Veda is a helper inside BizOne.

Think of Veda like a staff member sitting next to you:

1. You tell Veda what you want.
2. Veda reads your request.
3. Veda decides whether it must:
   - answer you;
   - search BizOne;
   - open a page;
   - fill a form;
   - create or update something.
4. Veda performs the required steps.
5. Veda tells you what happened.

Veda is not a separate accounting system. It works with the information already stored in BizOne.

---

## 2. Where is Veda?

After signing in to BizOne and selecting a company, the Veda panel is available from the main BizOne screen.

You can use Veda in three ways:

### A. Type a message

1. Open Veda.
2. Click the message box.
3. Type your request.
4. Press **Enter** or click **Send**.

Use **Shift + Enter** when you want a new line instead of sending the message.

### B. Use the microphone

1. Open Veda.
2. Click the microphone.
3. Speak clearly.
4. Click the microphone again to stop.
5. Veda converts your voice into words.
6. Veda handles the words exactly like a typed message.

Your browser must allow microphone access.

### C. Use ambient voice mode

Ambient mode allows a voice conversation without keeping the full panel open.

You can also press:

**Alt + M**

Veda will greet you and start listening.

---

## 3. The easiest way to speak to Veda

Tell Veda:

1. **the action** you want;
2. **the document or person** involved;
3. **the important details**.

### Good examples

- `Open invoice INV-0042.`
- `Show me the latest purchase order for Westcon.`
- `Go to the new quotation form.`
- `Search for customer SP Systems.`
- `What is our revenue this month?`
- `Change the payment terms on this form to 30 Days Net.`
- `Create an invoice for ABC Company with one router at $500.`
- `Email invoice INV-0042 to accounts@example.com.`

### Less useful examples

- `Open it.`
- `Find that customer.`
- `Make the document.`
- `Change the date.`

These may work if the earlier conversation makes the meaning clear, but a complete request is safer.

---

## 4. What happens after you send a message?

Here is the full journey:

```text
You type or speak
        ↓
BizOne sends the message to the Veda server
        ↓
Veda checks that you are signed in
        ↓
Veda checks which company is currently selected
        ↓
Veda reads your request
        ↓
Veda chooses one or more BizOne tools
        ↓
The tools search, open, fill, create, or update
        ↓
Veda shows the answer and/or moves you to the correct page
```

Veda may use several steps for one simple request.

### Example

You say:

> Show me the latest invoice for SP Systems.

Veda may do this:

1. Search invoices for `SP Systems`.
2. Find the matching invoice.
3. Load its full details.
4. Open that invoice in BizOne.
5. Tell you its number, date, amount, and status.

You do not need to tell Veda the internal database ID.

---

## 5. How does Veda answer questions?

Veda has two types of answers.

### A. A normal explanation

For a simple question, Veda replies in the chat panel.

Example:

> What can you do?

Veda can explain its abilities without opening another page.

### B. An answer using real BizOne information

For questions about customers, vendors, documents, stock, or financial figures, Veda should search BizOne first.

Example:

> How much did we invoice this month?

Veda uses the financial statistics tool and then explains the result.

Veda is instructed not to guess business figures.

---

## 6. How does Veda search?

Veda can search the currently selected company for:

- customers;
- vendors and suppliers;
- invoices;
- quotations;
- purchase orders;
- delivery orders;
- vendor invoices;
- Goods Received Notes;
- stock items;
- company settings;
- financial statistics.

### Use the full name

Say:

> Search for Micro United Network.

Do not unnecessarily shorten it to:

> Search Micro.

Veda normally starts with the full name. If nothing is found, it may try fewer words.

### Search is limited to the selected company

If Company A is selected, Veda searches Company A.

It should not return Company B's records.

To work with Company B:

1. Switch to Company B in BizOne.
2. Then ask Veda again.

---

## 7. How does Veda navigate inside BizOne?

Veda has a navigation tool containing approved BizOne page paths.

When you say:

> Go to Purchase Orders.

Veda returns a navigation instruction to your browser.

The browser then opens the Purchase Orders page.

### Navigation is not a mouse click

Veda does not move a visible mouse pointer through the menu.

It directly tells BizOne:

> Open this page path.

This is why navigation can feel immediate.

### Opening a specific document

When you say:

> Open invoice INV-0042.

Veda normally:

1. Searches for the invoice.
2. Finds its internal ID.
3. Loads its details.
4. Builds the correct invoice page path.
5. Tells the browser to open that path.

### Permissions still matter

Veda may request a page, but BizOne still applies the normal page permissions.

If the signed-in user does not have access:

- BizOne may show **Access Denied**; or
- BizOne may redirect the user to an allowed page.

Veda does not give a normal user an administrator screen merely because the user asked for it.

---

## 8. How does Veda fill an open form?

Suppose you are already on a new or edit form.

You say:

> Change payment terms to 15 Days Net and currency to USD.

Veda sends these field changes to the open page.

The form then places the values into the matching boxes.

### Important

Filling a form is not always the same as saving it.

Veda can place values into the visible form, but the user should:

1. Review the values.
2. Correct anything necessary.
3. Save or submit the form.

### Examples of fields Veda can fill

- customer or vendor details;
- addresses;
- contact information;
- currency;
- payment terms;
- delivery date;
- notes;
- PO reference;
- discount;
- GST;
- income or expense details;
- journal-entry description and reference.

The exact fields depend on the page supporting Veda form filling (`useVedaFormFill`).

---

## 9. Opening a new form with information already filled

Veda can also navigate to a new document form and carry information with it.

Example:

> Prepare a new invoice for ABC Company with two routers, but let me review it.

Veda can:

1. Collect the customer and item information.
2. Open the new invoice page.
3. Pass the information to that page.
4. Let the invoice page prefill the form.
5. Leave the user to review and save it.

This information is carried temporarily in the browser (`window.__vedaPrefill`, and `__ariaPrefill` for invoice new pages). It is consumed by supported new-document pages.

---

## 10. Can Veda create documents directly?

Yes. Veda has direct tools for creating:

- invoice drafts;
- quotation drafts;
- purchase orders;
- delivery orders.

For a simple document, Veda may use the direct creation tool.

For a complex document, or when the user wants to review it, Veda should open a prefilled form instead.

### Normal creation procedure

1. You provide the customer/vendor and item details.
2. Veda searches for any information it needs.
3. Veda gives one short summary.
4. Veda asks:

   > Shall I go ahead?

5. You answer `yes`, `ok`, `sure`, `do it`, or similar.
6. Veda creates the document.
7. Veda tells you the new document number.
8. Veda can offer to open or email it.

### Always review important documents

Before confirming, sending, or using a document, check:

- customer or vendor;
- items;
- quantity;
- price;
- currency;
- GST;
- date;
- payment terms;
- total.

Veda is helpful, but the responsible staff member remains the final reviewer.

---

## 11. Confirming, voiding, and marking paid

Veda has tools that can perform important document actions.

Examples:

- confirm an invoice, quotation, purchase order, or delivery order;
- void an invoice;
- mark or knock off an invoice as paid.

### Be very clear

Say:

> Confirm invoice INV-0042.

or:

> Void invoice INV-0042 because it was issued twice.

or:

> Mark invoice INV-0042 as paid.

An explicit command may be acted on immediately after Veda finds the document.

### Voiding

Veda must have a void reason.

If you do not give one, Veda should ask for it instead of inventing a reason.

### Team safety rule

Never use vague instructions for important actions.

Avoid:

> Confirm it.

Prefer:

> Confirm invoice INV-0042.

After the action, check the document page and status.

---

## 12. How does email work?

When asked to email a supported document, Veda:

1. Searches for the document.
2. Finds the recipient from the document, or uses the email you supplied.
3. Opens the correct document page.
4. Opens or prepares the email dialog.
5. Prefills the recipient.

If Veda cannot find a recipient email, it should ask you for one.

### Important

The current Veda email procedure prepares the document's email screen. The user should review:

- recipient;
- subject;
- message;
- attachment.

Then use the normal email dialog to send.

---

## 13. How does voice work?

Voice has three separate steps.

### Step 1: Record

Your browser records your microphone.

### Step 2: Convert speech to text

The audio is sent to BizOne's transcription service (`POST /api/agent/transcribe`).

The service returns words.

Example:

```text
Recorded sound
    ↓
"Open the latest invoice for SP Systems"
```

### Step 3: Handle it like typed text

The transcript is sent through the normal Veda chat procedure.

For a voice request, Veda can read its answer aloud using the browser's available speech voice.

### Voice problems

Voice may fail when:

- microphone permission is blocked;
- no microphone is available;
- the recording is too short;
- there is heavy background noise;
- the browser cannot record the required audio format;
- the transcription service is unavailable.

If voice fails, type the same request.

---

## 14. What does Veda remember?

Veda has two kinds of short-term context.

### A. The current chat

While the current panel conversation is open, earlier messages are sent with the next message.

This lets you say:

> Open invoice INV-0042.

Then:

> What is its total?

### B. Small browser memory

Veda stores up to 10 small memory notes in that browser (`localStorage` key `veda_memory_v1`).

For example, after creating a document, it may remember:

> Created invoice INV-0042.

This browser memory helps with recent context.

### What Veda does not currently do

Veda does not currently load a permanent server-side conversation history.

Database tables for conversations and messages exist, but the current Veda interface does not use them to save and reload chats.

Therefore:

- another computer will not automatically have the same Veda chat;
- another browser may not have the same Veda memory;
- clearing browser storage can remove the small saved memory;
- clicking **Clear** removes the messages displayed in the current panel.

Do not treat Veda chat as the permanent record of a business decision.

---

## 15. What does Veda know about the current screen?

Veda can change a supported open form when the page is listening for Veda field updates.

However, Veda does not literally see the screen like a human watching every pixel.

It works from:

- your message;
- the recent chat;
- its small browser memory;
- the selected company;
- the BizOne tools available to it;
- records returned by those tools.

For best results, mention the document or field clearly.

---

## 16. What can users see while Veda is working?

The panel can show activity messages such as:

- Searching customers
- Searching vendors
- Searching invoices
- Loading invoice
- Calculating stats
- Updating form
- Navigating
- Creating invoice
- Creating quotation
- Creating purchase order
- Creating delivery order
- Confirming document
- Voiding invoice
- Marking invoice paid
- Preparing email

These labels mean Veda is using a BizOne tool.

The final written answer appears gradually while it is generated.

---

## 17. Security and company separation

Before answering a chat request, the server checks:

1. Is the user signed in?
2. Has the user selected a company?

Veda's database searches and document operations use the company selected in the user's session.

Normal BizOne route permissions are still checked when a page opens. Tool access is also filtered by module RBAC (`agent-rbac.ts`).

### Team procedure

Before using Veda:

1. Check the company shown in BizOne.
2. Switch company if necessary.
3. Make the request.
4. Verify the company and document before saving or confirming.

---

## 18. Simple examples from start to finish

### Example A: Open an invoice

You:

> Open invoice INV-0042.

Veda:

1. Searches for INV-0042.
2. Loads the full invoice.
3. Sends a navigation instruction.
4. BizOne opens the invoice.
5. Veda gives a short summary.

---

### Example B: Find a customer's latest invoice

You:

> Show the latest invoice for SP Systems.

Veda:

1. Searches invoices using the full customer name.
2. Chooses the matching result.
3. Loads the invoice.
4. Opens it.
5. Explains the amount and status.

---

### Example C: Change an open form

You are already editing an invoice / quotation / PO (supported pages).

You:

> Change payment terms to 30 Days Net.

Veda:

1. Decides the current form should be updated.
2. Sends `{ paymentTerms: "30 Days Net" }` to the page.
3. The form updates that field.
4. Veda confirms the change.
5. You review and save.

---

### Example D: Prepare a new invoice for review

You:

> Prepare an invoice for ABC Company for two routers at $500 each. Let me review it.

Veda:

1. Searches for ABC Company.
2. Gathers the customer information.
3. Opens the new invoice page.
4. Prefills the customer and item information.
5. You review totals, GST, dates, and terms.
6. You save when satisfied.

---

### Example E: Ask for financial figures

You:

> What is this month's revenue?

Veda:

1. Calls the financial statistics tool for this month.
2. Receives the totals.
3. Calculates and formats the useful figures.
4. Answers in the panel.

---

### Example F: Prepare an invoice email

You:

> Email invoice INV-0042 to accounts@example.com.

Veda:

1. Finds the invoice.
2. Opens the invoice page.
3. Prepares the email action.
4. Prefills `accounts@example.com`.
5. You review the email and send it.

---

## 19. What Veda cannot be trusted to do blindly

Do not blindly accept:

- amounts;
- GST treatment;
- payment status;
- customer or vendor matching;
- bank-related information;
- destructive actions;
- document confirmation;
- email recipients.

Always review important results.

Veda uses real tools and real records. A mistaken instruction can therefore have a real business effect.

---

## 20. Common problems and easy solutions

### Problem: Veda says “Not authenticated”

**Meaning:** Your sign-in session is missing or expired.

**Fix:**

1. Refresh BizOne.
2. Sign in again.
3. Retry.

---

### Problem: Veda says “No company selected”

**Meaning:** Veda does not know which company's records to use.

**Fix:**

1. Select a company.
2. Retry the request.

---

### Problem: Veda finds the wrong customer or document

**Fix:**

1. Use the full customer/vendor name.
2. Include the document number if known.
3. Include the document type.
4. Ask Veda to show the result before taking action.

Example:

> Find invoice INV-0042 and show it to me. Do not change anything.

---

### Problem: Veda navigates to Access Denied

**Meaning:** The user's BizOne role does not allow that module.

**Fix:** Ask an administrator to review the user's module permissions.

Do not ask Veda to bypass access control.

---

### Problem: Veda fills nothing on the form

Possible reasons:

- the page does not support Veda form filling;
- the field name is not recognized;
- the user is not on a form;
- the request was unclear.

**Fix:**

1. Open the correct new/edit form.
2. Name the field and value clearly.
3. Retry.

Example:

> On this open invoice form, set Currency to USD.

---

### Problem: Microphone does not work

**Fix:**

1. Allow microphone permission.
2. Check the correct microphone is selected.
3. Speak for longer than one second.
4. Reduce background noise.
5. Type the request if it still fails.

---

### Problem: Veda says “Something went wrong”

Possible reasons:

- internet interruption;
- AI service interruption;
- BizOne server error;
- invalid tool information;
- request stopped before completion.

**Fix:**

1. Wait a few seconds.
2. Repeat the request once.
3. Make the request shorter and more specific.
4. If it repeatedly fails, report the exact request and time to the technical team.

---

## 21. Recommended team procedure

Teach every team member this five-step rule:

### 1. Check

Check that the correct company is selected.

### 2. Ask clearly

Say the action, document/person, and details.

### 3. Watch

Read Veda's search or action messages.

### 4. Review

Check the opened page, form, amount, status, and recipient.

### 5. Save or approve

Only complete the normal BizOne save, confirm, void, payment, or email procedure after reviewing.

In one sentence:

> **Ask Veda clearly, let Veda prepare the work, then let a human check the important parts.**

---

## 22. Quick instruction card

| I want to… | Say this… |
|---|---|
| Open a module | `Go to Purchase Orders.` |
| Open a document | `Open invoice INV-0042.` |
| Search by company name | `Find the latest invoice for SP Systems.` |
| Search a customer | `Search customer Micro United Network.` |
| Get statistics | `Show this quarter's revenue.` |
| Fill the current form | `Set payment terms to 30 Days Net on this form.` |
| Prepare a document | `Prepare a quotation for ABC Company and let me review it.` |
| Create a simple draft | `Create an invoice draft for ABC Company with one router at $500.` |
| Confirm a document | `Confirm invoice INV-0042.` |
| Void an invoice | `Void invoice INV-0042 because it was issued twice.` |
| Mark paid | `Mark invoice INV-0042 as paid.` |
| Prepare an email | `Email invoice INV-0042 to accounts@example.com.` |

---

## 23. Technical summary for the support team

This is the same flow in technical language:

1. The BizOne application shell displays the Veda panel.
2. Typed or transcribed messages are sent to `/api/agent/chat`.
3. The request includes the current visible chat and up to 10 browser memory facts.
4. The API requires an authenticated session and selected company.
5. The API builds Veda's instruction prompt and filters tools by module RBAC.
6. The AI chooses from the registered BizOne tools.
7. Tool execution uses the selected company ID for data scoping.
8. The API streams events to the browser:
   - `text`
   - `tool_call`
   - `navigate`
   - `fill_form`
   - `trigger_email`
   - `error`
   - `done`
9. The browser displays text as it arrives.
10. A navigation event changes the BizOne route directly.
11. A form-fill event sends field values to supported React forms (`veda:fill-form`).
12. An email event opens the relevant document/email flow (`veda:open-email` / `__vedaOpenEmail`).
13. Voice recording uses `/api/agent/transcribe`.
14. Spoken replies currently use the browser's speech system.

### Current implementation limits

- Permanent server-side Veda conversation history is not currently active.
- Browser memory is limited to 10 small facts.
- Not every form is guaranteed to support Veda field filling.
- Veda's server entry checks authentication and selected company; normal page/module permissions are applied by BizOne when navigating.
- Voice quality depends on microphone, browser, and background noise.
- A server text-to-speech endpoint exists (`/api/agent/speak`), but the current panel reads replies using browser speech.

---

## 24. Developer codebase map — where the Veda code lives

The project contains two main applications involved in Veda (under `BizOne_SG/`):

```text
artifacts/
├── po-app/       ← BizOne browser application (frontend)
└── api-server/   ← BizOne server and Veda intelligence (backend)

lib/
└── db/           ← shared database table definitions
```

### The most important rule for developers

Start with these two files:

```text
Frontend:
artifacts/po-app/src/components/agent-panel.tsx

Backend:
artifacts/api-server/src/routes/agent.ts
```

Most Veda changes will touch one or both of them.

Do not depend permanently on line numbers. Search for the function, variable, route, or tool name shown below.

---

## 25. Main Veda files and what each one controls

### 25.1 Main frontend assistant

```text
artifacts/po-app/src/components/agent-panel.tsx
```

Controls: panel UI, chat, suggestions, mic, ambient mode, Alt+M, SSE streaming, navigation, form-fill events, email prep, browser memory.

Important names: `MEMORY_KEY`, `MAX_MEMORY`, `TOOL_LABELS`, `PATH_LABELS`, `SUGGESTIONS`, `speakBrowser`, `streamChat`, `storeVedaPrefill`, `handleNavigate`, `send`, `mic`, `clear`, `AgentPanel`.

### 25.2 Where Veda is attached to BizOne

```text
artifacts/po-app/src/components/layout/shell.tsx
```

Renders `<AgentPanel />` so Veda is available across authenticated pages that use this shell.

### 25.3 Main backend Veda file

```text
artifacts/api-server/src/routes/agent.ts
```

Contains auth/company checks, `AGENT_TOOLS`, search helpers, `executeTool`, `systemPrompt`, chat/transcribe/speak endpoints, and SSE streaming.

### 25.4 API route registration

```text
artifacts/api-server/src/routes/index.ts
```

Registers `agentRouter`. Browser calls: `/api/agent/chat`, `/api/agent/transcribe`, `/api/agent/speak`.

### 25.5 Module RBAC

```text
artifacts/api-server/src/lib/agent-rbac.ts
```

Filters which tools a user may call based on module permissions.

### 25.6 Form-fill hook

```text
artifacts/po-app/src/hooks/useVedaFormFill.ts
```

Listens for `veda:fill-form` and calls React Hook Form `setValue()`.

### 25.7 Prefill bridge

Writer: `agent-panel.tsx` → `storeVedaPrefill()` sets:

- `window.__vedaPrefill` (quotations, POs, sales orders, etc.)
- `window.__ariaPrefill` (legacy invoice new page)

Consumers clear the value after reading it.

### 25.8 Shared database schema

```text
lib/db/src/schema/
```

Conversation/message table files exist but are **not** wired into the live Veda chat UI.

### 25.9 AI integration

```ts
@workspace/integrations-openai-ai-server
```

Provides chat completion streaming, speech-to-text, and server TTS helpers. Do not hardcode API keys.

---

## 26. How the backend tool system is organized

A Veda tool has two required halves in `agent.ts`:

1. **Definition** in `AGENT_TOOLS` — tells the AI the tool exists and its parameters.
2. **Implementation** in `executeTool` — performs the real work.

| Missing part | What happens |
|---|---|
| Missing `AGENT_TOOLS` definition | The AI does not know it can choose the tool |
| Missing `executeTool` case | The server returns `Unknown tool` |

Names must match exactly. Always scope DB queries with `eq(table.companyId, companyId)`.

---

## 27. Procedure for adding a new Veda capability

1. Decide read vs write, permissions, confirmation, and expected result.
2. Find the existing BizOne API/business logic — prefer shared logic over a weaker Veda-only copy.
3. Add the tool to `AGENT_TOOLS`.
4. Add the matching `case` in `executeTool` with company scoping and permission checks.
5. Update `systemPrompt` with when/how to use the tool.
6. Add frontend handling only if needed (`navigate` / `fill_form` / `trigger_email` / new event).
7. Add a progress label to `TOOL_LABELS` in `agent-panel.tsx`.
8. Add route/prefill support if navigating to a new page.
9. Test admin / accountant / restricted user and Company A vs Company B.
10. Test error cases (missing args, wrong status, empty search, abort).

---

## 28. “I want to change X” — exact file to edit

| Desired change | Primary file |
|---|---|
| Personality / response rules | `agent.ts` → `systemPrompt` |
| Confirmation rules | `agent.ts` → tool descriptions + `systemPrompt` + write validation |
| New AI tool | `agent.ts` → `AGENT_TOOLS` + `executeTool` |
| Search behaviour | `agent.ts` → matching `executeTool` case |
| Financial stats | `agent.ts` → `periodStartDate` + `getFinancialStats` |
| Allowed navigation paths | `agent.ts` → `navigateTo` description |
| Browser navigation / prefill | `agent-panel.tsx` → `handleNavigate` / `storeVedaPrefill` |
| Navigation labels | `agent-panel.tsx` → `PATH_LABELS` |
| Progress labels | `agent-panel.tsx` → `TOOL_LABELS` |
| Suggested prompts | `agent-panel.tsx` → `SUGGESTIONS` |
| Panel UI | `agent-panel.tsx` |
| Where Veda mounts | `shell.tsx` |
| Form filling | Target page + `useVedaFormFill.ts` |
| Transcription | `agent.ts` → `/agent/transcribe` |
| Spoken replies | `agent-panel.tsx` → `speakBrowser` / `speak` |
| Permanent chat history | schema + new persistence + `agent-panel.tsx` |
| Tool RBAC | `agent-rbac.ts` |

---

## 29. How streamed events connect backend and frontend

| Event | Backend meaning | Frontend action |
|---|---|---|
| `text` | Piece of written answer | Append to assistant message |
| `tool_call` | Tool selected | Show progress label |
| `navigate` | Open a BizOne route | Store optional prefill and navigate |
| `fill_form` | Change current form values | Dispatch `veda:fill-form` |
| `trigger_email` | Prepare document email | Store recipients and open email flow |
| `error` | Failure | Show error message |
| `done` | Stream complete | Stop reading |

---

## 30. Local developer verification

From the `BizOne_SG` repository root:

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/po-app run typecheck
git diff --check
```

Restart:

```text
artifacts/api-server: API Server
artifacts/po-app: web
```

Then verify chat, navigation, form fill, company scoping, and permissions.

---

## 31. Minimum manual test list after every Veda change

- Chat streams into the panel.
- Search known / unknown customer and known invoice number.
- Open a list page and a specific document; try a denied module.
- Form fill changes visible values but does not silently save.
- Prefill reaches the correct new form and does not leak to the next form.
- Create draft, confirm number and company ownership; test missing confirmation.
- Voice transcript + spoken reply stop.
- Company A vs Company B isolation.
- Admin / accountant / restricted user write permissions.

---

## 32. Developer warning list

Do not:

- hardcode AI keys;
- remove `companyId` filters;
- trust an ID from the AI without checking company ownership;
- rely only on frontend route permissions for writes;
- let prompt wording be the only protection for destructive actions;
- add a tool definition without an execution case (or the reverse);
- return full database records when a small safe result is enough;
- leave `window.__vedaPrefill` / `__ariaPrefill` uncleared;
- assume all forms use the same field names;
- duplicate normal BizOne business logic with weaker Veda-only logic;
- treat browser memory as permanent business history;
- change unrelated document pages when fixing Veda — keep Veda changes in agent files unless a page must explicitly opt in.

---

## Final rule

Veda is an assistant, not the final approver.

Use Veda to:

- find;
- explain;
- open;
- prepare;
- prefill;
- speed up work.

Use a responsible human to:

- verify;
- save;
- confirm;
- void;
- mark paid;
- send.
