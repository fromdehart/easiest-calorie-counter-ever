import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ShareButtons } from "@/components/ShareButtons";

const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Honolulu",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function Index() {
  const [telegramUsername, setTelegramUsername] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [age, setAge] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [calorieTarget, setCalorieTarget] = useState<number | null>(null);

  const submitLead = useAction(api.leads.submitLead);
  const registerUser = useAction(api.users.registerUser);

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const timezoneOptions = (() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && !TIMEZONE_OPTIONS.includes(detected)) {
      return [detected, ...TIMEZONE_OPTIONS];
    }
    return TIMEZONE_OPTIONS;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !telegramUsername.trim() ||
      !email.trim() ||
      !timezone.trim() ||
      !age.trim() ||
      !weightLbs.trim() ||
      !gender.trim()
    ) {
      setStatus("error");
      setErrorMessage("Please fill in all fields.");
      return;
    }
    if (parseInt(age, 10) <= 0 || isNaN(parseInt(age, 10))) {
      setStatus("error");
      setErrorMessage("Please enter a valid age.");
      return;
    }
    if (parseFloat(weightLbs) <= 0 || isNaN(parseFloat(weightLbs))) {
      setStatus("error");
      setErrorMessage("Please enter a valid weight.");
      return;
    }

    setStatus("loading");

    submitLead({
      challengeId: import.meta.env.VITE_CHALLENGE_ID ?? "calorie-counter",
      email,
    }).catch(() => {});

    try {
      const result = await registerUser({
        telegramUsername: telegramUsername.replace(/^@/, ""),
        email,
        timezone,
        age: parseInt(age, 10),
        weightLbs: parseFloat(weightLbs),
        gender,
      });
      setCalorieTarget(result.calorieTarget);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--background) 0%, rgba(0,194,255,0.07) 40%, rgba(255,90,95,0.06) 70%, var(--background) 100%)",
      }}
    >
      {/* Corner accents */}
      <div
        className="absolute top-0 right-0 w-24 sm:w-40 h-40 sm:h-64 rounded-bl-[3rem] opacity-80"
        style={{ backgroundColor: "var(--accent-coral)" }}
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-0 w-32 sm:w-48 h-24 sm:h-40 rounded-tr-[3rem] opacity-70"
        style={{ backgroundColor: "var(--accent-sky)" }}
        aria-hidden
      />

      <main className="relative z-10 max-w-4xl mx-auto px-6 pt-10 sm:pt-14 pb-20">
        {/* 1. Hero */}
        <section className="text-center mb-6">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
            <span className="block">The Easiest Calorie</span>
            <span
              className="block mt-2 bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(135deg, var(--accent-coral), var(--accent-sky))",
              }}
            >
              Counter Ever
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-6 leading-relaxed">
            Just text what you ate. We handle the math.
          </p>
          <a
            href="#signup"
            className="inline-block px-8 py-4 text-lg font-semibold rounded-2xl text-white shadow-lg hover:opacity-95 transition-opacity"
            style={{ backgroundColor: "var(--accent-coral)" }}
          >
            Get Started Free
          </a>
        </section>

        {/* 2. Video Placeholder */}
        <section className="max-w-3xl mx-auto mb-20">
          <div
            id="video-placeholder"
            className="aspect-video rounded-2xl bg-gray-100 border-2 border-gray-200 flex items-center justify-center"
          >
            <p className="text-gray-400 text-lg font-medium">Video coming soon</p>
          </div>
        </section>

        {/* 3. How It Works */}
        <section className="mb-20">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "Sign Up",
                body: "Enter a few stats and get a personalized daily calorie target calculated just for you.",
              },
              {
                step: "2",
                title: "Text the Bot",
                body: "Message the bot what you ate, any time. No apps, no logging in — just send a message.",
              },
              {
                step: "3",
                title: "Track Your Budget",
                body: "Get an instant running total after every meal. Three daily nudges keep you on track.",
              },
            ].map(({ step, title, body }) => (
              <div
                key={step}
                className="rounded-3xl border-2 border-gray-100 bg-white/80 backdrop-blur p-8"
              >
                <div
                  className="text-5xl font-extrabold mb-4 bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, var(--accent-coral), var(--accent-sky))",
                  }}
                >
                  {step}
                </div>
                <h3 className="text-xl font-bold mb-2">{title}</h3>
                <p className="text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Signup Form */}
        <section id="signup" className="mb-20">
          <div className="rounded-3xl border-2 border-gray-100 bg-white/80 backdrop-blur p-8 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-6 text-center">Get Your Calorie Target</h2>

            {status !== "success" ? (
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Email */}
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent-sky)] focus:border-transparent outline-none"
                      disabled={status === "loading"}
                    />
                  </label>

                  {/* Telegram Username */}
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">Telegram Username</span>
                    <input
                      type="text"
                      value={telegramUsername}
                      onChange={(e) => setTelegramUsername(e.target.value)}
                      placeholder="@yourusername"
                      className="rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent-sky)] focus:border-transparent outline-none"
                      disabled={status === "loading"}
                    />
                  </label>

                  {/* Timezone */}
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">Timezone</span>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent-sky)] focus:border-transparent outline-none bg-white"
                      disabled={status === "loading"}
                    >
                      <option value="">Select timezone</option>
                      {timezoneOptions.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Age */}
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">Age</span>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="32"
                      min={1}
                      max={120}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent-sky)] focus:border-transparent outline-none"
                      disabled={status === "loading"}
                    />
                  </label>

                  {/* Weight */}
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">Weight (lbs)</span>
                    <input
                      type="number"
                      value={weightLbs}
                      onChange={(e) => setWeightLbs(e.target.value)}
                      placeholder="165"
                      min={50}
                      max={600}
                      step={0.1}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent-sky)] focus:border-transparent outline-none"
                      disabled={status === "loading"}
                    />
                  </label>

                  {/* Gender */}
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">Gender</span>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent-sky)] focus:border-transparent outline-none bg-white"
                      disabled={status === "loading"}
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="col-span-full mt-2 w-full px-8 py-4 text-lg font-semibold rounded-2xl text-white shadow-lg hover:opacity-95 disabled:opacity-60 transition-opacity"
                    style={{ backgroundColor: "var(--accent-coral)" }}
                  >
                    {status === "loading" ? "Calculating…" : "Get My Calorie Target"}
                  </button>
                </div>

                {status === "error" && (
                  <p className="mt-4 text-red-600 text-sm">{errorMessage}</p>
                )}
              </form>
            ) : (
              <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-8 text-center">
                <p className="text-xl text-gray-800 leading-relaxed">
                  You're all set! Your daily calorie target is{" "}
                  <strong className="text-2xl">{calorieTarget} cal/day</strong>. Find the bot on
                  Telegram and send it your first meal to start tracking.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 5. Share Buttons */}
        <ShareButtons />
      </main>
    </div>
  );
}
