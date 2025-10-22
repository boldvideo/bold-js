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

  // New: Internal ID
  internal_id?: string;

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
  background: string;
  font_body: string;
  font_header: string;
  foreground: string;
  logo_height: number;
  logo_url: string;
  logo_width: number;
  primary: string;
};

export type Portal = {
  color_scheme?: 'toggle' | 'light' | 'dark';
  display: PortalDisplay;
  layout: PortalLayout;
  navigation: PortalNavigation;
  theme: PortalTheme;
};

export type ThemeColors = {
  background: string;
  border: string;
  card: string;
  "card-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  foreground: string;
  input: string;
  muted: string;
  "muted-foreground": string;
  popover: string;
  "popover-foreground": string;
  primary: string;
  "primary-foreground": string;
  ring: string;
  secondary: string;
  "secondary-foreground": string;
};

export type ThemeConfig = {
  dark: ThemeColors;
  light: ThemeColors;
  radius: string;
};

export type AccountAI = {
  avatar_url: string;
  enabled: boolean;
  greeting: string;
  name: string;
};

export type Account = {
  ai: AccountAI;
  name: string;
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
