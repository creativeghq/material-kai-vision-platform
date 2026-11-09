/** What a social post is. Read by generate-social-content and manage_social's zod schema. */
export const SOCIAL_POST_FORMATS = ['photo', 'carousel', 'reel', 'video', 'text', 'story'] as const;
export type SocialPostFormat = typeof SOCIAL_POST_FORMATS[number];
