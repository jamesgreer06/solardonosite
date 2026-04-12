/**
 * Endcity Survival — edit monthly totals and supporter list. Amounts in USD.
 * (Legacy name SOLAR_CONFIG still works if you haven’t renamed yet.)
 */
window.ENDCITY_CONFIG = {
  /** Label for the bill you’re raising toward (e.g. the upcoming month after the one that’s paid). */
  fundraisingForLabel: "May 2026",

  monthlyBill: 30,

  /** Day of the month the bill is due (shown on the page). */
  billDueDay: 1,

  /**
   * Amount collected toward the upcoming bill (PayPal total for this fundraising period).
   */
  raisedTowardNextBill: 0,

  /** Credit from surplus rolled into this upcoming bill (optional). */
  rolloverFromPriorMonth: 0,

  /** Short status line, e.g. that the previous month is covered. */
  billingNote: "April is paid for.",

  /**
   * Supporters — Minecraft username and amount toward this fundraising period.
   * Heads use mc-heads.net (steve fallback if name invalid).
   */
  donations: [{ username: "MkMonte", amount: 30 }],

  /** PayPal payment link */
  paypalUrl: "https://www.paypal.com/ncp/payment/AZRGUERUTKAHG",

  /** Discord username for crypto donations (DM) */
  discordUsername: "tcp.syn.ack",

  /** Public Discord invite — also update any <a data-discord-invite> hrefs if you change it. */
  discordInviteUrl: "https://discord.gg/Z5sZx9cjsC",
};
