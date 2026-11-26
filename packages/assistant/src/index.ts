"use client";

export { AssistantProvider, useAssistant } from "./react/provider";
export type { AssistantProviderProps, AssistantSettings } from "./react/provider";
export { AssistantDock, AssistantPanel, AssistantAnswer, preloadAssistantPanel } from "./react/dock";
export type { AssistantDockProps } from "./react/dock";
export type { AssistantPanelProps } from "./react/panel";
export { useAssistantVideo, AssistantVideoPending, assistantChapterAt } from "./react/video";
export type { AssistantVideoInput, AssistantVideoOptions, AssistantPlayerHandle } from "./react/video";
export { useAssistantSources, assistantSafeHref } from "./react/sources";
export type { AssistantNavigation } from "./react/sources";
export { defaultAssistantLabels, formatAssistantTime } from "./react/labels";
export type { AssistantLabels } from "./react/labels";
export { remarkAssistantCitations } from "./react/markdown";
