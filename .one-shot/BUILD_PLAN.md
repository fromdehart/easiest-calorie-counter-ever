# Build Plan: Easiest Calorie Counter Ever

## 1. Overview

A Telegram-native calorie tracking bot backed by a React landing page. Users sign up on the
landing page providing email, Telegram username, timezone, age, weight, and gender. OpenAI
calculates a personalized daily calorie target at registration. Once registered, users text the
bot what they ate; the bot estimates calories via OpenAI and replies with a running daily total.
Three scheduled nudges per day (10 AM, 1 PM, 8 PM local) prompt logging at meal times but are
silenced if the user already logged in that window.

**Architecture summary:**
- `convex/schema.ts` — add `users` and `meals` tables (leave existing tables untouched)
- `convex/users.ts` — registration action + internal queries/mutations for bot
- `convex/meals.ts` — internal mutations/queries for logging and daily totals
- `convex/bot.ts` — internalAction processing all Telegram messages + internalAction for nudges
- `convex/crons.ts` — hourly cron pointing to `bot.processNudges`
- `convex/http.ts` — add `ctx.runAction(internal.bot.handleMessage, ...)` after `storeIncoming`
- `src/App.tsx` — remove GateScreen gate entirely; always render `<Index />`
- `src/pages/Index.tsx` — full rewrite: Hero, Video placeholder, How It Works, Signup Form, ShareButtons

---

## 2. File Changes Required

### File: `convex/schema.ts`
- Action: MODIFY
- Purpose: Add `users` and `meals` tables
- Key changes:
  - Append `users` table: `chatId` (string), `telegramUsername` (optional string), `email` (string), `timezone` (string), `age` (number), `weightLbs` (number), `gender` (string), `calorieTarget` (number), `createdAt` (number). Indexes: `by_chatId` on `["chatId"]`, `by_telegramUsername` on `["telegramUsername"]`.
  - Append `meals` table: `chatId` (string), `description` (string), `calories` (number), `dayKey` (string), `createdAt` (number). Indexes: `by_chatId_and_dayKey` on `["chatId", "dayKey"]`, `by_chatId_and_createdAt` on `["chatId", "createdAt"]`.

### File: `convex/users.ts`
- Action: CREATE
- Purpose: User registration, allowlist lookup, calorie target management
- Key changes: Six exports — `registerUser` (action), `upsertUser` (internalMutation), `getUserByChatId` (internalQuery), `listAllUsers` (internalQuery), `setCalorieTarget` (internalMutation), `linkChatId` (internalMutation)

### File: `convex/meals.ts`
- Action: CREATE
- Purpose: Meal CRUD and daily calorie totals used exclusively by the bot
- Key changes: Five exports — `insertMeal` (internalMutation), `patchLastMeal` (internalMutation), `getDailyCalories` (internalQuery), `getMealsInWindow` (internalQuery), `getLastMeal` (internalQuery)

### File: `convex/bot.ts`
- Action: CREATE
- Purpose: Central Telegram message dispatcher and cron nudge sender
- Key changes: Two exports — `handleMessage` (internalAction), `processNudges` (internalAction). Must have `"use node"` directive.

### File: `convex/crons.ts`
- Action: CREATE
- Purpose: Register the hourly nudge job with the Convex scheduler
- Key changes: Single file exporting a `cronJobs` instance with one `hourly` entry at minute 0 pointing to `internal.bot.processNudges`

### File: `convex/http.ts`
- Action: MODIFY
- Purpose: Invoke bot handler for every inbound Telegram text message
- Key changes: Inside the `if (chatId)` block, after `ctx.runMutation(internal.telegram.storeIncoming, ...)`, add a conditional call to `ctx.runAction(internal.bot.handleMessage, { chatId, text: text ?? "", username: from?.username })` guarded by `text !== undefined && text.trim() !== ""`

