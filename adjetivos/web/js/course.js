// The course: units in order, each with its words, a few sentences to build,
// and short tips. Words are [Spanish, English, emoji]; the English before
// any comma is what games show. Nouns keep their article (el/la/los/las) so
// learners pick up the gender with the word.
//
// The four adjective units use the richer entries in data.js (which also
// power the grammar games) and the grammar tips there, by number.

const COURSE = [
  {
    id: 'hello', title: 'Hola', sub: 'Greetings and basics', emoji: '👋', color: ['#22d3ee', '#2563eb'],
    words: [
      ['hola', 'hello', '👋'],
      ['adiós', 'goodbye', '🚪'],
      ['buenos días', 'good morning', '🌅'],
      ['buenas tardes', 'good afternoon', '🌇'],
      ['buenas noches', 'good night', '🌙'],
      ['gracias', 'thank you', '🙏'],
      ['por favor', 'please', '🥺'],
      ['de nada', 'you’re welcome', '😊'],
      ['sí', 'yes', '✅'],
      ['no', 'no', '❌'],
      ['perdón', 'sorry', '😬'],
      ['hasta luego', 'see you later', '🔜'],
      ['¿qué tal?', 'how’s it going?', '🤔'],
      ['bien', 'well, fine', '👍'],
      ['mal', 'badly, not well', '👎'],
      ['mucho gusto', 'nice to meet you', '🤝'],
    ],
    phrases: [
      ['¿Cómo te llamas?', 'What’s your name?'],
      ['Me llamo Ana.', 'My name is Ana.'],
      ['¿Cómo estás?', 'How are you?'],
      ['Estoy bien, gracias.', 'I’m fine, thanks.'],
      ['Hasta mañana.', 'See you tomorrow.'],
      ['Buenos días, señor.', 'Good morning, sir.'],
    ],
    tips: [
      ['Upside-down marks', 'Spanish questions start with ¿ and exclamations with ¡: <b>¿Qué tal?</b> <b>¡Hola!</b>'],
      ['Me llamo…', '<b>Me llamo Ana</b> means “My name is Ana” — word for word, “I call myself Ana”.'],
    ],
  },
  {
    id: 'numbers', title: 'Los números', sub: 'Counting from 0 to 100', emoji: '🔢', color: ['#a78bfa', '#6d28d9'],
    words: [
      ['cero', 'zero', '0️⃣'],
      ['uno', 'one', '1️⃣'],
      ['dos', 'two', '2️⃣'],
      ['tres', 'three', '3️⃣'],
      ['cuatro', 'four', '4️⃣'],
      ['cinco', 'five', '5️⃣'],
      ['seis', 'six', '6️⃣'],
      ['siete', 'seven', '7️⃣'],
      ['ocho', 'eight', '8️⃣'],
      ['nueve', 'nine', '9️⃣'],
      ['diez', 'ten', '🔟'],
      ['once', 'eleven', '11'],
      ['doce', 'twelve', '12'],
      ['quince', 'fifteen', '15'],
      ['veinte', 'twenty', '20'],
      ['cincuenta', 'fifty', '50'],
      ['cien', 'a hundred', '💯'],
    ],
    phrases: [
      ['Tengo doce años.', 'I am twelve years old.'],
      ['¿Cuántos años tienes?', 'How old are you?'],
      ['Tengo dos perros.', 'I have two dogs.'],
      ['Son las tres.', 'It is three o’clock.'],
    ],
    tips: [
      ['Your age uses “tener”', 'Spanish says how many years you <i>have</i>: <b>Tengo doce años</b> = I am twelve.'],
    ],
  },
  {
    id: 'colours', title: 'Los colores', sub: 'Every colour of the rainbow', emoji: '🎨', color: ['#f472b6', '#f59e0b'],
    words: [
      ['rojo', 'red', '🔴'],
      ['azul', 'blue', '🔵'],
      ['verde', 'green', '🟢'],
      ['amarillo', 'yellow', '🟡'],
      ['naranja', 'orange', '🟠'],
      ['morado', 'purple', '🟣'],
      ['negro', 'black', '⚫'],
      ['blanco', 'white', '⚪'],
      ['rosa', 'pink', '🌸'],
      ['marrón', 'brown', '🟤'],
      ['gris', 'grey', '🐘'],
    ],
    phrases: [
      ['El coche es rojo.', 'The car is red.'],
      ['La casa es blanca.', 'The house is white.'],
      ['Mi color favorito es el azul.', 'My favourite colour is blue.'],
      ['El cielo es azul.', 'The sky is blue.'],
    ],
    tips: [
      ['Colours change too', 'Colours ending in -o change for feminine words: <b>el coche rojo</b>, <b>la casa roja</b>. Others stay the same: <b>verde</b>, <b>azul</b>.'],
      ['After the noun', 'The colour comes <b>after</b> the thing: <b>un perro negro</b> = a black dog.'],
    ],
  },
  {
    id: 'family', title: 'La familia', sub: 'Mum, dad, brothers and sisters', emoji: '👨‍👩‍👧', color: ['#fb923c', '#dc2626'],
    words: [
      ['la madre', 'mother, mum', '👩'],
      ['el padre', 'father, dad', '👨'],
      ['el hermano', 'brother', '👦'],
      ['la hermana', 'sister', '👧'],
      ['el abuelo', 'grandfather, grandad', '👴'],
      ['la abuela', 'grandmother, grandma', '👵'],
      ['el hijo', 'son', '🧒'],
      ['la hija', 'daughter', '👱‍♀️'],
      ['el tío', 'uncle', '🧔'],
      ['la tía', 'aunt', '👩‍🦰'],
      ['el primo', 'cousin (boy)', '🧑'],
      ['la prima', 'cousin (girl)', '👩‍🦱'],
      ['el bebé', 'baby', '👶'],
      ['la familia', 'family', '👨‍👩‍👧'],
    ],
    phrases: [
      ['Tengo una hermana.', 'I have a sister.'],
      ['Mi padre se llama Juan.', 'My dad is called Juan.'],
      ['¿Tienes hermanos?', 'Do you have brothers or sisters?'],
      ['Mi abuela es muy simpática.', 'My grandma is very nice.'],
      ['Somos cuatro en mi familia.', 'There are four of us in my family.'],
    ],
    tips: [
      ['el and la', 'Every noun is masculine (<b>el</b>) or feminine (<b>la</b>). Learn the word <i>with</i> its el or la.'],
      ['Hermanos', '<b>Los hermanos</b> can mean brothers, or brothers and sisters together.'],
    ],
  },
  { id: 'look', title: 'What they look like', sub: 'Tall, short, blond, strong…', emoji: '👀', color: ['#f472b6', '#8b5cf6'], adjectives: 'look', grammar: [0, 2, 7] },
  { id: 'pos', title: 'Good traits', sub: 'Kind, brave, funny, clever…', emoji: '😇', color: ['#34d399', '#2563eb'], adjectives: 'pos', grammar: [1, 3, 6] },
  {
    id: 'food', title: 'La comida', sub: 'Food and drink', emoji: '🍎', color: ['#4ade80', '#16a34a'],
    words: [
      ['el pan', 'bread', '🍞'],
      ['el agua', 'water', '💧'],
      ['la leche', 'milk', '🥛'],
      ['la manzana', 'apple', '🍎'],
      ['el plátano', 'banana', '🍌'],
      ['el queso', 'cheese', '🧀'],
      ['el pollo', 'chicken', '🍗'],
      ['el arroz', 'rice', '🍚'],
      ['el huevo', 'egg', '🥚'],
      ['la pizza', 'pizza', '🍕'],
      ['el zumo', 'juice', '🧃'],
      ['la sopa', 'soup', '🍲'],
      ['el helado', 'ice cream', '🍦'],
      ['la fresa', 'strawberry', '🍓'],
      ['el pescado', 'fish (to eat)', '🐟'],
      ['las patatas fritas', 'chips, fries', '🍟'],
      ['la galleta', 'biscuit, cookie', '🍪'],
      ['el chocolate', 'chocolate', '🍫'],
    ],
    phrases: [
      ['Tengo hambre.', 'I’m hungry.'],
      ['Quiero agua, por favor.', 'I want water, please.'],
      ['Me gusta el chocolate.', 'I like chocolate.'],
      ['No me gusta el pescado.', 'I don’t like fish.'],
      ['La pizza está muy rica.', 'The pizza is very tasty.'],
    ],
    tips: [
      ['Me gusta', '<b>Me gusta el queso</b> = I like cheese. For more than one thing: <b>Me gustan las fresas</b>.'],
      ['El agua', '<b>Agua</b> is feminine but says <b>el agua</b>, because “la agua” is hard to say.'],
    ],
  },
  {
    id: 'animals', title: 'Los animales', sub: 'Pets, farm and wild animals', emoji: '🐶', color: ['#facc15', '#ca8a04'],
    words: [
      ['el perro', 'dog', '🐶'],
      ['el gato', 'cat', '🐱'],
      ['el pájaro', 'bird', '🐦'],
      ['el pez', 'fish (alive)', '🐠'],
      ['el caballo', 'horse', '🐴'],
      ['la vaca', 'cow', '🐮'],
      ['el cerdo', 'pig', '🐷'],
      ['la oveja', 'sheep', '🐑'],
      ['el ratón', 'mouse', '🐭'],
      ['el conejo', 'rabbit', '🐰'],
      ['el león', 'lion', '🦁'],
      ['el oso', 'bear', '🐻'],
      ['el mono', 'monkey', '🐵'],
      ['el elefante', 'elephant', '🐘'],
      ['la serpiente', 'snake', '🐍'],
      ['la tortuga', 'tortoise, turtle', '🐢'],
      ['la araña', 'spider', '🕷️'],
    ],
    phrases: [
      ['Tengo un perro.', 'I have a dog.'],
      ['El gato es negro.', 'The cat is black.'],
      ['Me gustan los animales.', 'I like animals.'],
      ['El elefante es muy grande.', 'The elephant is very big.'],
      ['No tengo animales.', 'I don’t have any pets.'],
    ],
    tips: [
      ['Pez or pescado?', '<b>El pez</b> is a fish swimming about. <b>El pescado</b> is fish on your plate.'],
    ],
  },
  { id: 'neg', title: 'Annoying & mean', sub: 'Annoying, lazy, bossy, rude…', emoji: '😤', color: ['#f97316', '#db2777'], adjectives: 'neg', grammar: [1, 5, 6] },
  {
    id: 'body', title: 'El cuerpo', sub: 'Head, shoulders, knees and toes', emoji: '💪', color: ['#fb7185', '#be123c'],
    words: [
      ['la cabeza', 'head', '👤'],
      ['el pelo', 'hair', '💇'],
      ['los ojos', 'eyes', '👀'],
      ['la nariz', 'nose', '👃'],
      ['la boca', 'mouth', '👄'],
      ['la oreja', 'ear', '👂'],
      ['los dientes', 'teeth', '🦷'],
      ['la mano', 'hand', '✋'],
      ['el brazo', 'arm', '💪'],
      ['la pierna', 'leg', '🦵'],
      ['el pie', 'foot', '🦶'],
      ['el dedo', 'finger', '👆'],
      ['el corazón', 'heart', '❤️'],
      ['la cara', 'face', '🙂'],
    ],
    phrases: [
      ['Me duele la cabeza.', 'My head hurts.'],
      ['Tengo los ojos azules.', 'I have blue eyes.'],
      ['Tengo el pelo corto.', 'I have short hair.'],
      ['Lávate las manos.', 'Wash your hands.'],
    ],
    tips: [
      ['La mano', '<b>Mano</b> ends in -o but is feminine: <b>la mano</b>.'],
      ['Me duele…', 'To say something hurts: <b>Me duele el pie</b> = my foot hurts.'],
    ],
  },
  { id: 'feel', title: 'Feelings', sub: 'Happy, tired, nervous, bored…', emoji: '💭', color: ['#38bdf8', '#7c3aed'], adjectives: 'feel', grammar: [4, 5] },
  {
    id: 'clothes', title: 'La ropa', sub: 'What are you wearing?', emoji: '👕', color: ['#60a5fa', '#1d4ed8'],
    words: [
      ['la camiseta', 'T-shirt', '👕'],
      ['los pantalones', 'trousers', '👖'],
      ['el vestido', 'dress', '👗'],
      ['los zapatos', 'shoes', '👞'],
      ['las zapatillas', 'trainers', '👟'],
      ['el abrigo', 'coat', '🧥'],
      ['la gorra', 'cap', '🧢'],
      ['el sombrero', 'hat', '🎩'],
      ['la bufanda', 'scarf', '🧣'],
      ['los calcetines', 'socks', '🧦'],
      ['los guantes', 'gloves', '🧤'],
      ['las gafas', 'glasses', '👓'],
      ['los pantalones cortos', 'shorts', '🩳'],
      ['el bolso', 'handbag', '👜'],
    ],
    phrases: [
      ['Llevo una camiseta azul.', 'I’m wearing a blue T-shirt.'],
      ['Me gustan tus zapatillas.', 'I like your trainers.'],
      ['Hace frío, ponte el abrigo.', 'It’s cold, put your coat on.'],
      ['¿Dónde están mis gafas?', 'Where are my glasses?'],
    ],
    tips: [
      ['Llevar', '<b>Llevo</b> = I’m wearing. <b>Llevo unos vaqueros</b> = I’m wearing jeans.'],
    ],
  },
  {
    id: 'school', title: 'El colegio', sub: 'Classroom and subjects', emoji: '🎒', color: ['#34d399', '#0f766e'],
    words: [
      ['el libro', 'book', '📕'],
      ['el lápiz', 'pencil', '✏️'],
      ['el bolígrafo', 'pen', '🖊️'],
      ['la mochila', 'schoolbag', '🎒'],
      ['el cuaderno', 'exercise book', '📓'],
      ['las tijeras', 'scissors', '✂️'],
      ['la regla', 'ruler', '📏'],
      ['el ordenador', 'computer', '💻'],
      ['el colegio', 'school', '🏫'],
      ['el profesor', 'teacher (man)', '👨‍🏫'],
      ['la profesora', 'teacher (woman)', '👩‍🏫'],
      ['el examen', 'exam, test', '📝'],
      ['los deberes', 'homework', '🗒️'],
      ['las matemáticas', 'maths', '➗'],
      ['el inglés', 'English (subject)', '🇬🇧'],
      ['la música', 'music', '🎵'],
    ],
    phrases: [
      ['Tengo muchos deberes.', 'I have lots of homework.'],
      ['Mi asignatura favorita es el inglés.', 'My favourite subject is English.'],
      ['¿Me prestas un lápiz?', 'Can you lend me a pencil?'],
      ['El examen es mañana.', 'The exam is tomorrow.'],
    ],
    tips: [
      ['No capital letters', 'Languages and subjects don’t need capitals in Spanish: <b>el inglés</b>, <b>las matemáticas</b>.'],
    ],
  },
  {
    id: 'town', title: 'La ciudad', sub: 'Places around town', emoji: '🏙️', color: ['#94a3b8', '#475569'],
    words: [
      ['la casa', 'house, home', '🏠'],
      ['la tienda', 'shop', '🏪'],
      ['el parque', 'park', '🏞️'],
      ['la playa', 'beach', '🏖️'],
      ['el hospital', 'hospital', '🏥'],
      ['el restaurante', 'restaurant', '🍽️'],
      ['el cine', 'cinema', '🎬'],
      ['la biblioteca', 'library', '📚'],
      ['la estación', 'station', '🚉'],
      ['el supermercado', 'supermarket', '🛒'],
      ['el museo', 'museum', '🏛️'],
      ['la piscina', 'swimming pool', '🏊'],
      ['la calle', 'street', '🛣️'],
      ['el banco', 'bank', '🏦'],
      ['la ciudad', 'city, town', '🏙️'],
    ],
    phrases: [
      ['¿Dónde está la playa?', 'Where is the beach?'],
      ['Vivo en una casa grande.', 'I live in a big house.'],
      ['Vamos al cine.', 'Let’s go to the cinema.'],
      ['El parque está cerca.', 'The park is nearby.'],
    ],
    tips: [
      ['al = a + el', '<b>Vamos a el cine</b> squashes into <b>Vamos al cine</b>.'],
      ['Estar for places', 'Where something is uses <b>estar</b>: <b>¿Dónde está el banco?</b>'],
    ],
  },
  {
    id: 'weather', title: 'El tiempo', sub: 'Weather and seasons', emoji: '☀️', color: ['#fde047', '#0ea5e9'],
    words: [
      ['hace sol', 'it’s sunny', '☀️'],
      ['hace calor', 'it’s hot', '🥵'],
      ['hace frío', 'it’s cold', '🥶'],
      ['llueve', 'it’s raining', '🌧️'],
      ['nieva', 'it’s snowing', '❄️'],
      ['hace viento', 'it’s windy', '💨'],
      ['está nublado', 'it’s cloudy', '☁️'],
      ['hay tormenta', 'there’s a storm', '⛈️'],
      ['la primavera', 'spring', '🌷'],
      ['el verano', 'summer', '🏝️'],
      ['el otoño', 'autumn', '🍂'],
      ['el invierno', 'winter', '⛄'],
      ['el arcoíris', 'rainbow', '🌈'],
    ],
    phrases: [
      ['¿Qué tiempo hace?', 'What’s the weather like?'],
      ['Hoy hace mucho calor.', 'It’s very hot today.'],
      ['En invierno nieva.', 'In winter it snows.'],
      ['Me gusta el verano.', 'I like summer.'],
    ],
    tips: [
      ['Hace…', 'A lot of weather uses <b>hace</b> (“it makes”): <b>hace sol</b>, <b>hace frío</b>.'],
    ],
  },
  {
    id: 'time', title: 'Días y meses', sub: 'Days of the week and months', emoji: '📅', color: ['#c084fc', '#be185d'],
    words: [
      ['el lunes', 'Monday', 'Mon'],
      ['el martes', 'Tuesday', 'Tue'],
      ['el miércoles', 'Wednesday', 'Wed'],
      ['el jueves', 'Thursday', 'Thu'],
      ['el viernes', 'Friday', 'Fri'],
      ['el sábado', 'Saturday', 'Sat'],
      ['el domingo', 'Sunday', 'Sun'],
      ['hoy', 'today', '📍'],
      ['mañana', 'tomorrow', '➡️'],
      ['ayer', 'yesterday', '⬅️'],
      ['la semana', 'week', '🗓️'],
      ['el fin de semana', 'weekend', '🎉'],
      ['enero', 'January', 'Jan'],
      ['febrero', 'February', 'Feb'],
      ['marzo', 'March', 'Mar'],
      ['abril', 'April', 'Apr'],
      ['mayo', 'May', 'May'],
      ['junio', 'June', 'Jun'],
      ['julio', 'July', 'Jul'],
      ['agosto', 'August', 'Aug'],
      ['septiembre', 'September', 'Sep'],
      ['octubre', 'October', 'Oct'],
      ['noviembre', 'November', 'Nov'],
      ['diciembre', 'December', 'Dec'],
    ],
    phrases: [
      ['Hoy es lunes.', 'Today is Monday.'],
      ['Mi cumpleaños es en mayo.', 'My birthday is in May.'],
      ['El sábado juego al fútbol.', 'On Saturday I play football.'],
      ['¿Qué día es hoy?', 'What day is it today?'],
    ],
    tips: [
      ['No capital letters', 'Days and months are lower case in Spanish: <b>lunes</b>, <b>enero</b>.'],
      ['On Monday', '<b>El lunes</b> = on Monday. <b>Los lunes</b> = on Mondays (every Monday).'],
    ],
  },
  {
    id: 'verbs', title: 'Action verbs', sub: 'Eat, play, sleep, go…', emoji: '🏃', color: ['#f97316', '#9333ea'],
    words: [
      ['hablar', 'to speak', '🗣️'],
      ['comer', 'to eat', '😋'],
      ['beber', 'to drink', '🥤'],
      ['vivir', 'to live', '🏡'],
      ['jugar', 'to play', '🎮'],
      ['dormir', 'to sleep', '😴'],
      ['leer', 'to read', '📖'],
      ['escribir', 'to write', '✍️'],
      ['correr', 'to run', '🏃'],
      ['nadar', 'to swim', '🏊'],
      ['cantar', 'to sing', '🎤'],
      ['bailar', 'to dance', '💃'],
      ['escuchar', 'to listen', '🎧'],
      ['mirar', 'to look, to watch', '👀'],
      ['ir', 'to go', '🚶'],
      ['tener', 'to have', '🤲'],
      ['querer', 'to want, to love', '💖'],
      ['hacer', 'to do, to make', '🛠️'],
    ],
    phrases: [
      ['Hablo español.', 'I speak Spanish.'],
      ['Como una manzana.', 'I eat an apple.'],
      ['Vivo en Londres.', 'I live in London.'],
      ['Juego al fútbol.', 'I play football.'],
      ['Leo un libro.', 'I read a book.'],
      ['Quiero ir al parque.', 'I want to go to the park.'],
    ],
    tips: [
      ['“I” ends in -o', 'To say what <i>you</i> do, most verbs drop -ar/-er/-ir and add <b>-o</b>: hablar → <b>hablo</b>, comer → <b>como</b>, vivir → <b>vivo</b>.'],
      ['No “I” needed', 'The ending already says who: <b>Hablo</b> = I speak. You don’t need <b>yo</b>.'],
    ],
  },
  {
    id: 'hobbies', title: 'Hobbies', sub: 'Sports and free time', emoji: '⚽', color: ['#22c55e', '#0891b2'],
    words: [
      ['el fútbol', 'football', '⚽'],
      ['el baloncesto', 'basketball', '🏀'],
      ['el tenis', 'tennis', '🎾'],
      ['la natación', 'swimming', '🏊'],
      ['los videojuegos', 'video games', '🎮'],
      ['el dibujo', 'drawing', '✏️'],
      ['la lectura', 'reading', '📖'],
      ['el ciclismo', 'cycling', '🚴'],
      ['el ajedrez', 'chess', '♟️'],
      ['la televisión', 'TV', '📺'],
      ['el deporte', 'sport', '🏅'],
      ['el monopatín', 'skateboard', '🛹'],
      ['la guitarra', 'guitar', '🎸'],
      ['la cocina', 'cooking', '🍳'],
    ],
    phrases: [
      ['Me encanta el fútbol.', 'I love football.'],
      ['Juego a los videojuegos.', 'I play video games.'],
      ['¿Qué te gusta hacer?', 'What do you like doing?'],
      ['Toco la guitarra.', 'I play the guitar.'],
    ],
    tips: [
      ['Jugar or tocar?', 'You <b>juegas</b> games and sports, but you <b>tocas</b> an instrument: <b>toco la guitarra</b>.'],
    ],
  },
  {
    id: 'questions', title: 'Preguntas', sub: 'Who, what, where, why?', emoji: '❓', color: ['#f43f5e', '#7c3aed'],
    words: [
      ['¿qué?', 'what?', '❓'],
      ['¿quién?', 'who?', '🕵️'],
      ['¿dónde?', 'where?', '📍'],
      ['¿cuándo?', 'when?', '⏰'],
      ['¿por qué?', 'why?', '🤔'],
      ['¿cómo?', 'how?', '🔧'],
      ['¿cuánto?', 'how much?', '💰'],
      ['¿cuántos?', 'how many?', '🔢'],
      ['¿cuál?', 'which?', '👉'],
      ['porque', 'because', '💡'],
    ],
    phrases: [
      ['¿Dónde vives?', 'Where do you live?'],
      ['¿Qué hora es?', 'What time is it?'],
      ['¿Por qué estás triste?', 'Why are you sad?'],
      ['¿Cuánto cuesta?', 'How much does it cost?'],
      ['¿Quién es?', 'Who is it?'],
    ],
    tips: [
      ['Accents on questions', 'Question words have an accent: <b>¿qué?</b>, <b>¿dónde?</b>. <b>¿Por qué?</b> = why, but <b>porque</b> = because.'],
    ],
  },
];

