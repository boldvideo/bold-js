export type VideoAttachment = {
  id: string;
  title: string;
  file_url: string;
  file_size?: number;
  file_type?: string;
};

export type VideoDownloadUrls = {
  mp4?: string;
  audio?: string;
  legacy_mp4?: string;
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
  // Existing fields (kept as-is)
  captions: string;
  captions_label: string;
  captions_lang: string;
  description: string | null;
  duration: number;
  id: string;
  imported_from: string | null;
  legacy_video_url: string | null;
  playback_id: string;
  published_at: string;
  stream_url: string;
  teaser: string | null;
  thumbnail: string;
  title: string;
  type: string;

  // Fixed: meta_data should be an object, not array
  meta_data: VideoMetadata;

  // New: Chapters in WEBVTT format
  chapters?: string;

  // New: Attachments array
  attachments?: VideoAttachment[];

  // New: Call-to-action (can be null)
  cta?: any | null;

  // New: Download URLs object
  download_urls?: VideoDownloadUrls;

  // Internal ID
  internal_id: string;

  // New: Playback speed
  playback_speed?: number;

  // New: Subtitles object
  subtitles?: VideoSubtitles;

  // New: Tags array
  tags?: string[];

  // New: Transcript object (replaces transcription)
  transcript?: VideoTranscript;
};

export type Playlist = {
  description?: string;
  id: string;
  is_private: boolean;
  title: string;
  type: string;
  videos: Video[];
};

export type MenuItem = {
  icon: string;
  is_ext: boolean;
  label: string;
  url: string;
};

export type PortalDisplay = {
  show_chapters: boolean;
  show_transcripts: boolean;
};

export type AssistantConfig = {
  headline: string;
  subheadline: string;
  suggestions: string[];
};

export type PortalLayout = {
  assistant_config: AssistantConfig | null;
  show_playlists: boolean;
  type: string;
  videos_limit: number;
};

export type PortalNavigation = {
  show_ai_search: boolean;
  show_header: boolean;
  show_search: boolean;
};

export type PortalTheme = {
  // Raw color inputs
  background: string;
  foreground: string;
  primary: string;
  // Typography
  font_body: string;
  font_header: string;
  // Logo
  logo_url: string;
  logo_width: number;
  logo_height: number;
  // Layout & appearance
  header_size: string;
  layout: string;
  // Theme config (consolidated from theme_config)
  radius: string;
  color_scheme: "toggle" | "light" | "dark";
  light: ThemeColors;
  dark: ThemeColors;
};

export type Portal = {
  color_scheme?: 'toggle' | 'light' | 'dark';
  display: PortalDisplay;
  layout: PortalLayout;
  navigation: PortalNavigation;
  theme: PortalTheme;
};

export type ThemeColors = {
  // User-defined inputs (3)
  accent: string;
  background: string;
  foreground: string;
  // Derived by backend (6)
  accent_foreground: string;
  muted: string;
  muted_foreground: string;
  border: string;
  ring: string;
  surface: string;
};

export type ThemeConfig = {
  radius: string;
  color_scheme: "toggle" | "light" | "dark";
  light: ThemeColors;
  dark: ThemeColors;
};

export type AccountAI = {
  avatar_url: string;
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
  conversation_starters: string[];
};

export type PersonaDisabled = {
  enabled: false;
};

export type Persona = PersonaEnabled | PersonaDisabled;

export type Account = {
  ai: AccountAI;
  ai_search: AccountAISearch;
  name: string;
  persona: Persona;
  slug: string;
};

export type Settings = {
  // Existing top-level arrays
  featured_playlists: Playlist[];
  menu_items: MenuItem[];

  // Existing flat AI fields (kept for backward compatibility)
  ai_avatar: string;
  ai_name: string;
  ai_greeting?: string;
  has_ai: boolean;

  // New: Account object with nested AI config
  account: Account;

  // New: Top-level URL fields
  favicon_url?: string;
  logo_dark_url?: string;
  logo_url?: string;

  // Updated: meta_data with additional fields
  meta_data: {
    channel_name: string;
    description: string;
    image: string | null;
    no_seo: boolean;
    social_graph_image_url?: string;
    title: string;
    title_suffix: string;
  };

  // New: Portal object with all nested structures
  portal: Portal;

  // New: Theme configuration
  theme_config: ThemeConfig;

  // New: API version
  version: string;
};

// AI Streaming Types (Unified API)

/**
 * Source citation from AI responses
 */
export interface Source {
  video_id: string;
  title: string;
  timestamp: number;        // Start time in seconds
  timestamp_end?: number;   // End time in seconds
  text: string;
  playback_id?: string;
  speaker?: string;
}

/**
 * Token usage statistics
 */
export interface AIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * SSE event types for AI streaming responses
 */
export type AIEvent =
  | { type: "message_start"; id: string; model?: string }
  | { type: "sources"; sources: Source[] }
  | { type: "text_delta"; delta: string }
  | { type: "clarification"; questions: string[] }
  | { type: "message_complete"; content: string; sources: Source[]; usage: AIUsage }
  | { type: "error"; code: string; message: string; retryable: boolean; details?: Record<string, unknown> };

/**
 * Non-streaming AI response
 */
export interface AIResponse {
  id: string;
  content: string;
  sources: Source[];
  usage: AIUsage;
  model?: string;
}

/**
 * Options for bold.ai.ask() and bold.ai.coach()
 */
export interface AskOptions {
  prompt: string;
  stream?: boolean;          // Default: true
  conversationId?: string;
  collectionId?: string;
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
}

/**
 * Options for bold.ai.chat()
 *
 * conversationId: Pass to continue an existing conversation (multi-turn chat).
 * If omitted, a new conversation is created. The id is returned in the
 * message_start event - capture it to pass to subsequent requests.
 */
export interface ChatOptions {
  prompt: string;
  stream?: boolean;          // Default: true
  conversationId?: string;
}
