# High-Level Plan — easiest-calorie-counter-ever

## Overview

A lightweight calorie-tracking bot that meets users where they are: Telegram. Users sign up on a landing page, provide basic profile info (age, weight, gender), and get a personalized daily calorie target calculated by OpenAI. They get added to the bot allowlist and can text what they ate at any time. The bot estimates calories via OpenAI and replies with a running daily total and remaining budget. Three scheduled nudges per day prompt logging at natural meal times, but are silenced if the user already logged something in that window.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite (existing template) |
| Backend / DB | Convex (existing template) |
| Messaging | Telegram Bot API |
| AI | OpenAI Responses API via existing `openai.ts` |
| Email | Resend via existing `resend.ts` |

---

## Database Schema

Extend `convex/schema.ts` — **add** two tables, leave all existing tables untouched.

### `users` table
```
chatId:           string   // Telegram chat ID (primary lookup key)
telegramUsername: string (optional)
email:            string   // collected at signup
timezone:         string   // IANA timezone string e.g. "America/New_York"
age:              number   // years
weightLbs:        number   // weight in pounds
gender:           string   // "male" | "female" | "other"
calorieTarget:    number   // daily calorie goal (OpenAI-calculated, user-editable)
createdAt:        number
```
Index: `by_chatId`

### `meals` table
```
chatId:       string   // foreign key → users.chatId
description:  string   // raw text the user sent
calories:     number   // estimated by OpenAI (integer)
dayKey:       string   // "YYYY-MM-DD" in user's local timezone
createdAt:    number   // Unix ms timestamp
```
Index: `by_chatId_and_dayKey`
Index: `by_chatId_and_createdAt` (for "last meal" lookup in /edit)

---

## New Convex Files

### `convex/users.ts`
- `registerUser` mutation — upsert by `chatId`; called from landing page signup form; triggers calorie target calculation
- `getUserByChatId` query — allowlist check in webhook handler
- `listAllUsers` internal query — used by cron to iterate users for nudges
- `updateCalorieTarget` mutation — allows user to override their target via `/settarget` command

### `convex/meals.ts`
- `logMeal` mutation — insert meal row
- `editLastMeal` mutation — find most recent meal for chatId, update description + calories
- `getDailyTotal` query — sum calories for chatId + dayKey
- `getMealsForDay` query — list meals for chatId + dayKey
- `getLastMeal` query — most recent meal for chatId (for /edit confirmation)

### `convex/bot.ts` (action, `"use node"`)
Central handler called by the webhook. Responsibilities:
1. Allowlist check — look up `chatId` in `users`; if not found, reply with signup URL and return
2. Parse command vs. free text:
   - `/edit <description>` → re-estimate calories, call `editLastMeal`, reply with updated total vs. target
   - `/total` → call `getDailyTotal`, reply with count and remaining budget
   - `/settarget <calories>` → call `updateCalorieTarget`, reply with confirmation
   - `/help` → reply with command list
   - Any other text → treat as meal description, estimate calories, call `logMeal`, reply with meal calories + day total vs. target
3. Calorie estimation — internal helper calling `generateText`:
   - System prompt: `"You are a calorie estimator. Reply with a single integer — the estimated total calories for the described meal or snack. No other text."`
   - Parse response as integer; fallback to 0 on parse failure
4. Calorie target calculation — internal helper calling `generateText`:
   - System prompt: `"You are a nutrition expert. Given a person's age, weight in pounds, and gender, calculate their daily maintenance calorie target for moderate weight loss (roughly 500 cal deficit). Reply with a single integer. No other text."`
   - Called during `registerUser` to populate `calorieTarget`
5. Reply format — always show `Today: {total} / {target} cal ({remaining} remaining)` so users see their budget
6. dayKey computation — convert `Date.now()` to user's IANA timezone, format as `"YYYY-MM-DD"`

### `convex/crons.ts`
Convex `cronJobs` definition. One job: **hourly**, every hour on the hour.

**Nudge logic per user:**
- Convert current UTC time to user's IANA timezone
- Check if current local hour matches a nudge window boundary: 10, 13, or 20
- Determine the corresponding window:
  - Hour 10 → window is midnight–10 AM (windowStart = today 00:00 local, windowEnd = today 10:00 local)
  - Hour 13 → window is 10 AM–1 PM
  - Hour 20 → window is 1 PM–8 PM
- Query meals logged in that window for the user
- If **no meals** in window → send Telegram nudge message
- If **at least one meal** logged → skip (user already checked in)

Nudge messages:
- Hour 10: "Hey! What did you have for breakfast? Just reply with what you ate 🍳"
- Hour 13: "Lunch time! What did you eat? Reply with a quick description."
- Hour 20: "Evening check-in — what did you have for dinner or any snacks today? 🌙"

---

## Updated Files

### `convex/http.ts`
Add handling in the webhook route:
- After `storeIncoming`, call `ctx.runAction(internal.bot.handleMessage, { chatId, text, from })`
- No other changes to existing routes or security logic

