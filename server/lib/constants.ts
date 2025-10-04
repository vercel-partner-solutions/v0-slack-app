export const PRIVACY_LABELS: Record<string, string> = {
  private: "Only people with access",
  team: "Everyone at your team (view only)",
  "team-edit": "Everyone at your team (can edit)",
  unlisted: "Anyone with the link",
  public: "Anyone on the web",
};

export const VALID_PRIVACY_LEVELS = [
  "private",
  "team",
  "team-edit",
  "unlisted",
  "public",
] as const;

export type PrivacyLevel = (typeof VALID_PRIVACY_LEVELS)[number];

export const isValidPrivacy = (value: string): value is PrivacyLevel => {
  return VALID_PRIVACY_LEVELS.includes(value as PrivacyLevel);
};
