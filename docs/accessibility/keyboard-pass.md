# Keyboard-only pass of the core flows

Manual WCAG 2.2 AA check for issue #41. The automated axe spec (`apps/copilot/e2e/a11y.spec.ts`) covers what can be detected from the DOM. This pass covers what it cannot: whether each core flow can be completed with the keyboard alone, in English and in French.

- Tester: Claude (Opus 5.5), driving an automated browser. Not yet repeated by a person.
- Date: 2026-11-06
- Commit: uncommitted work on `fix/a11y-domain-apps-41`, based on `113034c`, after the lot 4 token changes
- Browser / OS: Playwright Chromium (headless, build 1248), 1280x800, macOS (Darwin 27.2), local stack
- Screen reader (optional): none

## How to run it

Run each flow in `/en/...` and then in `/fr/...`. Do not touch the mouse or trackpad. Use only Tab, Shift+Tab, Enter, Space, Escape and the arrow keys.

On every step, check:

- **Focus visible**: you can always see where focus is.
- **Focus order**: Tab follows the visual order, and nothing focusable is invisible.
- **No trap**: you can always Tab away, and Escape closes dialogs, menus and popovers.
- **Focus return**: when a dialog closes, focus returns to the control that opened it.
- **Names**: every control is announced or labelled with its purpose. Icon-only buttons need a label.
- **Errors**: when a form is submitted empty, the error is announced and read again when you return to the field.

Record results as `OK`, `KO` (blocking) or `~` (works, with friction). Describe every `KO` and `~` in the Findings table.

### Limits of this pass

This pass sent real key presses through Playwright and read `document.activeElement` after each one. No mouse was used, and no screen reader ran, so nothing here proves what is actually spoken.

- `SR?` means the DOM is correct (`role="alert"`, `aria-invalid`, `aria-describedby` or an accessible name) but the announcement still has to be confirmed by a person with a screen reader.
- The native file dialog cannot be driven: the pass checked that it opens from the keyboard, then supplied the file through Playwright.
- A visible focus indicator was checked from computed styles and one screenshot, not by eye on every step.
- The Tab order was checked at 1280x800 only. Sign-up, onboarding and sign-in ran on throwaway accounts; flows 2 to 5 ran in `local-demo` with an added test teammate.

## Flows

### 1. Sign up and sign in

| Step                                      | Expected                                                      | EN  | FR  |
| ----------------------------------------- | ------------------------------------------------------------- | --- | --- |
| Open `/sign-up` and submit the form empty | Each field error is announced and linked to its field | SR? | SR? |
| Fill the form and create the account | Lands in onboarding or the workspace | OK | OK |
| Sign out from the user menu | The user menu opens with Enter and its items work with arrows | OK | OK |
| Open `/sign-in`, submit a wrong password | The form error is announced | SR? | ~ |
| Sign in | Lands in the workspace, focus is on the page title | ~ | ~ |

### 2. Create a project and a task

| Step                                                          | Expected                                                        | EN  | FR  |
| ------------------------------------------------------------- | --------------------------------------------------------------- | --- | --- |
| Reach Projects from the sidebar | Focus moves to the page title `<h1>` | ~ | ~ |
| Open "Create project" / "Créer un projet" and submit it empty | The name error is announced | SR? | SR? |
| Create the project and open it | The project page loads, focus is on the title | OK | OK |
| Open "Create task" / "Créer une tâche" and submit it empty | The title error is announced and linked to the field | SR? | SR? |
| Fill the fields and create the task | Every field (text, select, date picker) works with the keyboard | KO | KO |
| Open the task from the board | The task opens with Enter, Escape closes it and focus returns | KO | KO |

### 3. Upload and download a file

| Step                                                             | Expected                                                  | EN  | FR  |
| ---------------------------------------------------------------- | --------------------------------------------------------- | --- | --- |
| Reach Files from the sidebar | Focus moves to the page title | ~ | ~ |
| Open "Upload" / "Téléverser" and pick a file | The file picker opens from the keyboard | OK | OK |
| Complete the upload | Progress and completion are announced or visible | OK | OK |
| Open the file actions menu and choose "Download" / "Télécharger" | The actions button has a name, the menu works with arrows | OK | OK |

### 4. Send a message

| Step                                                        | Expected                                       | EN  | FR  |
| ----------------------------------------------------------- | ---------------------------------------------- | --- | --- |
| Reach Messages from the sidebar | Focus moves to the page title | ~ | ~ |
| Start a conversation with "New message" / "Nouveau message" | Choosing the recipient works with the keyboard | ~ | ~ |
| Type and send a message | Enter sends, the message appears in the list | OK | OK |
| Reach the message actions (react, reply, edit) | Each action is reachable and has a name | KO | KO |

### 5. Create a calendar event

| Step                                                      | Expected                                          | EN  | FR  |
| --------------------------------------------------------- | ------------------------------------------------- | --- | --- |
| Reach Calendars from the sidebar | Focus moves to the page title | ~ | ~ |
| Open "New event" / "Nouvel événement" and submit it empty | The title error is announced | KO | KO |
| Fill title, date and times, then create the event | Date and time controls work with the keyboard | KO | KO |
| Tab to the event in the week view | It is announced with its title and time range | SR? | SR? |
| Open the event, choose Edit and move it to another time | The keyboard alternative to drag and resize works | ~ | ~ |

