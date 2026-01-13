export type VideoAttachment = {
  id: string;
  title: string;
  fileUrl: string;
  fileSize?: number;
  fileType?: string;
};

export type VideoDownloadUrls = {
  mp4?: string;
  audio?: string;
  legacyMp4?: string;
};

export type VideoSubtitles = {
  label: string;
  url: string;
  engine?: string;
  language: string;
};

export type VideoTranscript = {
  text: string;
  json: any;
};

export type VideoMetadata = {
  description: string;
  title: string;
  image: string | null;
};

export type Video = {
  captions: string;
  captionsLabel: string;
  captionsLang: string;
  description: string | null;
  duration: number;
  id: string;
  slug?: string;
  importedFrom: string | null;
  legacyVideoUrl: string | null;
  playbackId: string;
  publishedAt: string;
  streamUrl: string;
  teaser: string | null;
  thumbnail: string;
  title: string;
  type: string;

  metaData: VideoMetadata;

  chapters?: string;

  attachments?: VideoAttachment[];

  cta?: any | null;

  downloadUrls?: VideoDownloadUrls;

  internalId: string;

  playbackSpeed?: number;

  subtitles?: VideoSubtitles;

  tags?: string[];

  transcript?: VideoTranscript;
};

export type Playlist = {
  description?: string;
  id: string;
  isPrivate: boolean;
  title: string;
  type: string;
  videos: Video[];
};

export type MenuItem = {
  icon: string;
  isExt: boolean;
  label: string;
  url: string;
};

export type PortalDisplay = {
  showChapters: boolean;
  showTranscripts: boolean;
};

export type AssistantConfig = {
  headline: string;
  subheadline: string;
  suggestions: string[];
};

export type PortalLayout = {
  assistantConfig: AssistantConfig | null;
  showPlaylists: boolean;
  type: string;
  videosLimit: number;
};

export type PortalNavigation = {
  showAiSearch: boolean;
  showHeader: boolean;
  showSearch: boolean;
};

export type PortalTheme = {
  background: string;
  foreground: string;
  primary: string;
  fontBody: string;
  fontHeader: string;
  logoUrl: string;
  logoDarkUrl: string;
  logoWidth: number;
  logoHeight: number;
  headerSize: string;
  layout: string;
  radius: string;
  colorScheme: "toggle" | "light" | "dark";
  light: ThemeColors;
  dark: ThemeColors;
  cssOverrides: string | null;
};

export type Portal = {
  colorScheme?: 'toggle' | 'light' | 'dark';
  display: PortalDisplay;
  layout: PortalLayout;
  navigation: PortalNavigation;
  theme: PortalTheme;
};

export type ThemeColors = {
  accent: string;
  background: string;
  foreground: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  ring: string;
  surface: string;
};

export type ThemeConfig = {
  radius: string;
  colorScheme: "toggle" | "light" | "dark";
  light: ThemeColors;
  dark: ThemeColors;
};

export type AccountAI = {
  avatarUrl: string;
  enabled: boolean;
  greeting: string;
  name: string;
};

export type AccountAISearch = {
  enabled: boolean;
};

export type PersonaEnabled = {
  enabled: true;
  name: string;
  greeting: string;
  conversationStarters: string[];
};

export type PersonaDisabled = {
  enabled: false;
};

export type Persona = PersonaEnabled | PersonaDisabled;

export type Account = {
  ai: AccountAI;
  aiSearch: AccountAISearch;
  name: string;
  persona: Persona;
  slug: string;
};

export type Settings = {
  featuredPlaylists: Playlist[];
  menuItems: MenuItem[];

  aiAvatar: string;
  aiName: string;
  aiGreeting?: string;
  hasAi: boolean;

  account: Account;

  faviconUrl?: string;
  logoDarkUrl?: string;
  logoUrl?: string;

  metaData: {
    channelName: string;
    description: string;
    image: string | null;
    noSeo: boolean;
    socialGraphImageUrl?: string;
    title: string;
    titleSuffix: string;
  };

  portal: Portal;

  themeConfig: ThemeConfig;

  version: string;
};

// AI Streaming Types (Unified API)

/**
 * Video segment from AI responses (used for both sources and citations)
 */
