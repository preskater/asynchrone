export interface Suggestion {
  labelKey: string
  promptKey: string
}

export const suggestions: Suggestion[] = [
  {
    labelKey: "catchMeUp",
    promptKey: "catchMeUpPrompt",
  },
  {
    labelKey: "planMyDay",
    promptKey: "planMyDayPrompt",
  },
  {
    labelKey: "summarizeProject",
    promptKey: "summarizeProjectPrompt",
  },
  {
    labelKey: "draftMessage",
    promptKey: "draftMessagePrompt",
  },
]
