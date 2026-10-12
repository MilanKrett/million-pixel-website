/** Topics of the contact form and its limits (shared by the browser form and the server). */
export const CONTACT_TOPICS = ["general", "order", "payment", "legal", "authority", "press"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_LIMITS = { perClientHour: 5, maxMessage: 5000 };
