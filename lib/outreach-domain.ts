export type ReplySignal = "reply" | "bounce" | "out_of_office" | "unsubscribe" | "normal";
export type ConversationState = "active" | "awaiting_reply" | "replied" | "bounced" | "out_of_office" | "unsubscribed" | "stopped";

export function signalState(signal: ReplySignal): ConversationState {
  if (signal === "reply") return "replied";
  if (signal === "bounce") return "bounced";
  if (signal === "out_of_office") return "out_of_office";
  if (signal === "unsubscribe") return "unsubscribed";
  return "active";
}

export function shouldStopFutureWork(signal: ReplySignal): boolean {
  return signal === "bounce" || signal === "unsubscribe";
}

export function notificationForSignal(signal: ReplySignal, company: string) {
  if (signal === "reply") return { type: "reply", title: `Reply from ${company}`, body: "Open the thread to review the response.", deepLink: "/outreach" };
  if (signal === "bounce") return { type: "bounce", title: `Delivery issue at ${company}`, body: "Future work is paused for this recipient.", deepLink: "/queue" };
  if (signal === "unsubscribe") return { type: "unsubscribe", title: `${company} opted out`, body: "Future work is suppressed automatically.", deepLink: "/queue" };
  if (signal === "out_of_office") return { type: "out_of_office", title: `Out of office from ${company}`, body: "Review the thread before any follow-up.", deepLink: "/outreach" };
  return { type: "activity", title: `New activity at ${company}`, body: "Open the conversation to review.", deepLink: "/outreach" };
}