export interface Segment {
  id: string;              // Segment identifier
  videoId: string;         // Bold video ID
  title: string;           // Video title
  text: string;            // Transcript excerpt
  timestamp: number;       // Start time in seconds
  timestampEnd: number;    // End time in seconds
  playbackId: string;      // Mux playback ID for embedding
  speaker?: string;        // Speaker name if detected
  cited?: boolean;         // Whether this segment is cited in the answer text
}

/**
 * @deprecated Use Segment instead
 */
export type Source = Segment;

/**
 * Alias for Segment - represents chunks the LLM actually cited
 */
export type Citation = Segment;

/**
 * Token usage statistics
 */
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * SSE event types for AI streaming responses
 */
export type AIEvent =
  | { type: "message_start"; conversationId?: string; videoId?: string }
  | { type: "sources"; sources: Segment[] }
  | { type: "text_delta"; delta: string }
  | { type: "recommendations"; recommendations: Recommendation[] }
  | { type: "message_complete"; conversationId?: string; content: string; citations: Segment[]; responseType: "answer" | "clarification"; usage?: AIUsage; context?: AIContextMessage[]; recommendations?: Recommendation[]; guidance?: string }
  | { type: "error"; code: string; message: string; retryable: boolean };

/**
 * Non-streaming AI response for /ai/chat, /ai/videos/:id/chat, and /ai/search
 */
export interface AIResponse {
  conversationId?: string;       // Present for /chat endpoints (primary identifier)
  videoId?: string;              // Present for /videos/:id/chat
  /** @deprecated Use conversationId instead. Will be removed in v2. */
  id?: string;                   // Deprecated alias for conversationId
  content: string;
  sources: Source[];
  usage: AIUsage;
  model?: string;
  context?: AIContextMessage[];  // Present for /search, absent for /chat
}

/**
 * Options for bold.ai.chat()
 * 
 * If `videoId` is provided, scopes chat to that video (hits /ai/videos/:id/chat).
 * Otherwise, searches your entire library (hits /ai/chat).
 */
export interface ChatOptions {
  prompt: string;
  stream?: boolean;          // Default: true
  conversationId?: string;   // Pass to continue existing conversation
  collectionId?: string;
  tags?: string[];           // Filter by tags
  
  /**
   * If provided, scope chat to a specific video instead of the whole library.
   */
  videoId?: string;
  
  /**
   * Current playback position in seconds. Only used when videoId is set.
   * Helps AI understand what the viewer just watched.
   */
  currentTime?: number;
}

/**
 * @deprecated Use ChatOptions instead
 */
export type AskOptions = ChatOptions;

/**
 * Conversation message for AI context
 */
export interface AIContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Options for bold.ai.search()
 */
export interface SearchOptions {
  prompt: string;
  stream?: boolean;          // Default: true
  limit?: number;
  collectionId?: string;
  videoId?: string;
  tags?: string[];           // Filter by tags
  context?: AIContextMessage[];
}

/**
 * ChatOptions with videoId required - for video-scoped chat.
 * @deprecated Use ChatOptions with videoId instead
 */
export type VideoChatOptions = Omit<ChatOptions, 'videoId' | 'collectionId' | 'tags'> & { videoId?: never };

/**
 * A recommended video with relevance score
 */
export interface RecommendationVideo {
  videoId: string;
  title: string;
  playbackId: string;
  relevance: number;
  reason: string;
}

/**
 * A topic recommendation with its videos
 */
export interface Recommendation {
  topic: string;
  videos: RecommendationVideo[];
}

/**
 * Options for bold.ai.recommendations()
 */
export interface RecommendationsOptions {
  topics: string[];               // Topics to find content for (required, max: 10)
  stream?: boolean;               // Default: true
  limit?: number;                 // Max videos per topic (default: 5, max: 20)
  collectionId?: string;
  tags?: string[];
  includeGuidance?: boolean;      // Default: true (include AI learning path narrative)
  context?: AIContextMessage[];   // Previous conversation turns for follow-ups
}

/**
 * @deprecated Use RecommendationsOptions instead
 */
export type RecommendOptions = RecommendationsOptions;

/**
 * Non-streaming response for recommendations endpoint
 */
export interface RecommendationsResponse {
  recommendations: Recommendation[];
  guidance: string;
  sources: Source[];
  context?: AIContextMessage[];
  usage?: AIUsage;
}

/**
 * @deprecated Use RecommendationsResponse instead
 */
export type RecommendResponse = RecommendationsResponse;
