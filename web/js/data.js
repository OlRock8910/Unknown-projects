// Every adjective in the app. Pure content — games only read this.
//
//   m / f   masculine and feminine singular (identical when the adjective is invariable)
//   en      English meaning; the first comma-separated part is used in sentences
//   e       emoji
//   c       pack: pos (good traits), neg (annoying & mean), look (appearance), feel (feelings)
//   v       verb it normally takes with a person: ser, estar, or both
//   o       opposite (masculine form of another entry)
//   s       synonym group — words in one group are never used as each other's wrong answers
//   clue    a situation that describes the trait, for "Describe Them"
//   tip     a note worth knowing about this word
const RAW_WORDS = [
  // ---------------------------------------------------------------- good traits
  { m: 'simpático', f: 'simpática', en: 'nice, friendly', e: '🙂', c: 'pos', o: 'antipático', s: 'nice', clue: 'Everyone loves chatting with them — so friendly!' },
  { m: 'amable', f: 'amable', en: 'kind', e: '🤗', c: 'pos', s: 'nice', clue: 'Helps old people carry their shopping home.' },
  { m: 'inteligente', f: 'inteligente', en: 'intelligent, smart', e: '🧠', c: 'pos', o: 'tonto', s: 'smart', clue: 'Gets top marks in every single exam.' },
  { m: 'listo', f: 'lista', en: 'clever', e: '💡', c: 'pos', s: 'smart', clue: 'Always finds a quick solution to any problem.', tip: 'Ser listo = to be clever. Estar listo = to be ready!' },
  { m: 'divertido', f: 'divertida', en: 'fun', e: '🥳', c: 'pos', o: 'aburrido', s: 'fun', clue: 'Every party gets better the moment they arrive.' },
  { m: 'gracioso', f: 'graciosa', en: 'funny', e: '😂', c: 'pos', s: 'fun', clue: 'Their jokes make everyone cry with laughter.' },
  { m: 'trabajador', f: 'trabajadora', en: 'hard-working', e: '💼', c: 'pos', o: 'perezoso', clue: 'Works twelve hours a day without complaining.', tip: 'Adjectives ending in -or add -a for feminine: trabajador → trabajadora.' },
  { m: 'generoso', f: 'generosa', en: 'generous', e: '🎁', c: 'pos', o: 'tacaño', clue: 'Always pays for everybody’s lunch.' },
  { m: 'valiente', f: 'valiente', en: 'brave', e: '🦁', c: 'pos', o: 'cobarde', clue: 'Jumps into the sea to rescue a swimmer.' },
  { m: 'paciente', f: 'paciente', en: 'patient', e: '⏳', c: 'pos', o: 'impaciente', clue: 'Waits in a huge queue without a single complaint.' },
  { m: 'honesto', f: 'honesta', en: 'honest', e: '😇', c: 'pos', o: 'mentiroso', clue: 'Finds a wallet and returns it with all the money inside.' },
  { m: 'educado', f: 'educada', en: 'polite', e: '🙇', c: 'pos', o: 'maleducado', clue: 'Always says please and thank you.', tip: 'False friend! Educado means polite, not educated.' },
  { m: 'tranquilo', f: 'tranquila', en: 'calm', e: '😌', c: 'pos', o: 'nervioso', s: 'calm', clue: 'Stays relaxed even when everything goes wrong.' },
  { m: 'creativo', f: 'creativa', en: 'creative', e: '🎨', c: 'pos', clue: 'Paints, writes songs and invents new games.' },
  { m: 'responsable', f: 'responsable', en: 'responsible', e: '📋', c: 'pos', clue: 'Never forgets their homework or to feed the dog.' },
  { m: 'cariñoso', f: 'cariñosa', en: 'affectionate, loving', e: '🥰', c: 'pos', clue: 'Gives everyone big warm hugs.' },
  { m: 'tímido', f: 'tímida', en: 'shy', e: '🙈', c: 'pos', o: 'extrovertido', clue: 'Turns bright red when someone talks to them.' },
  { m: 'extrovertido', f: 'extrovertida', en: 'outgoing', e: '🎉', c: 'pos', o: 'tímido', clue: 'Talks to everyone at the party — even strangers.' },
  { m: 'serio', f: 'seria', en: 'serious', e: '😐', c: 'pos', clue: 'Hardly ever smiles or tells a joke.' },
  { m: 'optimista', f: 'optimista', en: 'optimistic', e: '🌈', c: 'pos', o: 'pesimista', clue: 'Always believes tomorrow will be better.', tip: 'Adjectives ending in -ista are the same for él and ella.' },
  { m: 'deportista', f: 'deportista', en: 'sporty', e: '⚽', c: 'pos', clue: 'Plays football, tennis and goes running every day.' },
  { m: 'leal', f: 'leal', en: 'loyal', e: '🐕', c: 'pos', clue: 'Would never betray a friend.' },
  { m: 'humilde', f: 'humilde', en: 'humble', e: '🙏', c: 'pos', o: 'arrogante', clue: 'Wins the trophy but never shows off.' },
  { m: 'alegre', f: 'alegre', en: 'cheerful', e: '🌞', c: 'pos', s: 'happy', clue: 'Always smiling and singing.' },
  { m: 'puntual', f: 'puntual', en: 'punctual', e: '⏰', c: 'pos', clue: 'Always arrives exactly on time.' },
  { m: 'ordenado', f: 'ordenada', en: 'tidy', e: '🧹', c: 'pos', o: 'desordenado', clue: 'Their bedroom is always perfectly clean.' },
  { m: 'sensible', f: 'sensible', en: 'sensitive', e: '🥺', c: 'pos', clue: 'Cries at every sad film.', tip: 'False friend! Sensible means sensitive. "Sensible" in English is sensato.' },
  { m: 'bueno', f: 'buena', en: 'good', e: '👍', c: 'pos', o: 'malo', clue: 'Always does the right thing.' },
  { m: 'elegante', f: 'elegante', en: 'elegant, stylish', e: '🕴️', c: 'look', clue: 'Always wears the smartest clothes in the room.' },

  // ---------------------------------------------------------------- annoying & mean
  { m: 'molesto', f: 'molesta', en: 'annoying', e: '😤', c: 'neg', s: 'annoy', clue: 'Keeps poking you and just won’t stop.', tip: 'Ser molesto = to be annoying. Estar molesto = to be upset or annoyed.' },
  { m: 'pesado', f: 'pesada', en: 'annoying, tiresome', e: '🙄', c: 'neg', s: 'annoy', clue: 'Tells you the same boring story again and again.', tip: 'Literally "heavy" — the everyday word for someone who wears you out.' },
  { m: 'irritante', f: 'irritante', en: 'irritating', e: '😖', c: 'neg', s: 'annoy', clue: 'Chews loudly and taps the table all through dinner.' },
  { m: 'antipático', f: 'antipática', en: 'unfriendly, unpleasant', e: '😒', c: 'neg', o: 'simpático', clue: 'Is cold and unfriendly to everyone they meet.' },
  { m: 'perezoso', f: 'perezosa', en: 'lazy', e: '🦥', c: 'neg', o: 'trabajador', s: 'lazy', clue: 'Stays on the sofa all day doing absolutely nothing.' },
  { m: 'vago', f: 'vaga', en: 'lazy, idle', e: '🛋️', c: 'neg', s: 'lazy', clue: 'Finds an excuse to avoid every single chore.', tip: 'Vago is the everyday, slightly rude way to say lazy.' },
  { m: 'maleducado', f: 'maleducada', en: 'rude', e: '🤬', c: 'neg', o: 'educado', clue: 'Talks with their mouth full and never says thank you.' },
  { m: 'egoísta', f: 'egoísta', en: 'selfish', e: '🤑', c: 'neg', clue: 'Only ever thinks about themselves.' },
  { m: 'tacaño', f: 'tacaña', en: 'stingy', e: '🪙', c: 'neg', o: 'generoso', clue: 'Never pays for anything — not even a coffee.' },
  { m: 'aburrido', f: 'aburrida', en: 'boring', e: '🥱', c: 'neg', o: 'divertido', clue: 'Their stories send everyone to sleep.', tip: 'Ser aburrido = to be boring. Estar aburrido = to be bored!' },
  { m: 'tonto', f: 'tonta', en: 'silly, dumb', e: '🤡', c: 'neg', o: 'inteligente', clue: 'Puts their shoes on the wrong feet. Again.' },
  { m: 'mentiroso', f: 'mentirosa', en: 'dishonest, lying', e: '🤥', c: 'neg', o: 'honesto', clue: 'Says the dog ate their homework. They don’t have a dog.' },
  { m: 'celoso', f: 'celosa', en: 'jealous', e: '💚', c: 'neg', clue: 'Gets upset whenever their partner talks to anyone else.' },
  { m: 'arrogante', f: 'arrogante', en: 'arrogant', e: '😏', c: 'neg', o: 'humilde', s: 'arrogant', clue: 'Thinks they are better than everyone else.' },
  { m: 'creído', f: 'creída', en: 'conceited, stuck-up', e: '💅', c: 'neg', s: 'arrogant', clue: 'Admires themselves in every mirror they pass.' },
  { m: 'terco', f: 'terca', en: 'stubborn', e: '🐂', c: 'neg', clue: 'Never changes their mind, even when they’re wrong.' },
  { m: 'impaciente', f: 'impaciente', en: 'impatient', e: '⚡', c: 'neg', o: 'paciente', clue: 'Can’t wait two minutes for anything.' },
  { m: 'desordenado', f: 'desordenada', en: 'messy, untidy', e: '🌪️', c: 'neg', o: 'ordenado', clue: 'Their clothes are all over the floor.' },
  { m: 'torpe', f: 'torpe', en: 'clumsy', e: '🤕', c: 'neg', clue: 'Trips over nothing and drops everything.' },
  { m: 'cobarde', f: 'cobarde', en: 'cowardly', e: '🐔', c: 'neg', o: 'valiente', clue: 'Runs away screaming from a tiny spider.' },
  { m: 'mandón', f: 'mandona', en: 'bossy', e: '👑', c: 'neg', clue: 'Always telling everybody what to do.', tip: '-ón becomes -ona, and the accent disappears: mandón → mandona.' },
  { m: 'chismoso', f: 'chismosa', en: 'gossipy, nosy', e: '🗣️', c: 'neg', clue: 'Knows everyone’s secrets — and tells them all.' },
  { m: 'raro', f: 'rara', en: 'weird, strange', e: '👽', c: 'neg', clue: 'Eats pizza with chocolate and wears socks on their hands.' },
  { m: 'loco', f: 'loca', en: 'crazy', e: '🤪', c: 'neg', clue: 'Does the wildest, most unpredictable things.' },
  { m: 'hablador', f: 'habladora', en: 'talkative, chatty', e: '💬', c: 'neg', clue: 'Never stops talking — not even for a second.' },
  { m: 'cruel', f: 'cruel', en: 'cruel', e: '😈', c: 'neg', clue: 'Enjoys making other people suffer.' },
  { m: 'malo', f: 'mala', en: 'bad, naughty', e: '👎', c: 'neg', o: 'bueno', clue: 'Is always getting into trouble.', tip: 'Ser malo = to be bad. Estar malo = to be ill.' },
  { m: 'pesimista', f: 'pesimista', en: 'pessimistic', e: '🌧️', c: 'neg', o: 'optimista', clue: 'Always expects the worst to happen.' },
  { m: 'dormilón', f: 'dormilona', en: 'sleepyhead', e: '🛌', c: 'neg', clue: 'Sleeps until two in the afternoon every weekend.' },
  { m: 'llorón', f: 'llorona', en: 'whiny, crybaby', e: '😭', c: 'neg', clue: 'Cries whenever they don’t get their way.' },
  { m: 'travieso', f: 'traviesa', en: 'mischievous', e: '😜', c: 'neg', clue: 'Hides their brother’s shoes and laughs about it.' },

  // ---------------------------------------------------------------- looks
  { m: 'alto', f: 'alta', en: 'tall', e: '🦒', c: 'look', o: 'bajo' },
  { m: 'bajo', f: 'baja', en: 'short', e: '⬇️', c: 'look', o: 'alto', tip: 'Bajo is short in height. Short in length is corto.' },
  { m: 'guapo', f: 'guapa', en: 'good-looking', e: '😎', c: 'look', o: 'feo', s: 'pretty' },
  { m: 'bonito', f: 'bonita', en: 'pretty', e: '🌸', c: 'look', s: 'pretty' },
  { m: 'feo', f: 'fea', en: 'ugly', e: '👹', c: 'look', o: 'guapo' },
  { m: 'gordo', f: 'gorda', en: 'fat', e: '🍩', c: 'look', o: 'delgado' },
  { m: 'delgado', f: 'delgada', en: 'thin, slim', e: '🥢', c: 'look', o: 'gordo' },
  { m: 'fuerte', f: 'fuerte', en: 'strong', e: '🏋️', c: 'look', o: 'débil' },
  { m: 'débil', f: 'débil', en: 'weak', e: '🪶', c: 'look', o: 'fuerte' },
  { m: 'joven', f: 'joven', en: 'young', e: '👶', c: 'look', o: 'viejo' },
  { m: 'viejo', f: 'vieja', en: 'old', e: '👴', c: 'look', o: 'joven', s: 'old' },
  { m: 'mayor', f: 'mayor', en: 'elderly, older', e: '🧓', c: 'look', s: 'old', tip: 'Mayor is the polite way to say someone is old.' },
  { m: 'rubio', f: 'rubia', en: 'blond', e: '👱', c: 'look' },
  { m: 'moreno', f: 'morena', en: 'dark-haired', e: '🧑🏽', c: 'look', tip: 'Moreno can mean dark-haired or tanned.' },
  { m: 'pelirrojo', f: 'pelirroja', en: 'red-haired', e: '👩‍🦰', c: 'look' },
  { m: 'calvo', f: 'calva', en: 'bald', e: '👨‍🦲', c: 'look' },
  { m: 'grande', f: 'grande', en: 'big', e: '🐘', c: 'look', o: 'pequeño' },
  { m: 'pequeño', f: 'pequeña', en: 'small, little', e: '🐭', c: 'look', o: 'grande' },

  // ---------------------------------------------------------------- feelings (estar)
  { m: 'feliz', f: 'feliz', en: 'happy', e: '😄', c: 'feel', v: 'both', o: 'triste', s: 'happy' },
  { m: 'contento', f: 'contenta', en: 'pleased, glad', e: '😃', c: 'feel', s: 'happy' },
  { m: 'triste', f: 'triste', en: 'sad', e: '😢', c: 'feel', v: 'both', o: 'feliz' },
  { m: 'enfadado', f: 'enfadada', en: 'angry', e: '😠', c: 'feel', s: 'angry' },
  { m: 'cansado', f: 'cansada', en: 'tired', e: '😴', c: 'feel' },
  { m: 'nervioso', f: 'nerviosa', en: 'nervous', e: '😬', c: 'feel', o: 'tranquilo', s: 'nervous' },
  { m: 'preocupado', f: 'preocupada', en: 'worried', e: '😟', c: 'feel', s: 'nervous' },
  { m: 'emocionado', f: 'emocionada', en: 'excited', e: '🤩', c: 'feel', tip: 'Emocionado means excited (or moved), not emotional.' },
  { m: 'asustado', f: 'asustada', en: 'scared', e: '😱', c: 'feel' },
  { m: 'sorprendido', f: 'sorprendida', en: 'surprised', e: '😮', c: 'feel' },
  { m: 'enamorado', f: 'enamorada', en: 'in love', e: '💘', c: 'feel' },
  { m: 'avergonzado', f: 'avergonzada', en: 'embarrassed', e: '😳', c: 'feel', tip: 'False friend! Embarrassed is avergonzado — embarazada means pregnant.' },
  { m: 'orgulloso', f: 'orgullosa', en: 'proud', e: '🦚', c: 'feel', v: 'both' },
  { m: 'harto', f: 'harta', en: 'fed up', e: '😩', c: 'feel', s: 'angry' },
  { m: 'enfermo', f: 'enferma', en: 'ill, sick', e: '🤒', c: 'feel' },
  { m: 'ocupado', f: 'ocupada', en: 'busy', e: '📅', c: 'feel' },
  { m: 'relajado', f: 'relajada', en: 'relaxed', e: '🧘', c: 'feel', s: 'calm' },
  { m: 'confundido', f: 'confundida', en: 'confused', e: '😕', c: 'feel' },
];

