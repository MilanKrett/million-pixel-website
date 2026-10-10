const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|curl|wget|python-requests|httpclient|headless|lighthouse|pingdom|uptime/i;

/** True for crawlers, link previews and scripts; their visits are not counted. */
export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}
