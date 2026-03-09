"use node";

import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";

// ── Module-level helpers ───────────────────────────────────────────────────

function getDayKey(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function buildTotalsLine(total: number, target: number): string {
  const remaining = target - total;
  const suffix =
    remaining >= 0
      ? `${remaining} remaining`
      : `${Math.abs(remaining)} over budget`;
  return `Today: ${total} / ${target} cal (${suffix})`;
}

function getLocalHour(ms: number, tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(new Date(ms)),
    10
  );
}

const nudgeMessages: Record<number, string> = {
  10: "Hey! What did you have for breakfast? Just reply with what you ate 🍳",
  13: "Lunch time! What did you eat? Reply with a quick description.",
  20: "Evening check-in — what did you have for dinner or any snacks today? 🌙",
};

type RunAction = (ref: unknown, args: unknown) => Promise<{ text: string; responseId: string }>;
type RunQuery = (ref: unknown, args: unknown) => Promise<unknown>;

async function classifyAndEstimate(
  ctx: { runAction: RunAction; runQuery: RunQuery },
  message: string,
  chatId: string
): Promise<{ intent: "new" | "edit"; calories: number }> {
  const lastMeal = await (ctx.runQuery as RunQuery)(internal.meals.getLastMeal, { chatId }) as
    | { description: string; calories: number }
    | null;

  const context = lastMeal
    ? `Last logged meal: "${lastMeal.description}" (~${lastMeal.calories} cal)\n`
    : "";

  const { text } = await (ctx.runAction as RunAction)(api.openai.generateText, {
    prompt: `${context}New message: "${message}"`,
    systemPrompt:
      'You are a calorie tracking assistant. Given a user\'s message and their last logged meal, decide: is this a NEW meal to add, or a CORRECTION/edit to the last meal? Also estimate calories for what was described.\n\nReply with JSON only, no other text: {"intent":"new","calories":500} or {"intent":"edit","calories":350}',
    model: "gpt-4o-mini",
  });

  try {
    const parsed = JSON.parse(text.trim()) as { intent: string; calories: number };
    const intent = parsed.intent === "edit" ? "edit" : "new";
    const calories = isNaN(parsed.calories) ? 0 : parsed.calories;
    return { intent, calories };
  } catch {
    // Fallback: treat as new meal, try to parse just a number
    const n = parseInt(text.trim(), 10);
    return { intent: "new", calories: isNaN(n) ? 0 : n };
  }
}

async function sendReply(
  ctx: { runAction: (ref: unknown, args: unknown) => Promise<unknown> },
  chatId: string,
  message: string
): Promise<void> {
  await ctx.runAction(api.telegram.sendMessage, { chatId, message });
}

// ── handleMessage ──────────────────────────────────────────────────────────

