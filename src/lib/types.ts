export type Video = {
  captions: string;
  captions_label: string;
  captions_lang: string;
  description: string | null;
  duration: number;
  id: string;
  imported_from: string | null;
  legacy_video_url: null | null;
  meta_data: [];
  playback_id: string;
  published_at: string;
  stream_url: string;
  teaser: string | null;
  thumbnail: string;
  title: string;
  transcription: string;
  type: string;
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

export type Settings = {
  featured_playlists: Playlist[];
  menu_items: MenuItem[];
  ai_avatar: string;
  ai_name: string;
  has_ai: boolean;
  meta_data: {
    channel_name: string;
    description: string;
    image: string;
    no_seo: boolean;
    title: string;
    title_suffix: string;
  };
};