### File: `src/App.tsx`
- Action: MODIFY
- Purpose: Remove the email-gate screen; the landing page is publicly accessible
- Key changes: Delete `useGateAccess` hook and its usage. Change the route `element` from the ternary to always render `<Index />`. Remove the `GateScreen` import. Keep `ConvexProvider`, `BrowserRouter`, `Routes`, `Route`, `VoteATron3000`, `VoteATronErrorBoundary`.

### File: `src/pages/Index.tsx`
- Action: MODIFY (full rewrite)
- Purpose: Replace template placeholder content with calorie counter landing page
- Key changes: All existing content replaced. New sections: Hero, Video Placeholder, How It Works, Signup Form, ShareButtons.

---

## 3. Convex Schema Changes

Append the following to the `defineSchema` call in `convex/schema.ts`:

```typescript
users: defineTable({
  chatId: v.string(),                       // numeric Telegram chat ID; initially set to telegramUsername at signup
  telegramUsername: v.optional(v.string()), // stored without "@"
  email: v.string(),
  timezone: v.string(),                     // IANA e.g. "America/New_York"
  age: v.number(),
  weightLbs: v.number(),
  gender: v.string(),                       // "male" | "female" | "other"
  calorieTarget: v.number(),                // integer; calculated by OpenAI at signup
  createdAt: v.number(),
})
  .index("by_chatId", ["chatId"])
  .index("by_telegramUsername", ["telegramUsername"]),

meals: defineTable({
  chatId: v.string(),
  description: v.string(),
  calories: v.number(),
  dayKey: v.string(),   // "YYYY-MM-DD" in user's local timezone
  createdAt: v.number(),
})
  .index("by_chatId_and_dayKey", ["chatId", "dayKey"])
  .index("by_chatId_and_createdAt", ["chatId", "createdAt"]),
```

---

## 4. Convex Functions

### users/registerUser (action)

- Purpose: Called from the React signup form. Calculates a calorie target via OpenAI then upserts the user record.
- Args:
  ```typescript
  {
    telegramUsername: v.string(),  // user input, without "@"
    email: v.string(),
    timezone: v.string(),
    age: v.number(),
    weightLbs: v.number(),
    gender: v.string(),
  }
  ```
- Returns: `{ calorieTarget: number }`
- Logic:
  1. Call `ctx.runAction(api.openai.generateText, { prompt: \`Age: ${age} years, weight: ${weightLbs} lbs, gender: ${gender}\`, systemPrompt: "You are a nutrition expert. Given a person's age, weight in pounds, and gender, calculate their daily maintenance calorie target for moderate weight loss (roughly 500 cal deficit). Reply with a single integer. No other text." })`
  2. Parse `result.text` as integer via `parseInt(result.text.trim(), 10)`. If `isNaN` or 0, fallback to `1800`.
  3. Call `ctx.runMutation(internal.users.upsertUser, { chatId: telegramUsername.replace(/^@/, ""), telegramUsername: telegramUsername.replace(/^@/, ""), email, timezone, age, weightLbs, gender, calorieTarget })`
  4. Return `{ calorieTarget }`

---

### users/upsertUser (internalMutation)

- Purpose: Insert or update a user record. On first signup, `chatId` equals the Telegram username. The real numeric chatId is linked later by the bot on first contact.
- Args:
  ```typescript
  {
    chatId: v.string(),
    telegramUsername: v.optional(v.string()),
    email: v.string(),
    timezone: v.string(),
    age: v.number(),
    weightLbs: v.number(),
    gender: v.string(),
    calorieTarget: v.number(),
  }
  ```
- Returns: `null`
- Logic:
  1. Query `users` via `by_chatId` index where `chatId` equals `args.chatId`. Take `.first()`.
  2. If not found and `telegramUsername` provided, query via `by_telegramUsername` index. Take `.first()`.
  3. If existing record found (either path): `ctx.db.patch(existing._id, { chatId: args.chatId, telegramUsername: args.telegramUsername, email: args.email, timezone: args.timezone, age: args.age, weightLbs: args.weightLbs, gender: args.gender, calorieTarget: args.calorieTarget })`
  4. If not found: `ctx.db.insert("users", { ...args, createdAt: Date.now() })`

