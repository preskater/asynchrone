# Keyboard-only pass of the core flows

Manual WCAG 2.2 AA check for issue #41. The automated axe spec (`apps/copilot/e2e/a11y.spec.ts`) covers what can be detected from the DOM. This pass covers what it cannot: whether each core flow can be completed with the keyboard alone, in English and in French.

- Tester:
- Date:
- Commit:
- Browser / OS:
- Screen reader (optional):

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

## Flows

### 1. Sign up and sign in

| Step                                      | Expected                                                      | EN  | FR  |
| ----------------------------------------- | ------------------------------------------------------------- | --- | --- |
| Open `/sign-up` and submit the form empty | Each field error is announced and linked to its field         |     |     |
| Fill the form and create the account      | Lands in onboarding or the workspace                          |     |     |
| Sign out from the user menu               | The user menu opens with Enter and its items work with arrows |     |     |
| Open `/sign-in`, submit a wrong password  | The form error is announced                                   |     |     |
| Sign in                                   | Lands in the workspace, focus is on the page title            |     |     |

### 2. Create a project and a task

| Step                                                          | Expected                                                        | EN  | FR  |
| ------------------------------------------------------------- | --------------------------------------------------------------- | --- | --- |
| Reach Projects from the sidebar                               | Focus moves to the page title `<h1>`                            |     |     |
| Open "Create project" / "Créer un projet" and submit it empty | The name error is announced                                     |     |     |
| Create the project and open it                                | The project page loads, focus is on the title                   |     |     |
| Open "Create task" / "Créer une tâche" and submit it empty    | The title error is announced and linked to the field            |     |     |
| Fill the fields and create the task                           | Every field (text, select, date picker) works with the keyboard |     |     |
| Open the task from the board                                  | The task opens with Enter, Escape closes it and focus returns   |     |     |

### 3. Upload and download a file

| Step                                                             | Expected                                                  | EN  | FR  |
| ---------------------------------------------------------------- | --------------------------------------------------------- | --- | --- |
| Reach Files from the sidebar                                     | Focus moves to the page title                             |     |     |
| Open "Upload" / "Téléverser" and pick a file                     | The file picker opens from the keyboard                   |     |     |
| Complete the upload                                              | Progress and completion are announced or visible          |     |     |
| Open the file actions menu and choose "Download" / "Télécharger" | The actions button has a name, the menu works with arrows |     |     |

### 4. Send a message

| Step                                                        | Expected                                       | EN  | FR  |
| ----------------------------------------------------------- | ---------------------------------------------- | --- | --- |
| Reach Messages from the sidebar                             | Focus moves to the page title                  |     |     |
| Start a conversation with "New message" / "Nouveau message" | Choosing the recipient works with the keyboard |     |     |
| Type and send a message                                     | Enter sends, the message appears in the list   |     |     |
| Reach the message actions (react, reply, edit)              | Each action is reachable and has a name        |     |     |

### 5. Create a calendar event

| Step                                                      | Expected                                          | EN  | FR  |
| --------------------------------------------------------- | ------------------------------------------------- | --- | --- |
| Reach Calendars from the sidebar                          | Focus moves to the page title                     |     |     |
| Open "New event" / "Nouvel événement" and submit it empty | The title error is announced                      |     |     |
| Fill title, date and times, then create the event         | Date and time controls work with the keyboard     |     |     |
| Tab to the event in the week view                         | It is announced with its title and time range     |     |     |
| Open the event, choose Edit and move it to another time   | The keyboard alternative to drag and resize works |     |     |

## Findings

| Flow | Locale | Step | Problem | Severity | Follow-up |
| ---- | ------ | ---- | ------- | -------- | --------- |
|      |        |      |         |          |           |

## Known gaps

These were found while preparing this pass and are not fixed on this branch:

- `apps/copilot/components/task/date-picker.tsx` has no `id`, so its label points to nothing and custom date fields on tasks cannot be linked to their error.
- Input borders (`--input`) are about 1.2:1 against the background in light themes and 1.5:1 in dark themes. WCAG 1.4.11 asks for 3:1 when the border is the only boundary of the field.
- In the default light theme the focus ring (`--ring`) is 2.6:1 for the solid border and 1.5:1 for the halo, below 3:1.
- Primary button text is 4.24:1 in the Ocean light theme and 4.43:1 in the Candy light theme, just below 4.5:1.