## Findings

| Flow | Locale | Step | Problem | Severity | Follow-up |
| ---- | ------ | ---- | ------- | -------- | --------- |
| 2, 5 | EN, FR | Date picker | Arrow keys do not move between days in the `@workspace/ui` calendar: focus stays on the current day. Only that day, or the first day reached after changing month, can be picked. Pressing Enter on the already selected day clears the date. Seen in the task form, the event dialog and the calendars mini calendar. Cause not established. | KO | Fix in `packages/ui/src/components/calendar.tsx`, then repeat flows 2 and 5 |
| 2 | EN, FR | Open the task from the board | Enter on the card button and on "Task actions" does nothing: the dnd-kit listeners on the card wrapper catch the keydown (`defaultPrevented`) in `packages/projects/src/components/task/task-card.tsx`. The list view is no alternative, because its rows are only clickable (`task-list.tsx`). The project Calendar tab works: Enter opens the task, Escape closes it and focus returns. | KO | Bind the drag listeners to a handle, and make list rows reachable |
| 4 | EN, FR | Message actions | React, reply and edit never appear: their bar is `hidden group-hover:flex` in `packages/messaging/src/components/message-item.tsx`, so it is `display: none` without a mouse. | KO | Keep the bar focusable and reveal it on focus |
| 5 | EN, FR | Calendar search field | Tab into "Search events" opens the search dialog through `onFocus` (`calendars-header.tsx`). Escape returns focus to the field, which reopens the dialog, so forward Tab can never pass it. This is a keyboard trap (WCAG 2.1.2), and it hides "Show tasks", "Requests", "New event" and the grid from forward Tab. The pass went around it with Shift+Tab from the top of the page. | KO | Replace the read-only field with a button, or stop opening on focus |
| 1 | EN, FR | Sign in | After sign-in (and after onboarding) focus stays on `body`. `useTitleFocus` only runs on client-side navigation inside an app, not after a full page load. | ~ | Decide whether a full load should focus the title; the skip link is the first Tab stop |
| 2-5 | EN, FR | Reach an app from the sidebar | Moving to another app is a full page load, so focus stays on `body` and the title is not focused. Client-side navigation inside an app does focus it (project page: `focused=true`). | ~ | Same decision as above |
| 1 | FR | Wrong password | `/fr/sign-in` shows the Better Auth message in English: "Invalid email or password". | ~ | Map auth error codes to translations |
| 2, 5 | FR | Date picker | Calendar labels stay in English on French pages ("Go to the Previous Month", "Today, ..."), because the task date picker gets no locale. | ~ | Pass the locale to `Calendar` |
| 2 | EN, FR | Task form | The assignee and priority controls have no accessible name of their own: the name is only the value ("Unassigned", "Low"). Their `FieldLabel` points to an id that no control carries. | ~ | Add the ids or an `aria-label` |
| 2 | EN, FR | Project tabs | The tab panel is a Tab stop with no focus style. | ~ | Add a focus style or remove the Tab stop |
| 4 | EN, FR | New message | Choosing a teammate works with the arrows and Enter, but focus returns to "New message". The composer is 12 Tab stops away. | ~ | Focus the composer when the conversation opens |
| 5 | EN, FR | Event dialog | The hour and minute selects are named only by their value ("11 AM", "35"), so start and end cannot be told apart by name. | ~ | Add an `aria-label` to each select |
| 5 | EN, FR | Edit an event | Works: "Edit" exists in `event-details-sheet.tsx` (line 230) and is reachable; the time selects moved the event from 12:38 to 2:38 PM, and focus returned to "Edit", then to the event. Moving it to another day hits the date picker `KO`. | ~ | Covered by the date picker fix |

## Known gaps

The contrast gaps found while preparing this pass are fixed on this branch: field borders use `--input-border` (3.34:1 light, 3.83:1 dark at worst), `--ring` is 16.77:1 in the default light theme and 9.59:1 in the default dark theme, `--sidebar-ring` follows `--ring`, and primary button text is 4.59:1 (Ocean light) and 4.62:1 (Candy light). The task date picker now takes an `id`.

These are not fixed:

- The `KO` and `~` items in the Findings table.
- Primary button text falls below 4.5:1 on hover, because `hover:bg-primary/80` lightens the button: from 3.31:1 (Ocean light) to 4.37:1 (Coffee light) across six light themes.
- `readableForeground` in `packages/appearance/src/types.ts` uses a luma threshold, not WCAG contrast. It picks white on `#9e9e9e`, which is 2.68:1, so custom themes can fail.
- The team calendar cells in `packages/employees/src/components/team-calendar.tsx` show the status by colour alone, with only a `title`. They are 1.10:1 to 1.66:1 against the background in the default light theme, and leave, RTT and holiday share one colour. The text in `STATUS_CLASSES` is fine.
- The focus halo (`ring/50`) stays below 3:1 in the themed light themes (about 2:1). The solid focus border meets 3:1 there.
