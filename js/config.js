/**
 * Endcity Survival — edit monthly totals and supporter list. Amounts in USD.
 * (Legacy name SOLAR_CONFIG still works if you haven’t renamed yet.)
 */
window.ENDCITY_CONFIG = {
  /** Label for the bill you’re raising toward (e.g. the upcoming month after the one that’s paid). */
  fundraisingForLabel: "June 2026",

  monthlyBill: 60,

  /** Day of the month the bill is due (shown on the page). */
  billDueDay: 1,

  /**
   * Amount collected toward the upcoming bill (PayPal total for this fundraising period).
   */
  raisedTowardNextBill: 0,

  /** Credit from surplus rolled into this upcoming bill (optional). */
  rolloverFromPriorMonth: 0,

  /** Short status line, e.g. that the previous month is covered. */
  billingNote: "May is paid for.",

  /**
   * Supporters — Minecraft username and amount toward this fundraising period.
   * Heads use mc-heads.net (steve fallback if name invalid).
   */
  donations: [
    { username: "MkMonte", amount: 42 },
    { username: "Ladyangel3588", amount: 30 },
    { username: "9loreGetZooted", amount: 20 },
  ],

  /** PayPal hosted donate button */
  paypalUrl: "https://www.paypal.com/donate/?hosted_button_id=KQ75P59W6Y22E",

  /** Discord username for Apple Pay / crypto (DM) */
  discordUsername: "tcp.syn.ack",

  /** Public Discord invite — also update any <a data-discord-invite> hrefs if you change it. */
  discordInviteUrl: "https://discord.gg/Z5sZx9cjsC",

  /**
   * Optional: deployed Cloudflare Worker base URL for playercount API.
   * Example: "https://endcity-playercount.your-subdomain.workers.dev"
   */
  playercountApiBase: "https://endcity-playercount.admiralwhite334.workers.dev",

  /**
   * Economy shop snapshot JSON for the guide page. If empty, uses playercountApiBase + "/economy" (same Worker as
   * live status when KV is configured); if playercountApiBase is also empty, falls back to data/shop-price-changes.json.
   * Set an explicit URL (or "data/shop-price-changes.json") to override.
   */
  shopPriceChangesUrl: "",

  /**
   * Optional sitewide banner.
   * Set enabled: true to show it on every page.
   */
  siteNotice: {
    enabled: false,
    text: "Minecraft server is under maintenance. It should be back around 11:30 AM CST.",
  },
};
