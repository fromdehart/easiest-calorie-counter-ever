import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    challengeId: v.string(),
    sessionId: v.string(),
    eventName: v.string(),
    metadata: v.any(),
    timestamp: v.number(),
  }).index("by_challengeId", ["challengeId"]),

  data: defineTable({
    challengeId: v.string(),
    key: v.string(),
    value: v.any(),
    createdAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_challenge_and_key", ["challengeId", "key"]),

  votes: defineTable({
    challengeId: v.string(),
    sessionId: v.string(),
    createdAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_challenge_and_session", ["challengeId", "sessionId"]),

  leads: defineTable({
    challengeId: v.string(),
    email: v.string(),
    createdAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_challenge_and_email", ["challengeId", "email"]),

  users: defineTable({
    chatId: v.string(),
    telegramUsername: v.optional(v.string()),
    email: v.string(),
    timezone: v.string(),
    age: v.number(),
    weightLbs: v.number(),
    gender: v.string(),
    calorieTarget: v.number(),
    createdAt: v.number(),
  })
    .index("by_chatId", ["chatId"])
    .index("by_telegramUsername", ["telegramUsername"]),

  meals: defineTable({
    chatId: v.string(),
    description: v.string(),
    calories: v.number(),
    dayKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_chatId_and_dayKey", ["chatId", "dayKey"])
    .index("by_chatId_and_createdAt", ["chatId", "createdAt"]),
});
