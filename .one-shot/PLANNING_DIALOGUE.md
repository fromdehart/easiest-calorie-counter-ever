# Planning Dialogue — easiest-calorie-counter-ever

## Initial Idea (Sun Mar  1 10:53:49 PM EST 2026)
the easiest calorie counter ever.”
00:03
That sounds awesome!
“This is just a take on essentially Noom and other types of calorie, you know, essentially, if you eat at a calorie deficit, you will lose weight. So, it's a pain in the butt to track that stuff, but this whole system is just going to text you three times a day, maybe, and ask you what you just ate. And ideally, it's like a voice-to-text sort of situation. You don't overthink it. It's not about measuring. It's just literally like, you know, here's kind of what I ate, or it's like, here's a picture of what I ate. And so that is kind of it. And it just, it can help you understand where you are during the day, but it should be super, super simple and lightweight.”
00:59
I love that concept! Keeping it simple and low-effort definitely makes it more accessible. The idea of using text prompts or even voice-to-text to log meals is super convenient. Plus, it removes the intimidation factor of tracking every single detail.


## User Feedback (Sun Mar  1 11:04:38 PM EST 2026)
- We’ll use telegram instead of SMS for now. 
- We’ll use open AI since the API is already configured in the template
- user can message a meal or snack at any time
- calorie counts restart at midnight

## User Feedback (Sun Mar  1 11:07:13 PM EST 2026)
I think the bot should still push once onboarded

## User Feedback (Sun Mar  1 11:08:55 PM EST 2026)
this is a poc demo so we need to think about how people interact with it, thinking they go to the website and enter their telegram id to get added to the allowlist for the bot.

## User Feedback (Sun Mar  1 11:11:06 PM EST 2026)
/finalize

## User Feedback (Sun Mar  1 11:38:06 PM EST 2026)
/buildplan

## User Feedback (Mon Mar  2 01:19:44 AM EST 2026)
I don’t want the scheduled pushes to be out of scope for this project. 

If we don’t have meal editing, we should have the ability to edit it the last meal you entered. Then we can let you fix it. 

Don’t remove leads.ts, votes.ts or tracking.ts, those are all core to the template and understanding how many people viewed or resend.ts liked the project in general.

## User Feedback (Mon Mar  2 01:22:51 AM EST 2026)
/buildplan

## User Feedback (Mon Mar  2 01:29:03 AM EST 2026)
Schedule pushes should be at 10 AM 1 PM and 8 PM in the time zone the user is so we might need to ask the user for their time zone. 

Make sure that the landing page continues to include the email capture and a place for a video demo. I’ll manually add that later.

## User Feedback (Mon Mar  2 01:29:42 AM EST 2026)
If the user has already logged a meal, don’t send them a notification asking about that meal

## User Feedback (Mon Mar  2 01:35:07 AM EST 2026)
/buildplan

## User Feedback (Mon Mar  2 01:42:12 AM EST 2026)
/buildplan

## User Feedback (Mon Mar  2 01:45:42 AM EST 2026)
Actually I think we should have calorie targets per user…so I guess we need to know a little about them to figure that out for them. Just age, weight, gender and ask OpenAI to provide one maybe and they can edit it if they want?