---

### users/getUserByChatId (internalQuery)

- Purpose: Allowlist check used by `bot.handleMessage`. Falls back to username lookup so the bot can identify users before their numeric chatId has been linked.
- Args: `{ chatId: v.string(), username: v.optional(v.string()) }`
- Returns: User document (with `_id`) or `null`
- Logic:
  1. Query `by_chatId` index for `args.chatId`. Return document if found.
  2. If `args.username` provided, query `by_telegramUsername` index for `args.username`. Return document if found.
  3. Return `null`.

---

### users/listAllUsers (internalQuery)

- Purpose: Used by `bot.processNudges` to iterate all registered users.
- Args: none
- Returns: Array of full user documents
- Logic: `ctx.db.query("users").collect()`

---

### users/setCalorieTarget (internalMutation)

- Purpose: Update a user's daily calorie target from the `/settarget` bot command.
- Args: `{ chatId: v.string(), calorieTarget: v.number() }`
- Returns: `null`
- Logic:
  1. Query `by_chatId` index for `args.chatId`. Take `.first()`.
  2. If found: `ctx.db.patch(user._id, { calorieTarget: args.calorieTarget })`

---

### users/linkChatId (internalMutation)

- Purpose: Update a user's `chatId` to their real numeric Telegram ID on first bot contact.
- Args: `{ userId: v.id("users"), chatId: v.string() }`
- Returns: `null`
- Logic: `ctx.db.patch(args.userId, { chatId: args.chatId })`

---

### meals/insertMeal (internalMutation)

- Purpose: Log a new meal entry for a user.
- Args:
  ```typescript
  {
    chatId: v.string(),
    description: v.string(),
    calories: v.number(),
    dayKey: v.string(),
  }
  ```
- Returns: `null`
- Logic: `ctx.db.insert("meals", { chatId, description, calories, dayKey, createdAt: Date.now() })`

---

### meals/patchLastMeal (internalMutation)

- Purpose: Update the most recent meal's description and calorie count for `/edit`.
- Args: `{ chatId: v.string(), description: v.string(), calories: v.number() }`
- Returns: `boolean` — `true` if a meal was found and updated, `false` if none exist
- Logic:
  1. `const last = await ctx.db.query("meals").withIndex("by_chatId_and_createdAt", q => q.eq("chatId", args.chatId)).order("desc").first()`
  2. If `last` is null: return `false`
  3. `await ctx.db.patch(last._id, { description: args.description, calories: args.calories })`; return `true`

---

### meals/getDailyCalories (internalQuery)

- Purpose: Sum all calories logged for a chatId on a given dayKey.
- Args: `{ chatId: v.string(), dayKey: v.string() }`
- Returns: `number`
- Logic:
  1. `const rows = await ctx.db.query("meals").withIndex("by_chatId_and_dayKey", q => q.eq("chatId", args.chatId).eq("dayKey", args.dayKey)).collect()`
  2. `return rows.reduce((sum, m) => sum + m.calories, 0)`

---

### meals/getMealsInWindow (internalQuery)

- Purpose: Count meals in a time window for nudge-suppression logic.
- Args: `{ chatId: v.string(), windowStart: v.number(), windowEnd: v.number() }`
- Returns: `number` (count of meals in window)
- Logic:
  ```typescript
  const rows = await ctx.db
    .query("meals")
    .withIndex("by_chatId_and_createdAt", q =>
      q.eq("chatId", args.chatId)
       .gte("createdAt", args.windowStart)
       .lte("createdAt", args.windowEnd)
    )
    .collect();
  return rows.length;
  ```

---

### meals/getLastMeal (internalQuery)

- Purpose: Return the most recent meal for confirmation in `/edit` replies.
- Args: `{ chatId: v.string() }`
- Returns: Meal document or `null`
- Logic: `ctx.db.query("meals").withIndex("by_chatId_and_createdAt", q => q.eq("chatId", args.chatId)).order("desc").first()`

