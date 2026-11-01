/**
 * The workspace navigation the messaging screens share with the shell.
 *
 * Copilot binds its `WorkspaceNavProvider`; a standalone messages app can back
 * it with its own route state.
 */
export interface MessagingNavigation {
  /** The conversation the workspace is showing, if any. */
  activeId: string | undefined
  selectConversation: (id: string) => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
}
