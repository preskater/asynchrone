import type { ProjectActions } from "@workspace/projects/ui-actions"

import {
  addCommentAction,
  addLabelAction,
  addMemberAction,
  createProjectAction,
  createTaskAction,
  importTasksAction,
  createTaskTemplateAction,
  deleteProjectAction,
  deleteTaskAction,
  listProjectShellAction,
  loadProjectWorkspaceAction,
  moveTaskAction,
  removeLabelAction,
  removeMemberAction,
  removeTaskTemplateAction,
  toggleSubtaskAction,
  updateMemberRoleAction,
  updateProjectAction,
  updateProjectClientSettingsAction,
  updateTaskAction,
  updateTaskTemplateAction,
} from "@/actions/projects"
import {
  connectRepositoryAction,
  disconnectRepositoryAction,
  getRepositoryConnectionAction,
  listUserRepositoryTokensAction,
  syncRepositoryAction,
} from "@/actions/integrations"
import {
  listProjectMessagesAction,
  postProjectMessageAction,
} from "@/actions/project-messages"
import { listProjectFeedbackAction } from "@/actions/project-feedback"

/**
 * The app's server actions, bound to the port `@workspace/projects` expects.
 *
 * Package components reach them through `useProjectActions()`; no component
 * imports `@/actions/*`.
 */
export const PROJECT_ACTIONS: ProjectActions = {
  listShell: listProjectShellAction,
  loadWorkspace: loadProjectWorkspaceAction,
  createProject: createProjectAction,
  updateProject: updateProjectAction,
  deleteProject: deleteProjectAction,
  updateClientSettings: updateProjectClientSettingsAction,
  createTask: createTaskAction,
  importTasks: importTasksAction,
  updateTask: updateTaskAction,
  moveTask: moveTaskAction,
  deleteTask: deleteTaskAction,
  toggleSubtask: toggleSubtaskAction,
  addComment: addCommentAction,
  addMember: addMemberAction,
  updateMemberRole: updateMemberRoleAction,
  removeMember: removeMemberAction,
  addLabel: addLabelAction,
  removeLabel: removeLabelAction,
  createTemplate: createTaskTemplateAction,
  updateTemplate: updateTaskTemplateAction,
  removeTemplate: removeTaskTemplateAction,
  listMessages: listProjectMessagesAction,
  postMessage: postProjectMessageAction,
  getRepositoryConnection: getRepositoryConnectionAction,
  connectRepository: connectRepositoryAction,
  disconnectRepository: disconnectRepositoryAction,
  syncRepository: syncRepositoryAction,
  listUserRepositoryTokens: listUserRepositoryTokensAction,
  listProjectFeedback: listProjectFeedbackAction,
}