const WORDS = RAW_WORDS.map((w, i) => ({
  ...w,
  id: w.m,
  idx: i,
  v: w.v || (w.c === 'feel' ? 'estar' : 'ser'),
  short: w.en.split(',')[0].trim(),
  inv: w.m === w.f,
}));

const WORD_BY_ID = Object.fromEntries(WORDS.map((w) => [w.id, w]));

const PACKS = [
  { id: 'all', name: 'Everything', emoji: '🌍', test: () => true },
  { id: 'neg', name: 'Annoying & mean', emoji: '😤', test: (w) => w.c === 'neg' },
  { id: 'pos', name: 'Good traits', emoji: '😇', test: (w) => w.c === 'pos' },
  { id: 'look', name: 'Looks', emoji: '👀', test: (w) => w.c === 'look' },
  { id: 'feel', name: 'Feelings', emoji: '💭', test: (w) => w.c === 'feel' },
];

const CATEGORY_NAMES = { pos: 'Good traits', neg: 'Annoying & mean', look: 'Looks', feel: 'Feelings' };

// People to describe. Spanish subject, English subject, gender.
const SUBJECTS = [
  ['Él', 'He', 'm'], ['Ella', 'She', 'f'],
  ['Mi hermano', 'My brother', 'm'], ['Mi hermana', 'My sister', 'f'],
  ['Mi amigo', 'My friend', 'm'], ['Mi amiga', 'My friend', 'f'],
  ['Mi profesor', 'My teacher', 'm'], ['Mi profesora', 'My teacher', 'f'],
  ['Mi jefe', 'My boss', 'm'], ['Mi jefa', 'My boss', 'f'],
  ['Mi abuelo', 'My grandad', 'm'], ['Mi abuela', 'My grandma', 'f'],
  ['Mi vecino', 'My neighbour', 'm'], ['Mi vecina', 'My neighbour', 'f'],
  ['Mi primo', 'My cousin', 'm'], ['Mi prima', 'My cousin', 'f'],
  ['Mi padre', 'My dad', 'm'], ['Mi madre', 'My mum', 'f'],
  ['El chico', 'The boy', 'm'], ['La chica', 'The girl', 'f'],
].map(([es, en, g]) => ({ es, en, g }));

