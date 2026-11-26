import type { AIEvent, ChatOptions, createClient } from "@boldvideo/bold-js";
import type { AssistantEvent } from "../src/core";
import type { AssistantBold } from "../src/server";

type Assert<T extends true> = T;
type Assignable<From, To> = [From] extends [To] ? true : false;
type SDK = ReturnType<typeof createClient>;

type EventsFromSDK = Assert<Assignable<AIEvent, AssistantEvent>>;
type EventsToSDK = Assert<Assignable<AssistantEvent, AIEvent>>;
type ExistingMethods = Assert<Assignable<SDK["ai"], Pick<AssistantBold["ai"], "chat" | "getConversation">>>;

// Temporary, explicit incompatibilities with the current workspace SDK.
// Remove these expected errors when listing and cancellation land. Their
// becoming unused fails lint, forcing the complete contract to be checked.
// @ts-expect-error The current SDK has no listConversations method.
type FullClient = Assert<Assignable<SDK, AssistantBold>>;
// @ts-expect-error Extra argument properties alone cannot prove cancellation support.
type ChatCancellation = Assert<Assignable<"signal", keyof ChatOptions>>;