// ---------------------------------------------------------------- one list of everything
// Every word in the app in the shape the games use: m/f (Spanish), en,
// short, e (emoji), unit, adj, plus v/o/s/clue/tip for adjectives and
// art (el/la/los/las) for nouns. bare is the word without its article.
const ARTICLE = /^(el|la|los|las)\s+/i;
(function buildVocab() {
  const extra = [];
  for (const unit of COURSE) {
    if (unit.adjectives) {
      unit.items = WORDS.filter((w) => w.c === unit.adjectives);
      unit.items.forEach((w) => { w.unit = unit.id; w.adj = true; w.bare = w.m; });
      continue;
    }
    unit.items = unit.words.map(([es, en, e]) => {
      const art = (es.match(ARTICLE) || [])[1] || null;
      if (WORD_BY_ID[es]) throw new Error('word listed twice: ' + es);
      return {
        id: es, m: es, f: es, en, short: en.split(',')[0].trim(), e, c: unit.id, unit: unit.id,
        inv: true, adj: false, v: 'ser', bare: es.replace(ARTICLE, ''), art,
        plural: !!art && /s$/i.test(art),
      };
    });
    unit.items.forEach((w) => { WORD_BY_ID[w.id] = w; });
    extra.push(...unit.items);
  }
  WORDS.push(...extra);
  WORDS.forEach((w, i) => { w.idx = i; });
})();
const UNIT_BY_ID = Object.fromEntries(COURSE.map((u) => [u.id, u]));
const unitOf = (w) => UNIT_BY_ID[w.unit];
const unitNumber = (unit) => COURSE.indexOf(unit) + 1;
// A word that is a single run of letters, so it can be spelled with tiles.
const spellable = (w) => /^[a-záéíóúüñ]{2,11}$/i.test(w.bare);