const INTENSIFIERS = [
  { es: '', en: '' },
  { es: 'muy', en: 'very' },
  { es: 'muy', en: 'very' },
  { es: 'bastante', en: 'quite' },
  { es: 'un poco', en: 'a bit' },
  { es: 'demasiado', en: 'too' },
];

const NAMES = {
  m: ['Pablo', 'Javier', 'Diego', 'Carlos', 'Mateo', 'Hugo', 'Álvaro', 'Daniel', 'Marcos', 'Luis'],
  f: ['Lucía', 'Sofía', 'Carmen', 'Elena', 'Paula', 'Marta', 'Valeria', 'Laura', 'Ana', 'Irene'],
};
const AVATARS = {
  m: ['👨', '👦', '🧔', '👨‍🦱', '👴', '👨‍🦳', '🧑‍🎤', '👨‍🍳', '👨‍🏫', '🕵️‍♂️'],
  f: ['👩', '👧', '👩‍🦱', '👵', '👩‍🦳', '👩‍🎤', '👩‍🍳', '👩‍🏫', '🕵️‍♀️', '👱‍♀️'],
};

// Adjectives whose meaning changes with ser and estar.
const DUAL_MEANINGS = [
  { id: 'aburrido', ser: 'boring', estar: 'bored' },
  { id: 'molesto', ser: 'annoying', estar: 'upset' },
  { id: 'listo', ser: 'clever', estar: 'ready' },
  { id: 'malo', ser: 'bad', estar: 'ill' },
];

