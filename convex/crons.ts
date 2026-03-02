import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("nudge users", { minuteUTC: 0 }, internal.bot.processNudges);
export default crons;
