/**
 * The workspace navigation the messaging screens share with the shell.
 *
 * `apps/messages` backs it with its own route state; Copilot's in-process
 * binding is gone since #162.
 */
export interface MessagingNavigation {
  /** The conversation the workspace is showing, if any. */
  activeId: string | undefined
  selectConversation: (id: string) => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
}