---

### bot/handleMessage (internalAction) — requires `"use node"`

- Purpose: Main Telegram message dispatcher. Performs allowlist check, parses commands, estimates calories, and sends replies.
- Args:
  ```typescript
  {
    chatId: v.string(),
    text: v.string(),
    username: v.optional(v.string()),
  }
  ```
- Returns: `null`
- Logic:
  1. **Allowlist check**: `const user = await ctx.runQuery(internal.users.getUserByChatId, { chatId, username })`
     - If `null`: send `"You're not signed up yet. Visit ${process.env.SITE_URL ?? "the signup page"} to create your account."` and return.
     - If found but `user.chatId !== chatId` (matched by username): call `ctx.runMutation(internal.users.linkChatId, { userId: user._id, chatId })`. Treat user as found with updated chatId going forward.
  2. **Parse text** (trimmed):
     - **`/settarget <n>`**: Extract integer after `/settarget `. Validate it is a positive number (else reply "Usage: /settarget <number>"). Call `ctx.runMutation(internal.users.setCalorieTarget, { chatId, calorieTarget: n })`. Reply: `"Got it! Daily target updated to ${n} cal."`. Return.
     - **`/edit <description>`**: Extract everything after `/edit `. If empty, reply `"Usage: /edit <what you actually had>"` and return. Estimate calories. Call `ctx.runMutation(internal.meals.patchLastMeal, { chatId, description, calories })`. If returns `false`, reply `"No meal found to edit. Log something first by just describing what you ate."` and return. Compute dayKey and get total. Reply: `"Updated! ${description} — ~${calories} cal.\n${buildTotalsLine(total, user.calorieTarget)}"`. Return.
     - **`/total`**: Compute dayKey. Get `total`. Reply: `buildTotalsLine(total, user.calorieTarget)`. Return.
     - **`/help`**: Reply: `"Commands:\n• Just type what you ate to log it\n• /edit <description> — fix your last logged meal\n• /total — see today's total\n• /settarget <calories> — update your daily goal\n• /help — show this message"`. Return.
     - **Anything else (free text)**: Estimate calories. Compute dayKey. Call `ctx.runMutation(internal.meals.insertMeal, { chatId, description: text, calories, dayKey })`. Get updated `total`. Reply: `"${text} — ~${calories} cal.\n${buildTotalsLine(total, user.calorieTarget)}"`.
  3. **Helper `estimateCalories(ctx, description)`** (module-level async function):
     - `const { text } = await ctx.runAction(api.openai.generateText, { prompt: description, systemPrompt: "You are a calorie estimator. Reply with a single integer — the estimated total calories for the described meal or snack. No other text." })`
     - `const n = parseInt(text.trim(), 10); return isNaN(n) ? 0 : n`
  4. **Helper `getDayKey(ms, timezone)`** (module-level function):
     - `return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms))`
     - `en-CA` locale formats dates as `YYYY-MM-DD` natively.
  5. **Helper `buildTotalsLine(total, target)`** (module-level function):
     - `const remaining = target - total`
     - `const suffix = remaining >= 0 ? \`${remaining} remaining\` : \`${Math.abs(remaining)} over budget\``
     - `return \`Today: ${total} / ${target} cal (${suffix})\``
  6. **Helper `sendReply(ctx, chatId, message)`** (module-level async function):
     - `await ctx.runAction(api.telegram.sendMessage, { chatId, message })`

---

### bot/processNudges (internalAction) — requires `"use node"`

