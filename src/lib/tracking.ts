import { AxiosInstance } from "axios";
import { throttle } from "../util/throttle";
import type { TrackEngagementOptions } from "./types";

type ApiClient = AxiosInstance;

/**
 * Send explicit AI engagement without legacy throttling or browser globals.
 * Safe to fire and forget: transport failures are swallowed. Acceptance is not
 * a durable acknowledgement; the server validates attribution asynchronously.
 */
export function trackEngagement(client: ApiClient) {
  return async (options: TrackEngagementOptions): Promise<void> => {
    try {
      await client.post("event", {
        n: options.event,
        interaction_id: options.interactionId,
        playback_id: options.openId,
        vid: options.videoId,
        viewer: options.viewer,
        watched_seconds: options.watchedSeconds,
      });
    } catch {
      // Do not log Axios errors: they can contain authorization headers and viewer data.
      console.error("Bold SDK - Failed to track engagement");
    }
  };
}

type Options = {
  debug: boolean;
};

type EventData = {
  url: string;
  userId: string;
  domain: string;
  userAgent: string;
  deviceWidth: number;
  videoId?: string;
  title: string;
  videoDuration?: number;
  currentTime?: number;
};

function sendEvent(
  client: ApiClient,
  eventName: string,
  data: EventData,
  debug: boolean
) {
  const payload = {
    n: eventName,
    u: data.url,
    usr: data.userId,
    d: data.domain,
    ua: data.userAgent,
    w: data.deviceWidth,
    vid: data?.videoId || undefined,
    vt: data.title,
    vdur: data?.videoDuration || undefined,
    time: data?.currentTime || undefined,
  };

  if (debug) console.log(`Bold SDK - Logging event '${eventName}'`, payload);

  client.post("/event", payload);
}

const [throttledSendEvent] = throttle(sendEvent, 5000);

export function trackEvent(
  client: ApiClient,
  userId: string,
  options: Options
) {
  // TODO: verify event
  return (video: any, event: Event) => {
    const eventDetails = {
      ...basicInfos(),
      userId,
      videoId: video.id,
      title: video.title,
      videoDuration: video.duration,
      currentTime: (event.target as HTMLMediaElement)?.currentTime || 0,
    };
    // debounce fast hitting timeupdate event
    if (event.type == "timeupdate" || event.type == "time-update") {
      throttledSendEvent(
        client,
        getEventName(event),
        eventDetails,
        options.debug
      );
    } else {
      sendEvent(client, getEventName(event), eventDetails, options.debug);
    }
  };
}

export function trackPageView(
  client: ApiClient,
  userId: string,
  options: Options
) {
  return (title: string) => {
    const eventDetails = {
      ...basicInfos(),
      userId,
      title,
    };
    sendEvent(client, "page_view", eventDetails, options.debug);
  };
}

function getEventName(event: { type: string }) {
  switch (event.type) {
    case "pause":
      return "video_pause";
    case "play":
      return "video_resume";
    case "loadedmetadata":
    case "loaded-metadata":
      return "video_load";
    case "time-update":
    case "timeupdate":
      return "video_progress";
    default:
      return "unknown_event";
  }
}

function basicInfos() {
  return {
    url: location.href,
    domain: location.hostname,
    referrer: document.referrer || null,
    deviceWidth: window.innerWidth,
    userAgent: navigator.userAgent,
  };
}
