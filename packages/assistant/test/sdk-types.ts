import type { AIEvent, ChatOptions, createClient } from "@boldvideo/bold-js";
import type { AssistantEvent } from "../src/core";
import type { AssistantBold } from "../src/server";

type Assert<T extends true> = T;
type Assignable<From, To> = [From] extends [To] ? true : false;
type SDK = ReturnType<typeof createClient>;

type EventsFromSDK = Assert<Assignable<AIEvent, AssistantEvent>>;
type EventsToSDK = Assert<Assignable<AssistantEvent, AIEvent>>;
type FullClient = Assert<Assignable<SDK, AssistantBold>>;
// Structural assignment alone permits extra request fields; check signal explicitly.
type ChatCancellation = Assert<Assignable<AbortSignal, ChatOptions["signal"]>>;