- Purpose: Called by the hourly cron. Sends meal nudges to users who haven't logged in the current window.
- Args: none
- Returns: `null`
- Logic:
  1. `const now = Date.now()`
  2. `const users = await ctx.runQuery(internal.users.listAllUsers)`
  3. Process all users via `Promise.allSettled`:
     - `const localHour = getLocalHour(now, user.timezone)`
     - If `localHour` is not 10, 13, or 20: skip.
     - Compute `windowHours`: `10 → 10`, `13 → 3`, `20 → 7`
     - `const windowStart = now - windowHours * 3_600_000`; `const windowEnd = now`
     - `const count = await ctx.runQuery(internal.meals.getMealsInWindow, { chatId: user.chatId, windowStart, windowEnd })`
     - If `count === 0`: `await ctx.runAction(api.telegram.sendMessage, { chatId: user.chatId, message: nudgeMessages[localHour] })`
  4. **Nudge messages** (module-level constant):
     ```typescript
     const nudgeMessages: Record<number, string> = {
       10: "Hey! What did you have for breakfast? Just reply with what you ate 🍳",
       13: "Lunch time! What did you eat? Reply with a quick description.",
       20: "Evening check-in — what did you have for dinner or any snacks today? 🌙",
     };
     ```
  5. **Helper `getLocalHour(ms, tz)`** (module-level function):
     - `return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date(ms)), 10)`

---

### crons (default export)

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("nudge users", { minuteUTC: 0 }, internal.bot.processNudges);
export default crons;
```

---

## 5. React Components & Pages

### App (modified)
- File: `src/App.tsx`
- Remove: `useGateAccess` hook definition, `grantAccess` variable, `GateScreen` import, the ternary in the `Route element`.
- Change `Route` element from the ternary to always `element={<Index />}`.
- Keep all other imports and JSX unchanged.

---

### Index (full rewrite)
- File: `src/pages/Index.tsx`
- Imports: `useState`, `useEffect` from `react`; `useAction` from `convex/react`; `api` from `../../convex/_generated/api`; `ShareButtons` from `@/components/ShareButtons`
- State:
  ```typescript
  const [telegramUsername, setTelegramUsername] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [age, setAge] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [calorieTarget, setCalorieTarget] = useState<number | null>(null);
  ```
- Actions: `useAction(api.leads.submitLead)` and `useAction(api.users.registerUser)`
- `useEffect` on mount: `setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)`
- **`handleSubmit`**:
  1. Validate all six fields are non-empty; `parseInt(age) > 0`; `parseFloat(weightLbs) > 0`. If invalid, set `status = "error"` with message and return.
  2. `setStatus("loading")`
  3. `submitLead({ challengeId: import.meta.env.VITE_CHALLENGE_ID ?? "calorie-counter", email }).catch(() => {})` — fire and forget
  4. `const result = await registerUser({ telegramUsername: telegramUsername.replace(/^@/, ""), email, timezone, age: parseInt(age, 10), weightLbs: parseFloat(weightLbs), gender })`
  5. On success: `setCalorieTarget(result.calorieTarget); setStatus("success")`
  6. On error: `setStatus("error"); setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.")`

**Section layout (top to bottom):**

**1. Hero** — Full-width section with same gradient bg as template. Same coral top-right and sky bottom-left corner accent divs. H1: "The Easiest Calorie Counter Ever" (plain text first line, gradient text second line matching template style). Subtitle `<p>`: "Just text what you ate. We handle the math." CTA `<a href="#signup">` styled as coral button: "Get Started Free".

**2. Video Placeholder** — `<section>` with max-w-3xl centered. Contains:
```html
<div id="video-placeholder" class="aspect-video rounded-2xl bg-gray-100 border-2 border-gray-200 flex items-center justify-center">
  <p class="text-gray-400 text-lg font-medium">Video coming soon</p>
</div>
```

**3. How It Works** — `<section>` with `<h2>` "How It Works". Three-card grid (`grid-cols-1 md:grid-cols-3 gap-6`). Each card: `rounded-3xl border-2 border-gray-100 bg-white/80 backdrop-blur p-8`. Large step number in accent color, bold title, body text:
- Card 1: "1" / "Sign Up" / "Enter a few stats and get a personalized daily calorie target calculated just for you."
- Card 2: "2" / "Text the Bot" / "Message the bot what you ate, any time. No apps, no logging in — just send a message."
- Card 3: "3" / "Track Your Budget" / "Get an instant running total after every meal. Three daily nudges keep you on track."

