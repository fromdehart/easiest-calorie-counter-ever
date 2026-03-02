import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const insertMeal = internalMutation({
  args: {
    chatId: v.string(),
    description: v.string(),
    calories: v.number(),
    dayKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { chatId, description, calories, dayKey } = args;
    await ctx.db.insert("meals", {
      chatId,
      description,
      calories,
      dayKey,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const patchLastMeal = internalMutation({
  args: {
    chatId: v.string(),
    description: v.string(),
    calories: v.number(),
  },
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query("meals")
      .withIndex("by_chatId_and_createdAt", (q) =>
        q.eq("chatId", args.chatId)
      )
      .order("desc")
      .first();
    if (last === null) return false;
    await ctx.db.patch(last._id, {
      description: args.description,
      calories: args.calories,
    });
    return true;
  },
});

export const getDailyCalories = internalQuery({
  args: {
    chatId: v.string(),
    dayKey: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("meals")
      .withIndex("by_chatId_and_dayKey", (q) =>
        q.eq("chatId", args.chatId).eq("dayKey", args.dayKey)
      )
      .collect();
    return rows.reduce((sum, m) => sum + m.calories, 0);
  },
});

export const getMealsInWindow = internalQuery({
  args: {
    chatId: v.string(),
    windowStart: v.number(),
    windowEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("meals")
      .withIndex("by_chatId_and_createdAt", (q) =>
        q
          .eq("chatId", args.chatId)
          .gte("createdAt", args.windowStart)
          .lte("createdAt", args.windowEnd)
      )
      .collect();
    return rows.length;
  },
});

export const getLastMeal = internalQuery({
  args: {
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("meals")
      .withIndex("by_chatId_and_createdAt", (q) =>
        q.eq("chatId", args.chatId)
      )
      .order("desc")
      .first();
  },
});
