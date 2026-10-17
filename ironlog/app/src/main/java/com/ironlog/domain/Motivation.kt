package com.ironlog.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.random.Random

object Motivation {

    val shouts = listOf(
        "NO PAIN NO GAIN!", "LIGHT WEIGHT BABY!", "LET'S GO!", "YOU GOT THIS!", "ONE MORE REP!",
        "STRONGER EVERY DAY!", "BEAST MODE ON!", "NO EXCUSES!", "EARN IT!", "PUSH HARDER!",
        "GRIND NOW, SHINE LATER!", "PAIN IS TEMPORARY, PRIDE IS FOREVER!", "BE BETTER THAN LAST TIME!",
        "MAKE IT HAPPEN!", "FULL SEND!", "DON'T STOP NOW!", "TRAIN INSANE OR REMAIN THE SAME!",
        "THE IRON NEVER LIES!", "GAINS ARE WAITING!", "DIG DEEP!", "WAKE UP THE BEAST!",
        "NOTHING CHANGES IF NOTHING CHANGES!", "LOCK IN!", "GO HEAVY OR GO HOME!", "PROVE IT!",
        "CHASE THE PUMP!", "OUTWORK YESTERDAY!", "THE BAR IS WAITING!", "STAY HUNGRY!",
        "SHOW UP. LIFT. REPEAT.", "YOUR ONLY LIMIT IS YOU!", "NO SHORTCUTS!", "DISCIPLINE BEATS MOTIVATION!",
        "EMBRACE THE BURN!", "ONE REP AT A TIME!", "COMFORT ZONE = NO GAINS!", "BUILT, NOT BOUGHT!",
        "PUT IN THE WORK!", "THIS IS YOUR SET!", "GRIP IT AND RIP IT!", "SEND IT!",
        "LEAVE NOTHING IN THE TANK!", "UNSTOPPABLE!", "LIFT LIKE YOU MEAN IT!", "STRONG IS EARNED!",
        "MIND OVER MUSCLE!", "HARDER THAN LAST WEEK!", "KEEP CLIMBING!", "SWEAT NOW, FLEX LATER!",
        "NO DAYS WASTED!", "BIG LIFTS ONLY!", "YOU VS YOU!",
    )

    val quotes = listOf(
        "The only bad workout is the one you didn't do.",
        "You don't have to be extreme. Just consistent.",
        "Small progress is still progress.",
        "Your body can stand almost anything. It's your mind you have to convince.",
        "Strong is built one rep at a time.",
        "Motivation gets you started. Habit keeps you going.",
        "The weight doesn't care how you feel. Lift it anyway.",
        "Discipline is doing it when you don't feel like it.",
        "Every champion was once a beginner who refused to quit.",
        "Sore today, strong tomorrow.",
        "Don't wish for it. Train for it.",
        "You're one workout away from a good mood.",
        "Results happen over time, not overnight.",
        "Show up on the days you don't want to. Those count double.",
        "Fall in love with the process and the results will come.",
        "The pain you feel today is the strength you feel tomorrow.",
        "Excuses don't burn calories.",
        "Be stronger than your strongest excuse.",
        "If it doesn't challenge you, it doesn't change you.",
        "Progress, not perfection.",
        "Your future self is watching. Make them proud.",
        "Nobody regrets a workout.",
        "Train hard. Recover harder. Repeat.",
        "The hardest lift is getting off the sofa.",
        "Champions train. Losers complain.",
        "Don't count the days. Make the days count.",
        "Every rep is a vote for who you're becoming.",
        "Doubt kills more dreams than failure ever will.",
        "You didn't come this far to only come this far.",
        "Strength grows in the moments you think you can't go on.",
        "The best project you'll ever work on is you.",
        "Earn your rest day.",
        "A one-hour workout is 4% of your day. No excuses.",
        "Push yourself, because no one else is going to do it for you.",
        "Great things never came from comfort zones.",
        "It never gets easier. You just get stronger.",
        "Hustle for that muscle.",
        "Make yourself proud.",
        "Iron sharpens iron.",
        "Stop saying tomorrow.",
        "The gym is the one place where hard work always pays.",
        "Be the person who finishes the set.",
        "Wake up. Work out. Repeat.",
        "Consistency beats intensity, every single time.",
        "Today's warm-up is last year's max.",
        "Results are earned, never given.",
        "Lift heavy. Stay humble.",
        "Track it. Beat it. Repeat.",
        "Your only competition is who you were yesterday.",
        "A little progress each day adds up to big results.",
        "Strong mind. Strong body.",
        "Don't stop when you're tired. Stop when you're done.",
        "Pain is weakness leaving the body.",
        "Some people want it to happen. Some wish it would. Others make it happen.",
        "Muscles are torn in the gym, fed in the kitchen and built in bed.",
        "Good things come to those who sweat.",
        "Respect the grind.",
        "Don't limit your challenges. Challenge your limits.",
        "Falling down is part of it. Getting back up is lifting.",
        "Work hard in silence. Let your PRs make the noise.",
        "The comeback is always stronger than the setback.",
        "There's no elevator to strength. Take the stairs.",
        "Rome wasn't built in a day, but they worked on it every day.",
        "Believe you can and you're halfway there.",
        "Write it down. What gets tracked gets improved.",
        "You are stronger than you think.",
        "One more set. One more rep. One more day.",
    )