**4. Signup Form** — `<section id="signup">`. White card (`rounded-3xl border-2 border-gray-100 bg-white/80 backdrop-blur p-8 max-w-2xl mx-auto`). `<h2>` "Get Your Calorie Target".

When `status !== "success"`: render the form. 2-col grid on md+ (`grid-cols-1 md:grid-cols-2 gap-4`). Fields:
- Email — `type="email"`, placeholder `"you@example.com"`
- Telegram Username — `type="text"`, placeholder `"@yourusername"`
- Timezone — `<select>` with 20 IANA options; if auto-detected value not in list, prepend it
- Age — `type="number"`, min `1`, max `120`, placeholder `"32"`
- Weight (lbs) — `type="number"`, min `50`, max `600`, step `0.1`, placeholder `"165"`
- Gender — `<select>`: `<option value="">Select gender</option>` then Male/Female/Other

Submit button: full-width (`col-span-full`), coral bg, text "Get My Calorie Target" / loading "Calculating…", disabled while loading.

`status === "error"`: red `<p>` below button showing `errorMessage`.

When `status === "success"`: replace form content with success card (green border): "You're all set! Your daily calorie target is **{calorieTarget} cal/day**. Find the bot on Telegram and send it your first meal to start tracking."

**5. ShareButtons** — render `<ShareButtons />` unchanged at the bottom.

**Timezone select options** (20 values in this order):
```
America/New_York, America/Chicago, America/Denver, America/Los_Angeles,
America/Anchorage, America/Honolulu, America/Phoenix,
Europe/London, Europe/Paris, Europe/Berlin, Europe/Rome, Europe/Moscow,
Asia/Dubai, Asia/Kolkata, Asia/Bangkok, Asia/Shanghai, Asia/Tokyo, Asia/Seoul,
Australia/Sydney, Pacific/Auckland
```
If the auto-detected timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone` is not in this list, prepend it as the first `<option>`.

---

## 6. Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_CONVEX_URL` | `.env` / Vercel | Convex deployment URL (already required by template) |
| `VITE_CHALLENGE_ID` | `.env` / Vercel | Slug for `submitLead` analytics (e.g. `"calorie-counter-v1"`) |
| `OPENAI_API_KEY` | Convex dashboard | OpenAI key for calorie estimation and target calculation |
| `TELEGRAM_BOT_TOKEN` | Convex dashboard | Telegram bot token for sending messages |
| `TELEGRAM_WEBHOOK_SECRET` | Convex dashboard | Optional webhook security header value |
| `RESEND_API_KEY` | Convex dashboard | Resend key (template requirement; not actively used by this app) |
| `SITE_URL` | Convex dashboard | Frontend URL shown in bot's "not signed up" reply (e.g. `"https://calorie-counter.vercel.app"`) |

No new `VITE_` variables beyond `VITE_CHALLENGE_ID` which the template already uses.

---

## 7. Build Sequence

Follow this order exactly to avoid missing generated types:

1. **Extend schema** — Modify `convex/schema.ts`: append `users` and `meals` table definitions with all fields and indexes each. Do not touch existing tables (`events`, `data`, `votes`, `leads`).

2. **Create `convex/users.ts`** — Implement all six functions in this order within the file: `upsertUser` (internalMutation), `getUserByChatId` (internalQuery), `listAllUsers` (internalQuery), `setCalorieTarget` (internalMutation), `linkChatId` (internalMutation), `registerUser` (action — last, since it calls internal functions). No `"use node"` directive needed.

3. **Create `convex/meals.ts`** — Implement all five functions: `insertMeal` (internalMutation), `patchLastMeal` (internalMutation), `getDailyCalories` (internalQuery), `getMealsInWindow` (internalQuery), `getLastMeal` (internalQuery). No `"use node"` directive needed.