### `convex/schema.ts`
Add `users` and `meals` table definitions. Leave `events`, `data`, `votes`, `leads` untouched.

---

## Preserved Template Files (no changes)

| File | Purpose |
|---|---|
| `convex/leads.ts` | Email lead capture + dedup |
| `convex/votes.ts` | Vote/like tracking for showcase |
| `convex/tracking.ts` | General event tracking |
| `convex/resend.ts` | Transactional email via Resend |
| `convex/telegram.ts` | `sendMessage` action + `storeIncoming` mutation |
| `convex/telegramClient.ts` | Low-level Telegram HTTP client |
| `convex/openai.ts` | `generateText` action (reused for calorie estimation and target calculation) |

---

## Landing Page

The landing page (`src/`) includes all sections below. Email capture and video placeholder are **preserved** — the video embed is left as a placeholder div the user will fill manually.

### Sections

1. **Hero** — headline "The Easiest Calorie Counter Ever", one-line value prop, CTA scrolls to signup
2. **Video Demo** — `<div id="video-placeholder">` with a gray background and "Video coming soon" text; user will embed manually
3. **How It Works** — 3-step explainer:
   - Sign up with your Telegram ID and a few quick stats
   - Text the bot what you ate (anytime)
   - Track your daily total against your personalized calorie target
4. **Signup Form** — collects:
   - Email (feeds `leads` table via `submitLead`)
   - Telegram ID / username (no @ needed, we store what they type)
   - Timezone (dropdown, IANA strings, auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone` as default)
   - Age (number input, years)
   - Weight (number input, pounds)
   - Gender (select: Male / Female / Other)
   - On submit: calls `submitLead` for email analytics, then calls `registerUser` mutation which upserts `users` table and triggers OpenAI calorie target calculation
   - Confirmation message shows the calculated calorie target so users know what to expect
5. **ShareButtons** — existing template component, unchanged

---

## Bot User Flow

```
User signs up on website (email, telegram ID, timezone, age, weight, gender)
  → registerUser upsert in users table
  → OpenAI calculates personalized calorieTarget
  → submitLead in leads table (email analytics)
  → Confirmation shows "Your daily target: ~1,800 cal. You're all set!"

User messages bot
  → webhook fires → bot.handleMessage
  → allowlist check (users table lookup by chatId)
    → not found: "Sign up at [URL] to use this bot."
    → found: process message

  Free text ("had a burger and fries")
    → estimate calories (OpenAI)
    → logMeal to DB
    → reply: "Burger and fries — ~850 cal. Today: 1,340 / 2,000 cal (660 remaining 🔥)"

  /edit "actually it was a salad"
    → re-estimate calories
    → editLastMeal patches most recent meal
    → reply: "Updated! Salad — ~220 cal. Today: 710 / 2,000 cal (1,290 remaining ✅)"

  /total
    → getDailyTotal
    → reply: "Today: 1,340 / 2,000 cal (660 remaining)"

  /settarget 1600
    → updateCalorieTarget to 1600
    → reply: "Got it! Daily target updated to 1,600 cal."

  /help
    → reply with command list

Hourly cron
  → for each user, check if it's 10am/1pm/8pm in their timezone
  → if no meal logged in the current window → send nudge
  → if meal already logged → skip
```

---

## dayKey Pattern

All meal grouping and midnight-reset logic uses a `dayKey` string in the format `"YYYY-MM-DD"` computed in the user's IANA timezone. This means:
- A user in `"America/New_York"` logging at 11:30 PM ET gets dayKey `"2026-03-02"` even though it's already `2026-03-03` UTC
- The cron uses the same dayKey logic to determine window boundaries
- No explicit "reset" job needed — a new dayKey naturally starts at local midnight

---

## Nudge Window Logic (detail)

```
Windows per day (in user's local time):
  Window A: 00:00 → 10:00  →  nudge sent at 10:00 if no meals in window A
  Window B: 10:00 → 13:00  →  nudge sent at 13:00 if no meals in window B
  Window C: 13:00 → 20:00  →  nudge sent at 20:00 if no meals in window C

"Meals in window" = meals where createdAt is between windowStart (ms) and nudge time (ms)
```

---

## Environment Variables (no new ones required beyond existing)

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Existing — bot authentication |
| `TELEGRAM_WEBHOOK_SECRET` | Existing — webhook security |
| `OPENAI_API_KEY` | Existing — calorie estimation + target calculation |
| `RESEND_API_KEY` | Existing — email (leads confirmation optional) |
| `RECAPTCHA_SECRET_KEY` | Existing — optional spam protection on signup |

---

## Out of Scope (for this POC)

- Photo/image meal logging (described in original idea but deferred)
- Voice-to-text (deferred — Telegram voice notes not handled)
- Full meal history browsing UI
- Admin dashboard