// Words to practise in the games: everything, the words from lessons you've
// finished, or one unit.
PACKS.length = 0;
PACKS.push(
  { id: 'all', name: 'Everything', emoji: '🌍', test: () => true },
  { id: 'mine', name: 'My words', emoji: '✅', test: (w) => learnedIds().has(w.id) },
  ...COURSE.map((u) => ({ id: u.id, name: u.title, emoji: u.emoji, test: (w) => w.unit === u.id })),
);

// Lower case without punctuation, for comparing typed or built answers.
const normText = (s) => s.toLowerCase().replace(/[¿?¡!.,;:"“”]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

// One example sentence that uses w, or null.
function exampleFor(w, subject) {
  if (w.adj) {
    const s = makeSentence(w, { plain: true, subject: subject || SUBJECTS[w.inv ? 0 : 1] });
    return { es: s.es, en: s.en };
  }
  const u = unitOf(w);
  if (!u || !u.phrases) return null;
  const key = normText(w.bare);
  const p = u.phrases.find(([es]) => normText(es).split(' ').includes(key)) || u.phrases.find(([es]) => normText(es).includes(key));
  return p ? { es: p[0], en: p[1] } : null;
}

// Sentences for building with word tiles: fixed ones for most units, made up
// on the spot for the adjective units. Ones using `words` come first.
function unitPhrases(unit, n = 2, words = []) {
  if (unit.adjectives) {
    const pool = words.length ? words : unit.items;
    // Made-up sentences; the spare tiles are the wrong ending, the wrong verb
    // and other meanings.
    return shuffle(pool).slice(0, n).map((w) => {
      const s = makeSentence(w);
      const spareEs = [!w.inv && form(w, s.subj.g === 'f' ? 'm' : 'f'), w.v !== 'both' && (s.verb === 'es' ? 'está' : 'es')].filter(Boolean);
      const spareEn = distractors(w, 2).map((d) => d.short.split(' ')[0]).filter((t) => !normText(s.en).split(' ').includes(normText(t)));
      return { es: s.es, en: s.en, word: w, spareEs, spareEn };
    });
  }
  const uses = (es) => words.some((w) => normText(es).includes(normText(w.bare)));
  const sorted = [...shuffle(unit.phrases.filter(([es]) => uses(es))), ...shuffle(unit.phrases.filter(([es]) => !uses(es)))];
  return sorted.slice(0, n).map(([es, en]) => ({ es, en, word: words.find((w) => normText(es).includes(normText(w.bare))) || null }));
}

// Grammar tips for a unit as [title, html, examples].
function unitTips(unit) {
  const own = (unit.tips || []).map(([title, html]) => ({ title, body: html, emoji: '💡', examples: [] }));
  return [...(unit.grammar || []).map((k) => GRAMMAR_TIPS[k]), ...own];
}

// ---------------------------------------------------------------- the path
// Each unit is split into lessons of about five new words (at most six
// lessons), then a review of the whole unit.
function unitLessons(unit) {
  if (unit._lessons) return unit._lessons;
  const items = unit.items;
  const k = Math.max(1, Math.min(6, Math.ceil(items.length / 5)));
  const groups = Array.from({ length: k }, (_, g) => items.slice(Math.round((g * items.length) / k), Math.round(((g + 1) * items.length) / k)));
  unit._lessons = [
    ...groups.map((words, i) => ({ id: `${unit.id}-${i + 1}`, unit, n: i + 1, words, kind: 'learn' })),
    { id: `${unit.id}-review`, unit, n: groups.length + 1, words: items, kind: 'review' },
  ];
  return unit._lessons;
}
const ALL_LESSONS = () => COURSE.flatMap(unitLessons);
const LESSON_BY_ID = () => Object.fromEntries(ALL_LESSONS().map((l) => [l.id, l]));
const courseData = () => (Store.data.course || (Store.data.course = {}));
const lessonDone = (id) => !!courseData()[id];
// A lesson opens once the one before it (in the whole course) is done.
function lessonOpen(lesson) {
  const all = ALL_LESSONS();
  const i = all.findIndex((l) => l.id === lesson.id);
  return i <= 0 || lessonDone(all[i - 1].id) || lessonDone(lesson.id);
}
const nextLesson = () => ALL_LESSONS().find((l) => !lessonDone(l.id)) || null;
const unitProgress = (unit) => { const ls = unitLessons(unit); return [ls.filter((l) => lessonDone(l.id)).length, ls.length]; };
const lessonsDoneCount = () => ALL_LESSONS().filter((l) => lessonDone(l.id)).length;
// Every word from a lesson you've finished.
function learnedIds() {
  const out = new Set();
  for (const l of ALL_LESSONS()) if (l.kind === 'learn' && lessonDone(l.id)) l.words.forEach((w) => out.add(w.id));
  return out;
}

// ---------------------------------------------------------------- the mountain
// The course is a mountain, Monte Español: every lesson climbs higher, each
// unit is a camp on the way up, and you pass the heights of real mountains.
const SUMMIT = 9000;
const LANDMARKS = [
  ['Snowdon', 1085, '🏴󠁧󠁢󠁷󠁬󠁳󠁿'], ['Ben Nevis', 1345, '🏴󠁧󠁢󠁳󠁣󠁴󠁿'], ['Mulhacén', 3479, '🇪🇸'], ['Teide', 3715, '🇪🇸'],
  ['Mont Blanc', 4806, '🇫🇷'], ['Kilimanjaro', 5895, '🇹🇿'], ['Aconcagua', 6961, '🇦🇷'], ['Everest', 8849, '🇳🇵'],
];
// Height in metres after finishing lesson number i (0-based) of the course.
const lessonHeight = (i, n = ALL_LESSONS().length) => Math.round((SUMMIT * (i + 1)) / n);
const metres = (m) => m.toLocaleString('en-GB') + ' m';
function myHeight() {
  const all = ALL_LESSONS();
  let top = 0;
  all.forEach((l, i) => { if (lessonDone(l.id)) top = Math.max(top, lessonHeight(i, all.length)); });
  return top;
}


// Coins for climbing: 10 for every 100 m, and a chest of 100 for every real
// mountain you climb past. Each height is paid out once.
const COINS_PER_100M = 10, CHEST_COINS = 100;
function claimClimb() {
  const d = Store.data;
  const before = d.climbed || 0, after = myHeight();
  if (after <= before) return { coins: 0, passed: [] };
  const passed = LANDMARKS.filter(([, m]) => m > before && m <= after);
  const coins = (Math.floor(after / 100) - Math.floor(before / 100)) * COINS_PER_100M + passed.length * CHEST_COINS;
  d.climbed = after;
  d.coins = (d.coins || 0) + coins;
  return { coins, passed, before, after };
}

// Climbers you can buy with coins; they show where you are on the mountain.
const CLIMBERS = [
  { e: '🧗', name: 'Climber', cost: 0 }, { e: '🐐', name: 'Mountain goat', cost: 100 }, { e: '🦙', name: 'Llama', cost: 150 },
  { e: '🐻‍❄️', name: 'Polar bear', cost: 200 }, { e: '🦅', name: 'Eagle', cost: 250 }, { e: '🐧', name: 'Penguin', cost: 300 },
  { e: '🤖', name: 'Robot', cost: 400 }, { e: '🧙', name: 'Wizard', cost: 500 }, { e: '🐉', name: 'Dragon', cost: 750 }, { e: '🦄', name: 'Unicorn', cost: 1000 },
];
const myClimber = () => Store.data.climber || '🧗';