const GRAMMAR_TIPS = [
  {
    title: 'Él or ella? Make it match',
    emoji: '👫',
    body: 'Adjectives change to match the person. Most that end in <b>-o</b> swap to <b>-a</b> for a woman or girl.',
    examples: [['Él es simpático.', 'He is nice.'], ['Ella es simpática.', 'She is nice.']],
  },
  {
    title: '-or and -ón add an -a',
    emoji: '➕',
    body: '<b>-or</b> becomes <b>-ora</b>. <b>-ón</b> becomes <b>-ona</b> and loses its accent.',
    examples: [['Mi jefe es trabajador.', 'My boss is hard-working.'], ['Mi hermana es mandona.', 'My sister is bossy.']],
  },
  {
    title: 'Some never change',
    emoji: '🔒',
    body: 'Adjectives ending in <b>-e</b>, <b>-ista</b> or most consonants are the same for both.',
    examples: [['Él es valiente. Ella es valiente.', 'He is brave. She is brave.'], ['Mi primo es egoísta.', 'My cousin is selfish.']],
  },
  {
    title: 'Ser for who you are',
    emoji: '🪪',
    body: 'Use <b>ser</b> (es) for personality and looks — things that describe what someone is like.',
    examples: [['Mi vecino es molesto.', 'My neighbour is annoying.'], ['Ella es alta.', 'She is tall.']],
  },
  {
    title: 'Estar for how you feel',
    emoji: '🌡️',
    body: 'Use <b>estar</b> (está) for feelings and states that can change.',
    examples: [['Mi madre está cansada.', 'My mum is tired.'], ['Él está nervioso.', 'He is nervous.']],
  },
  {
    title: 'Same word, new meaning',
    emoji: '🔀',
    body: 'Some adjectives change meaning with ser and estar.',
    examples: [['Es aburrido. / Está aburrido.', 'He is boring. / He is bored.'], ['Es listo. / Está listo.', 'He is clever. / He is ready.']],
  },
  {
    title: 'Turn it up or down',
    emoji: '🎚️',
    body: 'Put these before the adjective: <b>muy</b> (very), <b>bastante</b> (quite), <b>un poco</b> (a bit), <b>demasiado</b> (too).',
    examples: [['Mi hermano es muy pesado.', 'My brother is very annoying.'], ['Es un poco tímida.', 'She is a bit shy.']],
  },
  {
    title: 'After the noun',
    emoji: '↪️',
    body: 'Describing words usually go <b>after</b> the person or thing.',
    examples: [['Un chico molesto.', 'An annoying boy.'], ['Una amiga generosa.', 'A generous friend.']],
  },
];
