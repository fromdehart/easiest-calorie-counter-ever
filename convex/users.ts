import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";

export const upsertUser = internalMutation({
  args: {
    chatId: v.string(),
    telegramUsername: v.optional(v.string()),
    email: v.string(),
    timezone: v.string(),
    age: v.number(),
    weightLbs: v.number(),
    gender: v.string(),
    calorieTarget: v.number(),
  },
  handler: async (ctx, args) => {
    let existing = await ctx.db
      .query("users")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();

    if (!existing && args.telegramUsername) {
      existing = await ctx.db
        .query("users")
        .withIndex("by_telegramUsername", (q) =>
          q.eq("telegramUsername", args.telegramUsername)
        )
        .first();
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        chatId: args.chatId,
        telegramUsername: args.telegramUsername,
        email: args.email,
        timezone: args.timezone,
        age: args.age,
        weightLbs: args.weightLbs,
        gender: args.gender,
        calorieTarget: args.calorieTarget,
      });
    } else {
      await ctx.db.insert("users", { ...args, createdAt: Date.now() });
    }
    return null;
  },
});

export const getUserByChatId = internalQuery({
  args: {
    chatId: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const byId = await ctx.db
      .query("users")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
    if (byId) return byId;

    if (args.username) {
      const byUsername = await ctx.db
        .query("users")
        .withIndex("by_telegramUsername", (q) =>
          q.eq("telegramUsername", args.username)
        )
        .first();
      if (byUsername) return byUsername;
    }

    return null;
  },
});

export const listAllUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("users").collect();
  },
});

export const setCalorieTarget = internalMutation({
  args: {
    chatId: v.string(),
    calorieTarget: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
    if (user) {
      await ctx.db.patch(user._id, { calorieTarget: args.calorieTarget });
    }
    return null;
  },
});

export const linkChatId = internalMutation({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { chatId: args.chatId });
    return null;
  },
});

export const registerUser = action({
  args: {
    telegramUsername: v.string(),
    email: v.string(),
    timezone: v.string(),
    age: v.number(),
    weightLbs: v.number(),
    gender: v.string(),
  },
  handler: async (ctx, args) => {
    const { telegramUsername, email, timezone, age, weightLbs, gender } = args;

    const result = await ctx.runAction(api.openai.generateText, {
      prompt: `Age: ${age} years, weight: ${weightLbs} lbs, gender: ${gender}`,
      systemPrompt:
        "You are a nutrition expert. Given a person's age, weight in pounds, and gender, calculate their daily maintenance calorie target for moderate weight loss (roughly 500 cal deficit). Reply with a single integer. No other text.",
    });

    let calorieTarget = parseInt(result.text.trim(), 10);
    if (isNaN(calorieTarget) || calorieTarget === 0) {
      calorieTarget = 1800;
    }

    const chatId = telegramUsername.replace(/^@/, "");
    await ctx.runMutation(internal.users.upsertUser, {
      chatId,
      telegramUsername: chatId,
      email,
      timezone,
      age,
      weightLbs,
      gender,
      calorieTarget,
    });

    return { calorieTarget };
  },
});