    val prLines = listOf(
        "NEW PR! 🏆 Absolute unit.",
        "PR ALERT 🚨 You just did something you've never done before.",
        "Record smashed! 💥 Remember this feeling.",
        "Stronger than ever. Literally. 📈",
        "History made. New personal best! 🔥",
        "That's a PR! The work is paying off. 💪",
        "New best! Past you could never. 😤",
        "Personal record unlocked 🔓",
        "WHO IS THIS?! New PR! 🦍",
        "You just raised your own bar. 🏋️",
        "Beast mode confirmed. New record! 👑",
        "Gains detected. PR logged. ✅",
    )

    val finishLines = listOf(
        "Workout done ✅ Rest, eat, grow.",
        "Session saved. Legend behaviour. 👑",
        "That's another one in the bank. 💰",
        "Done! Future you says thanks. 🙌",
        "Workout complete. You showed up — that's what counts. 💪",
        "Logged. Now go eat something with protein in it. 🍗",
        "Another brick in the wall. 🧱",
        "Finished strong. See you next session. 🔥",
        "Box ticked. Muscles thanking you later. 😮‍💨",
        "Mission complete. 🎯",
    )

    val reminderLines = listOf(
        "%s today 💪 Don't skip it!",
        "It's %s day. Let's get it! 🔥",
        "Your %s won't do itself. Let's go! 🏋️",
        "Reminder: %s is on the plan today.",
        "No skipping %s! Future you is watching. 👀",
        "%s is waiting. Grab your water and go. 💧",
        "Today = %s. Show up and the rest follows.",
        "Don't break the chain — %s today! ⛓️",
        "Time to train: %s. NO PAIN NO GAIN! 💥",
        "%s day. Beat last week's numbers. 📈",
        "Still time to smash %s today! ⏰",
        "Your muscles are asking for %s. 💪",
    )

    val restDayLines = listOf(
        "Rest day 😴 Muscles grow when you recover.",
        "No workout planned today. Eat well, sleep well.",
        "Recovery is part of the program. 🛌",
        "Rest day — stretch, hydrate, come back stronger. 💧",
        "Rest today. Smash it tomorrow. 🔋",
    )

    /** A quote that stays the same for a few hours, so the widget and home card agree. */
    fun quoteFor(day: LocalDate, slot: Int = 0): String =
        quotes[Math.floorMod(day.toEpochDay() * 7 + slot * 3, quotes.size.toLong()).toInt()]

    fun shout(random: Random = Random.Default): String = shouts.random(random)

    fun whenPhrase(lastDate: LocalDate?, today: LocalDate): String {
        if (lastDate == null) return "Last time"
        val days = ChronoUnit.DAYS.between(lastDate, today)
        return when {
            days <= 0L -> "Earlier today"
            days == 1L -> "Yesterday"
            days in 2..4 -> "On " + lastDate.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercase() }
            days in 5..10 -> "Last week"
            days in 11..20 -> "A couple of weeks ago"
            else -> "Last time"
        }
    }

    private val weightTemplates = listOf(
        "{when} you got {last}. TRY {target}! {shout}",
        "{last} — {whenLower}. Too easy now. {target} today! {shout}",
        "You owned {last}. Time to move up: {target}. {shout}",
        "{when}: {last}. Today: {target}. No excuses.",
        "Level up! {last} → {target}. {shout}",
        "Add the weight. {target} is waiting for you. {shout}",
        "Your muscles got used to {last}. Shock them with {target}!",
        "{target} today. Future you says thanks. {shout}",
        "{reps} reps last time? Then {target} it is. {shout}",
        "Comfort zone = {last}. Growth zone = {target}. GO!",
    )

    private val repTemplates = listOf(
        "{when} you got {last}. Beat it: {target}! {shout}",
        "{last} — {whenLower}. One more rep is progress. Go for {targetReps}! {shout}",
        "Same weight, one more rep: {target}. {shout}",
        "{when}: {last}. Squeeze out rep {targetReps} today. {shout}",
        "Every rep counts. {last} → {target}. {shout}",
        "Rep {targetReps} is where the growth is. {shout}",
        "Don't just match {last}. BEAT IT. {shout}",
        "{last} is the number to beat. {shout}",
    )

    data class Popup(val headline: String, val body: String)

    /** The pop-up shown when an exercise is opened: what you did last time and what to try now. */
    fun challenge(
        s: Suggestion,
        lastDate: LocalDate?,
        today: LocalDate,
        unit: WeightUnit,
        equipment: Equipment,
        random: Random = Random.Default,
    ): Popup {
        val whenP = whenPhrase(lastDate, today)
        val last = formatSet(s.last, unit, equipment) + "r"
        val target = when (s.kind) {
            SuggestionKind.MORE_WEIGHT -> formatWeight(s.targetWeightKg, unit).uppercase()
            SuggestionKind.MORE_REPS ->
                if (s.targetWeightKg == 0.0) "${s.targetReps} REPS"
                else formatWeight(s.targetWeightKg, unit).uppercase() + " × ${s.targetReps}"
        }
        val template = (if (s.kind == SuggestionKind.MORE_WEIGHT) weightTemplates else repTemplates).random(random)
        val body = template
            .replace("{when}", whenP)
            .replace("{whenLower}", whenP.replaceFirstChar { it.lowercase() })
            .replace("{last}", last)
            .replace("{target}", target)
            .replace("{targetReps}", s.targetReps.toString())
            .replace("{reps}", s.last.reps.toString())
            .replace("{shout}", shout(random))
        val headline = if (s.kind == SuggestionKind.MORE_WEIGHT) "TIME TO GO UP 📈" else "BEAT YOUR LAST 🔥"
        return Popup(headline, body)
    }

    fun reminder(workoutLabel: String, random: Random = Random.Default): String =
        reminderLines.random(random).format(workoutLabel)
}
