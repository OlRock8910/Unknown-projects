package com.ironlog.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.ironlog.domain.Profile
import com.ironlog.domain.Sex
import com.ironlog.domain.WeightUnit
import com.ironlog.domain.formatNumber
import com.ironlog.domain.kgTo
import com.ironlog.domain.label
import com.ironlog.domain.toKg
import com.ironlog.ui.AppState
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.Chip
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.components.WheelPicker
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import java.time.LocalDate
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale

/** Holds the editable profile fields as text so half-typed values survive. */
class ProfileForm(profile: Profile, unit: WeightUnit) {
    var unit by mutableStateOf(unit)
    var name by mutableStateOf(profile.name)
    var birthday by mutableStateOf(profile.birthday?.let { runCatching { LocalDate.parse(it) }.getOrNull() })
    var sex by mutableStateOf(profile.sex)
    var height by mutableStateOf(profile.heightCm?.let { formatNumber(it) } ?: "")
    var weight by mutableStateOf(profile.bodyweightKg?.let { formatNumber(Math.round(it.kgTo(unit) * 10) / 10.0) } ?: "")

    fun toProfile(): Profile = Profile(
        name = name.trim(),
        birthday = birthday?.toString(),
        heightCm = parseHeightCm(height),
        bodyweightKg = weight.replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 }?.toKg(unit)?.takeIf { it in 20.0..350.0 },
        sex = sex,
    )
}

/** Keeps a half-filled profile form across rotation and process death. */
val ProfileFormSaver = listSaver<ProfileForm, String>(
    save = { listOf(it.name, it.birthday?.toString() ?: "", it.sex.name, it.height, it.weight, it.unit.name) },
    restore = { v ->
        ProfileForm(Profile(), WeightUnit.valueOf(v[5])).apply {
            name = v[0]
            birthday = v[1].takeIf { it.isNotEmpty() }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            sex = Sex.valueOf(v[2])
            height = v[3]
            weight = v[4]
        }
    },
)

/** Accepts "175", "175cm", or feet and inches like 5'9 / 5ft 9in. */
fun parseHeightCm(text: String): Double? {
    val t = text.trim().lowercase()
    if (t.isEmpty()) return null
    Regex("""(\d)\s*(?:'|ft|foot|feet)\s*(\d{1,2})?""").find(t)?.let { m ->
        val ft = m.groupValues[1].toInt()
        val inch = m.groupValues[2].toIntOrNull() ?: 0
        return ((ft * 12 + inch) * 2.54).takeIf { it in 100.0..250.0 }
    }
    return t.filter { it.isDigit() || it == '.' }.toDoubleOrNull()?.takeIf { it in 100.0..250.0 }
}

@Composable
fun ProfileScreen(app: AppState) {
    val form = rememberSaveable(saver = ProfileFormSaver) { ProfileForm(app.current.profile, app.current.settings.unit) }
    Box(Modifier.fillMaxSize()) {
        Page(bottomInset = 110.dp) {
            item {
                TopBar("Profile", { app.pop() })
                ProfileFields(form, app.today())
            }
        }
        BottomActions {
            GlassButton("SAVE", {
                app.updateProfile { form.toProfile() }
                app.pop()
                app.showToast("Profile saved ✓")
            }, Modifier.weight(1f), icon = IronIcons.Check)
        }
    }
}

@Composable
fun ProfileFields(form: ProfileForm, today: LocalDate, showBody: Boolean = true) {
    val p = LocalPalette.current
    SectionLabel("Name (optional)")
    GlassTextField(form.name, { form.name = it }, Modifier.fillMaxWidth(), placeholder = "What should we call you?", maxLength = 30)
    VSpace(20.dp)
    SectionLabel("Birthday")
    BirthdayPicker(form.birthday ?: today.minusYears(16), today) { form.birthday = it }
    VSpace(20.dp)
    SectionLabel("You are")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Chip("MALE", form.sex == Sex.MALE, { form.sex = Sex.MALE }, Modifier.weight(1f))
        Chip("FEMALE", form.sex == Sex.FEMALE, { form.sex = Sex.FEMALE }, Modifier.weight(1f))
        Chip("SKIP", form.sex == Sex.UNSPECIFIED, { form.sex = Sex.UNSPECIFIED }, Modifier.weight(1f))
    }
    VSpace(6.dp)
    Text("Only used to compare your lifts with people your age.", style = Type.bodySmall, color = p.textMuted)
    if (showBody) ProfileBody(form)
}

@Composable
fun ProfileBody(form: ProfileForm) {
    val p = LocalPalette.current
    VSpace(20.dp)
    SectionLabel("Height (optional)")
    GlassTextField(form.height, { form.height = it.take(10) }, Modifier.fillMaxWidth(), placeholder = "e.g. 175 or 5'9", suffix = "CM")
    VSpace(20.dp)
    SectionLabel("Bodyweight (optional)")
    GlassTextField(
        form.weight, { s -> form.weight = s.filter { it.isDigit() || it == '.' || it == ',' }.take(6) }, Modifier.fillMaxWidth(),
        placeholder = "Makes strength comparisons fairer", keyboardType = KeyboardType.Decimal, suffix = form.unit.label.uppercase(),
    )
    VSpace(8.dp)
    Text("Height and weight are only used to estimate how your lifts compare.", style = Type.bodySmall, color = p.textMuted)
}

@Composable
fun BirthdayPicker(value: LocalDate, today: LocalDate, onChange: (LocalDate) -> Unit) {
    val years = (today.year - 90..today.year - 6).toList().reversed()
    var day by rememberSaveable { mutableStateOf(value.dayOfMonth) }
    var month by rememberSaveable { mutableStateOf(value.monthValue) }
    var year by rememberSaveable { mutableStateOf(value.year.coerceIn(years.last(), years.first())) }
    fun emit() {
        val maxDay = java.time.YearMonth.of(year, month).lengthOfMonth()
        onChange(LocalDate.of(year, month, day.coerceAtMost(maxDay)))
    }
    GlassCard(Modifier.fillMaxWidth(), padding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 4.dp)) {
        Row {
            WheelPicker((1..31).map { it.toString() }, day - 1, { day = it + 1; emit() }, Modifier.weight(0.8f))
            WheelPicker(
                Month.entries.map { it.getDisplayName(TextStyle.SHORT, Locale.UK) }, month - 1,
                { month = it + 1; emit() }, Modifier.weight(1f),
            )
            WheelPicker(years.map { it.toString() }, years.indexOf(year).coerceAtLeast(0), { year = years[it]; emit() }, Modifier.weight(1.1f))
        }
    }
}
