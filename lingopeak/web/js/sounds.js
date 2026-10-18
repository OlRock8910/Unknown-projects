// The sounds cheat sheet in the read-aloud game: for each language you can
// learn, the sounds that trip people up, an example word (tap it to hear it)
// and how to say it, explained in each language you might speak.
const SOUNDS = {
  es: [
    { s: 'j · ge · gi', ex: 'jugar', d: { en: 'A rough “h” from the back of the throat.', fr: 'Un « h » râpeux au fond de la gorge.', de: 'Wie das „ch“ in „Bach“.', pt: 'Um “rr” arranhado no fundo da garganta.' } },
    { s: 'll · y', ex: 'llamar', d: { en: 'Like a “y” sound.', fr: 'Comme le son « y » de « yoga ».', de: 'Wie das „j“ in „ja“.', pt: 'Como um som de “i” rápido (“iá”).' } },
    { s: 'ñ', ex: 'mañana', d: { en: 'Like “ny”, said in one go.', fr: 'Comme le « gn » de « montagne ».', de: 'Wie „nj“ in einem Zug.', pt: 'Como o “nh” de “amanhã”.' } },
    { s: 'h', ex: 'hola', d: { en: 'Always silent.', fr: 'Toujours muet.', de: 'Wird nie gesprochen.', pt: 'Sempre muda.' } },
    { s: 'r · rr', ex: 'perro', d: { en: 'r is a quick tap of the tongue; rr is rolled.', fr: 'r : un petit coup de langue ; rr : roulé.', de: 'r: kurz mit der Zunge tippen; rr: rollen.', pt: 'r: um toque rápido da língua; rr: vibrado.' } },
    { s: 'e', ex: 'leche', d: { en: 'Short and clear, like “eh”. Every vowel is said.', fr: 'Court et net, comme « é ». Toutes les voyelles se prononcent.', de: 'Kurz und klar wie „e“ in „Bett“. Jeder Vokal wird gesprochen.', pt: 'Curto e claro, como “ê”. Toda vogal é pronunciada.' } },
    { s: 'z · ce · ci', ex: 'gracias', d: { en: 'Like “th” in Spain, like “s” in Latin America.', fr: 'Comme le « th » anglais en Espagne, « s » en Amérique latine.', de: 'In Spanien wie englisches „th“, in Lateinamerika wie „s“.', pt: 'Como o “th” inglês na Espanha, “s” na América Latina.' } },
  ],
  fr: [
    { s: 'u', ex: 'tu', d: { en: 'Say “ee” with your lips rounded.', es: 'Di “i” con los labios redondeados.', de: 'Wie „ü“ in „über“.', pt: 'Diga “i” com os lábios arredondados.' } },
    { s: 'ou', ex: 'vous', d: { en: 'Like “oo”.', es: 'Como “u”.', de: 'Wie „u“.', pt: 'Como “u”.' } },
    { s: 'r', ex: 'rouge', d: { en: 'A soft gargle at the back of the throat.', es: 'Un sonido suave al fondo de la garganta, como hacer gárgaras.', de: 'Hinten im Rachen, wie im Deutschen.', pt: 'Um som suave no fundo da garganta, como o “r” de “carro”.' } },
    { s: 'on · an · en', ex: 'bonjour', d: { en: 'Nasal: hum the vowel through your nose, no “n” at the end.', es: 'Nasal: la vocal sale por la nariz, sin decir la “n”.', de: 'Nasal: den Vokal durch die Nase, ohne „n“ am Ende.', pt: 'Nasal, como em “bom” ou “cantar”, sem dizer o “n”.' } },
    { s: 'é · è', ex: 'café', d: { en: 'é is a short “ay”; è is “eh”.', es: 'é es una “e” cerrada; è es una “e” abierta.', de: 'é wie „e“ in „See“ (kurz); è wie „ä“.', pt: 'é como “ê”; è como “é”.' } },
    { s: 'petit', ex: 'petit', d: { en: 'The last consonant is usually not said.', es: 'La última consonante normalmente no se pronuncia.', de: 'Der letzte Konsonant wird meist nicht gesprochen.', pt: 'A última consoante normalmente não é pronunciada.' } },
    { s: 'oi', ex: 'moi', d: { en: 'Like “wa”.', es: 'Como “ua”.', de: 'Wie „wa“ („ua“).', pt: 'Como “uá”.' } },
  ],
  de: [
    { s: 'w', ex: 'Wasser', d: { en: 'Sounds like “v”.', es: 'Suena como una “v” (con los dientes en el labio).', fr: 'Se prononce « v ».', pt: 'Soa como “v”.' } },
    { s: 'v', ex: 'Vater', d: { en: 'Usually sounds like “f”.', es: 'Normalmente suena como “f”.', fr: 'Se prononce souvent « f ».', pt: 'Normalmente soa como “f”.' } },
    { s: 'ei · ie', ex: 'Liebe', d: { en: 'ei sounds like “eye”; ie like a long “ee”.', es: 'ei suena “ai”; ie suena como una “i” larga.', fr: 'ei se dit « aï » ; ie se dit « i » long.', pt: 'ei soa “ai”; ie soa como um “i” longo.' } },
    { s: 'ch', ex: 'ich', d: { en: 'A soft hiss after e or i; a rough throat sound after a, o, u.', es: 'Un siseo suave tras e/i; un sonido áspero como la “j” tras a/o/u.', fr: 'Un souffle doux après e/i ; un son rauque après a/o/u.', pt: 'Um chiado suave depois de e/i; um som áspero na garganta depois de a/o/u.' } },
    { s: 'z', ex: 'Zeit', d: { en: 'Like “ts”.', es: 'Como “ts”.', fr: 'Se dit « ts ».', pt: 'Como “ts”.' } },
    { s: 'ü · ö', ex: 'müde', d: { en: 'ü: say “ee” with rounded lips; ö: say “e” with rounded lips.', es: 'ü: di “i” con labios redondeados; ö: di “e” con labios redondeados.', fr: 'ü se dit comme « u » ; ö comme « eu ».', pt: 'ü: diga “i” com lábios arredondados; ö: diga “e” com lábios arredondados.' } },
    { s: 'sch', ex: 'Schule', d: { en: 'Like “sh”.', es: 'Como “sh” (el sonido de pedir silencio).', fr: 'Se dit « ch ».', pt: 'Como “ch” em “chá”.' } },
  ],
  pt: [
    { s: 'ão', ex: 'não', d: { en: 'A nasal “ow”, through the nose.', es: 'Un “aun” nasal, por la nariz.', fr: 'Un « an-on » nasal, par le nez.', de: 'Ein nasales „au“, durch die Nase.' } },
    { s: 'lh', ex: 'filho', d: { en: 'Like “ly”, said in one go.', es: 'Como “ll” o “li” rápido.', fr: 'Comme « li » dit très vite.', de: 'Wie „lj“ in einem Zug.' } },
    { s: 'nh', ex: 'amanhã', d: { en: 'Like “ny”.', es: 'Como la “ñ”.', fr: 'Comme « gn ».', de: 'Wie „nj“.' } },
    { s: 'ti · di', ex: 'tia', d: { en: 'In Brazil t and d before “i” sound like “ch” and “j”.', es: 'En Brasil, t y d antes de “i” suenan como “ch” y “y”.', fr: 'Au Brésil, t et d devant « i » se disent « tch » et « dj ».', de: 'In Brasilien klingen t und d vor „i“ wie „tsch“ und „dsch“.' } },
    { s: 'r · rr', ex: 'rio', d: { en: 'At the start, and rr, sound like a breathy “h”.', es: 'Al principio, y rr, suenan como una “j” suave.', fr: 'Au début, et rr, se disent comme un « h » soufflé.', de: 'Am Anfang und als rr wie ein gehauchtes „h“.' } },
    { s: '-e · -o', ex: 'leite', d: { en: 'At the end of a word, e sounds like “i” and o like “u”.', es: 'Al final de palabra, la e suena “i” y la o suena “u”.', fr: 'En fin de mot, e se dit « i » et o se dit « ou ».', de: 'Am Wortende klingt e wie „i“ und o wie „u“.' } },
    { s: 'ç', ex: 'coração', d: { en: 'Always “s”.', es: 'Siempre “s”.', fr: 'Toujours « s ».', de: 'Immer wie „ss“.' } },
  ],
  en: [
    { s: 'th', ex: 'thank you', d: { es: 'Lengua entre los dientes y sopla (como la “z” de España).', fr: 'Langue entre les dents, et souffle.', de: 'Zunge zwischen die Zähne und pusten.', pt: 'Língua entre os dentes e sopre.' } },
    { s: 'w', ex: 'water', d: { es: 'Labios redondos como “u” y luego ábrelos: “ua”.', fr: 'Lèvres arrondies comme « ou », puis ouvre : « oua ».', de: 'Lippen rund wie „u“, dann öffnen: „ua“.', pt: 'Lábios redondos como “u”, depois abra: “uá”.' } },
    { s: 'h', ex: 'hello', d: { es: 'Un soplo suave, como una “j” muy ligera.', fr: 'Un souffle léger : le « h » se prononce.', de: 'Ein leiser Hauch wie im Deutschen.', pt: 'Um sopro leve, como um “rr” bem suave.' } },
    { s: 'know · night', ex: 'know', d: { es: 'Algunas letras no se dicen: k en “know”, gh en “night”.', fr: 'Certaines lettres sont muettes : k dans « know », gh dans « night ».', de: 'Manche Buchstaben sind stumm: k in „know“, gh in „night“.', pt: 'Algumas letras são mudas: k em “know”, gh em “night”.' } },
    { s: '-ed', ex: 'played', d: { es: 'Casi siempre solo una “d” o “t”, no una sílaba más.', fr: 'Souvent juste un « d » ou un « t », pas une syllabe de plus.', de: 'Meist nur ein „d“ oder „t“, keine eigene Silbe.', pt: 'Quase sempre só um “d” ou “t”, sem sílaba a mais.' } },
    { s: 'r', ex: 'red', d: { es: 'No la hagas vibrar: curva la lengua hacia atrás sin tocar nada.', fr: 'Ne la roule pas : la langue se courbe en arrière sans toucher.', de: 'Nicht rollen: Zunge nach hinten biegen, ohne etwas zu berühren.', pt: 'Não vibre: curve a língua para trás sem encostar.' } },
    { s: 'a', ex: 'cat', d: { es: 'Cambia: corta y abierta en “cat”, larga en “car”.', fr: 'Elle change : courte et ouverte dans « cat », longue dans « car ».', de: 'Sie wechselt: kurz und offen wie „ä“ in „cat“, lang in „car“.', pt: 'Ela muda: curta e aberta em “cat”, longa em “car”.' } },
  ],
};
