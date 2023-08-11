import { AxiosInstance } from "axios";
import { throttle } from "util/throttle";

type ApiClient = AxiosInstance;

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
      currentTime: (event.target as HTMLMediaElement).currentTime || 0,
    };
    // debounce fast hitting timeupdate event
    if (event.type == "timeupdate") {
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

function getEventName({ type }: { type: string }) {
  switch (type) {
    case "pause":
      return "video_pause";
    case "play":
      return "video_resume";
    case "loadedmetadata":
      return "video_load";
    case "timeupdate":
      return "video_progress";
    default:
      return "unknown_event";
  }
}

function basicInfos() {
  return {
    url: location.href,
    domain: "localhost:3000",
    referrer: document.referrer || null,
    deviceWidth: window.innerWidth,
    userAgent: navigator.userAgent,
  };
}