export const handleMessage = internalAction({
  args: {
    chatId: v.string(),
    text: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { chatId, text, username } = args;

    // 1. Allowlist check
    const user = await ctx.runQuery(internal.users.getUserByChatId, {
      chatId,
      username,
    });

    if (!user) {
      const siteUrl = process.env.SITE_URL ?? "the signup page";
      await sendReply(
        ctx,
        chatId,
        `You're not signed up yet. Visit ${siteUrl} to create your account.`
      );
      return null;
    }

    // Link real numeric chatId if we matched by username (first message = onboarding)
    if (user.chatId !== chatId) {
      await ctx.runMutation(internal.users.linkChatId, {
        userId: user._id,
        chatId,
      });
      await sendReply(
        ctx,
        chatId,
        `Welcome! 🎉 You're all set.\n\nYour daily calorie target: *${user.calorieTarget} cal/day*\n\nJust text me what you ate and I'll track it:\n_"2 eggs and toast"_\n_"chicken burrito"_\n\nOther commands:\n• /total — see today's running total\n• /edit <description> — fix your last entry\n• /settarget <calories> — update your daily goal`
      );
      return null;
    }

    const trimmed = text.trim();

    // 2. /settarget <n>
    if (trimmed.startsWith("/settarget")) {
      const rest = trimmed.slice("/settarget".length).trim();
      const n = parseInt(rest, 10);
      if (!rest || isNaN(n) || n <= 0) {
        await sendReply(ctx, chatId, "Usage: /settarget <number>");
        return null;
      }
      await ctx.runMutation(internal.users.setCalorieTarget, {
        chatId,
        calorieTarget: n,
      });
      await sendReply(ctx, chatId, `Got it! Daily target updated to ${n} cal.`);
      return null;
    }

    // 3. /edit <description>
    if (trimmed.startsWith("/edit")) {
      const description = trimmed.slice("/edit".length).trim();
      if (!description) {
        await sendReply(ctx, chatId, "Usage: /edit <what you actually had>");
        return null;
      }
      const { calories } = await classifyAndEstimate(ctx, description, chatId);
      const patched = await ctx.runMutation(internal.meals.patchLastMeal, {
        chatId,
        description,
        calories,
      });
      if (!patched) {
        await sendReply(
          ctx,
          chatId,
          "No meal found to edit. Log something first by just describing what you ate."
        );
        return null;
      }
      const dayKey = getDayKey(Date.now(), user.timezone);
      const total = await ctx.runQuery(internal.meals.getDailyCalories, {
        chatId,
        dayKey,
      });
      await sendReply(
        ctx,
        chatId,
        `Updated! ${description} — ~${calories} cal.\n${buildTotalsLine(total, user.calorieTarget)}`
      );
      return null;
    }

    // 4. /total
    if (trimmed === "/total") {
      const dayKey = getDayKey(Date.now(), user.timezone);
      const total = await ctx.runQuery(internal.meals.getDailyCalories, {
        chatId,
        dayKey,
      });
      await sendReply(ctx, chatId, buildTotalsLine(total, user.calorieTarget));
      return null;
    }

    // 5. /help
    if (trimmed === "/help") {
      await sendReply(
        ctx,
        chatId,
        "Commands:\n• Just type what you ate to log it\n• /edit <description> — fix your last logged meal\n• /total — see today's total\n• /settarget <calories> — update your daily goal\n• /help — show this message"
      );
      return null;
    }

    // 6. Free-text: classify intent and estimate calories in one LLM call
    const { intent, calories } = await classifyAndEstimate(ctx, trimmed, chatId);
    const dayKey = getDayKey(Date.now(), user.timezone);

    if (intent === "edit") {
      const patched = await ctx.runMutation(internal.meals.patchLastMeal, {
        chatId,
        description: trimmed,
        calories,
      });
      if (patched) {
        const total = await ctx.runQuery(internal.meals.getDailyCalories, { chatId, dayKey });
        await sendReply(
          ctx,
          chatId,
          `Got it, updated! ~${calories} cal.\n${buildTotalsLine(total, user.calorieTarget)}`
        );
        return null;
      }
      // Nothing to patch — fall through and log as new
    }

    await ctx.runMutation(internal.meals.insertMeal, {
      chatId,
      description: trimmed,
      calories,
      dayKey,
    });
    const total = await ctx.runQuery(internal.meals.getDailyCalories, { chatId, dayKey });
    await sendReply(
      ctx,
      chatId,
      `${trimmed} — ~${calories} cal.\n${buildTotalsLine(total, user.calorieTarget)}`
    );
    return null;
  },
});

// ── processNudges ──────────────────────────────────────────────────────────

export const processNudges = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.runQuery(internal.users.listAllUsers);

    await Promise.allSettled(
      users.map(async (user) => {
        const localHour = getLocalHour(now, user.timezone);
        if (localHour !== 10 && localHour !== 13 && localHour !== 20) return;

        const windowHoursMap: Record<number, number> = { 10: 10, 13: 3, 20: 7 };
        const windowHours = windowHoursMap[localHour];
        const windowStart = now - windowHours * 3_600_000;
        const windowEnd = now;

        const count = await ctx.runQuery(internal.meals.getMealsInWindow, {
          chatId: user.chatId,
          windowStart,
          windowEnd,
        });

        if (count === 0) {
          await ctx.runAction(api.telegram.sendMessage, {
            chatId: user.chatId,
            message: nudgeMessages[localHour],
          });
        }
      })
    );

    return null;
  },
});