4. **Create `convex/bot.ts`** — First line must be `"use node";`. Implement module-level helper functions first (`getDayKey`, `buildTotalsLine`, `getLocalHour`, `nudgeMessages` constant), then `estimateCalories` and `sendReply` (which need `ctx`), then `handleMessage` (internalAction), then `processNudges` (internalAction).

5. **Create `convex/crons.ts`** — Import `cronJobs` from `"convex/server"` and `internal` from `"./_generated/api"`. Register one hourly job at `minuteUTC: 0` pointing to `internal.bot.processNudges`. Export default.

6. **Modify `convex/http.ts`** — Inside the `if (chatId)` block, after the `storeIncoming` mutation call, add:
   ```typescript
   if (text !== undefined && text.trim() !== "") {
     await ctx.runAction(internal.bot.handleMessage, {
       chatId,
       text,
       username: from?.username,
     });
   }
   ```
   No other changes to existing routes, auth logic, or response handling.

7. **Modify `src/App.tsx`** — Remove `useGateAccess` hook function body and the two lines calling it. Remove the `GateScreen` import line. Change the `<Route>` element prop from `granted ? <Index /> : <GateScreen .../>` to simply `<Index />`. No other changes.

8. **Rewrite `src/pages/Index.tsx`** — Replace entire file with the landing page. Wire `useAction(api.users.registerUser)` and `useAction(api.leads.submitLead)`. Implement all five sections. Handle all three non-idle status states. Ensure the timezone `<select>` default value is set from the `useEffect`-populated state.

---

## 8. Test Criteria

- `npm run build` exits 0 — TypeScript compiles, no missing imports, no type errors
- `npx convex codegen` exits 0 — all schema and function types generate cleanly
- Schema: `users` table present with `by_chatId` and `by_telegramUsername` indexes; `meals` table present with `by_chatId_and_dayKey` and `by_chatId_and_createdAt` indexes; `events`, `data`, `votes`, `leads` tables unchanged
- `convex/bot.ts` first line is `"use node";`
- `convex/crons.ts` default-exports a `cronJobs` instance with exactly one registered job named `"nudge users"`
- `src/App.tsx` has no import of `GateScreen` and no reference to `useGateAccess`
- Landing page: form renders all 6 fields; submit button disabled during loading; success state shows calorie target number; timezone `<select>` defaults to auto-detected value on mount
- No references to old template content (AI test button, "One Shot. Make it count." heading, email test form) remain in `src/pages/Index.tsx`

---

## 9. Deployment Notes

**Convex environment variables** — Set in Convex dashboard → Settings → Environment Variables before `convex deploy`:
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (any random string, e.g. 32 hex chars)
- `SITE_URL` (your Vercel URL, e.g. `https://calorie-counter.vercel.app`)
- `RESEND_API_KEY` (required by template internals)

**Vercel environment variables** — Set in Vercel project settings:
- `VITE_CONVEX_URL` — copy from Convex dashboard (Deployment URL, format `https://xxx.convex.cloud`)
- `VITE_CHALLENGE_ID` — e.g. `calorie-counter-v1`

**Telegram webhook registration** — After deploying, register the webhook once via HTTP POST:
```
POST https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook
Content-Type: application/json
Body: {
  "url": "https://{convex-site-url}/telegram-webhook",
  "secret_token": "{TELEGRAM_WEBHOOK_SECRET}"
}
```
The Convex site URL is shown in the Convex dashboard under HTTP Actions (format: `https://xxx.convex.site`).

**Cron activation** — The hourly nudge cron activates automatically once `convex/crons.ts` is deployed. Verify in Convex dashboard → Cron Jobs that `"nudge users"` appears with a next-scheduled run time.

**Bot username in success message** — Update the success banner text in `src/pages/Index.tsx` to use your actual bot's Telegram @handle before deploying (it is a hardcoded string in the success state JSX).

**Telegram username → chatId linking** — At signup, users provide their Telegram @username. The bot maps this to their numeric chatId automatically on the first message they send. Until the user messages the bot once, the system cannot send them proactive nudges. This is by design and resolves with first bot interaction.
