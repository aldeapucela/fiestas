const CHATGPT_URL = 'https://chatgpt.com/';
const MAX_QUESTION_LENGTH = 500;

const root = document.querySelector('[data-fiestas-chatbot-dialog]');
const openButton = document.querySelector('[data-fiestas-chatbot-open]');

if (root && openButton) {
  const form = root.querySelector('[data-fiestas-chatbot-form]');
  const questionInput = root.querySelector('[data-fiestas-chatbot-question]');
  const closeButton = root.querySelector('[data-fiestas-chatbot-close]');
  const voiceButton = root.querySelector('[data-fiestas-chatbot-voice]');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let returnFocus = null;
  let recognition = null;
  let isListening = false;
  let voiceBaseText = '';
  let voiceFinalText = '';
  let voiceInterimText = '';
  let voiceSilenceTimer = null;

  const buildPrompt = (question) => `Responde a la consulta del usuario: "${question}"

Antes de responder, busca y revisa directamente fiestas.aldeapucela.org. No decidas que falta información sin haber revisado las fichas individuales, especialmente las URL que contienen /e/, y la sección fiestas.aldeapucela.org/planes cuando pueda contener planes relacionados. Esta búsqueda en fiestas.aldeapucela.org es obligatoria y debe hacerse antes de consultar cualquier otra fuente.

Primero clasifica la intención de la consulta:
- Si pide descargar, localizar o consultar un PDF, programa, folleto, cartel, calendario, mapa o documento, trátala como una búsqueda documental. Busca el archivo descargable o la página oficial que lo ofrece y devuelve ese enlace. No sustituyas el documento por enlaces a actividades ni por una lista de eventos. Si no encuentras el PDF o documento en fiestas.aldeapucela.org, consulta directamente la web oficial del Ayuntamiento de Valladolid, limitada a información reciente de 2026, y ofrece el documento o enlace oficial si existe. Para este tipo de consulta no es obligatorio devolver 5 resultados.
- Si pide actividades, horarios, lugares, recomendaciones o planes, trátala como una búsqueda de actividades.

Para consultas de actividades, selecciona entre 5 y 10 resultados relevantes siempre que existan y comprueba que cada uno tenga fecha y hora verificables. En la primera respuesta intenta resolver la consulta completa: devuelve todas las coincidencias válidas que encuentres, hasta 10, con todos los datos solicitados; no te detengas en dos resultados si hay más opciones válidas.

Reglas:
- Usa información y enlaces de fiestas.aldeapucela.org siempre que estén disponibles.
- Si después de revisar fiestas.aldeapucela.org sigue faltando información, consulta únicamente la web oficial del Ayuntamiento de Valladolid y solo información reciente de 2026 sobre estas fiestas; descarta cualquier información de otros años.
- No uses, cites ni menciones ninguna web distinta de fiestas.aldeapucela.org y, solo como excepción, la web oficial del Ayuntamiento de Valladolid.
- No inventes actividades, fechas, horarios, precios, lugares ni enlaces.
- Si no encuentras la información después de revisar ambas fuentes, dilo claramente: no afirmes que no existe, porque puede no estar indexada todavía. Indica que el usuario puede utilizar la búsqueda de la web de Fiestas y enlaza directamente a https://fiestas.aldeapucela.org/?q=<consulta-codificada>, sustituyendo <consulta-codificada> por los términos relevantes de la pregunta. No inventes resultados.
- En una consulta documental, no enlaces fichas /e/ ni planes como sustituto del archivo solicitado.
- Incluye siempre en cada resultado el día de la semana, la fecha exacta de 2026, la hora de inicio y la hora de fin cuando esté disponible.
- Incluye también el lugar y la condición de acceso o precio cuando estén publicados y verificados; si no constan, no los inventes.
- Si la consulta menciona un día de la semana sin una fecha concreta y hay varias coincidencias (por ejemplo, varios sábados), indica la fecha completa en cada resultado y no mezcles sus horarios.
- Incluye enlaces a páginas temáticas de /planes solo cuando estén claramente relacionadas con la pregunta.
- Da preferencia a fichas individuales de actividades.
- No enlaces a la portada, el mapa ni a la agenda general.

Formato obligatorio:
- Empieza con una única frase corta, de máximo 20 palabras.
- Para una consulta documental, después de la frase muestra únicamente los enlaces directos al PDF, documento o página oficial de descarga encontrados; el texto del enlace debe describir claramente el documento. No muestres actividades, lugares, horarios ni resultados de relleno.
- Para una consulta de actividades, después de la frase muestra una lista de 5 a 10 resultados.
- Cada resultado de actividades debe incluir, en este orden: día de la semana, fecha completa de 2026, hora de inicio —y hora de fin si existe—, lugar, condición de acceso o precio si consta y un enlace directo corto a la ficha individual.
- El texto del enlace de una actividad debe ser el nombre de la actividad y la URL debe usar el formato corto https://fiestas.aldeapucela.org/e/<slug>/.
- No incluyas descripciones largas, fuentes, introducciones, conclusiones ni texto adicional; solo una breve nota de relevancia cuando sea necesaria para explicar por qué encaja con la consulta.
- Si hay menos de 5 resultados válidos para una consulta de actividades, muestra todos los que encuentres sin inventar ninguno.
- Si no hay ningún resultado válido, aplica la regla de búsqueda directa de la web y no muestres una lista vacía.`;

  const buildChatUrl = (question) => {
    const url = new URL(CHATGPT_URL);
    url.searchParams.set('q', buildPrompt(question));
    return url.toString();
  };

  const setOpenState = (isOpen) => {
    root.hidden = !isOpen;
    openButton.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('fiestas-chatbot-open', isOpen);
  };

  const close = () => {
    if (isListening) recognition?.stop();
    setOpenState(false);
    const trigger = returnFocus || openButton;
    returnFocus = null;
    trigger.focus({ preventScroll: true });
  };

  const open = (trigger = openButton) => {
    returnFocus = trigger;
    setOpenState(true);
    questionInput?.focus({ preventScroll: true });
  };

  const normalizeVoiceText = (...parts) => parts
    .flat()
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const updateVoiceValue = () => {
    if (!questionInput) return;
    questionInput.value = normalizeVoiceText(voiceBaseText, voiceFinalText, voiceInterimText).slice(0, MAX_QUESTION_LENGTH);
  };

  const clearVoiceSilenceTimer = () => {
    if (voiceSilenceTimer) window.clearTimeout(voiceSilenceTimer);
    voiceSilenceTimer = null;
  };

  const setListeningState = (listening) => {
    isListening = listening;
    voiceButton?.classList.toggle('is-listening', listening);
    voiceButton?.setAttribute('aria-pressed', String(listening));
    voiceButton?.setAttribute('aria-label', listening ? 'Detener dictado' : 'Dictar pregunta');
    if (voiceButton) voiceButton.title = listening ? 'Detener dictado' : 'Dictar pregunta';
  };

  if (voiceButton && SpeechRecognition && questionInput) {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    voiceButton.hidden = false;

    recognition.addEventListener('start', () => setListeningState(true));
    recognition.addEventListener('result', (event) => {
      let finalResult = '';
      let interimResult = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalResult = normalizeVoiceText(finalResult, transcript);
        else interimResult = normalizeVoiceText(interimResult, transcript);
      }
      if (finalResult) voiceFinalText = normalizeVoiceText(voiceFinalText, finalResult);
      voiceInterimText = interimResult;
      updateVoiceValue();
      clearVoiceSilenceTimer();
      voiceSilenceTimer = window.setTimeout(() => recognition?.stop(), 1400);
    });
    recognition.addEventListener('end', () => {
      clearVoiceSilenceTimer();
      voiceInterimText = '';
      updateVoiceValue();
      voiceBaseText = questionInput.value.trim();
      voiceFinalText = '';
      setListeningState(false);
    });
    recognition.addEventListener('error', () => {
      clearVoiceSilenceTimer();
      voiceInterimText = '';
      updateVoiceValue();
      voiceBaseText = questionInput.value.trim();
      voiceFinalText = '';
      setListeningState(false);
    });

    voiceButton.addEventListener('click', () => {
      if (isListening) {
        recognition.stop();
        return;
      }
      voiceBaseText = questionInput.value.trim();
      voiceFinalText = '';
      voiceInterimText = '';
      try {
        recognition.start();
      } catch {
        setListeningState(false);
      }
    });
  }

  openButton.addEventListener('click', () => {
    if (root.hidden) open();
    else close();
  });
  closeButton?.addEventListener('click', close);

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = String(questionInput?.value || '').trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) {
      questionInput?.focus({ preventScroll: true });
      return;
    }
    const chatLink = document.createElement('a');
    chatLink.href = buildChatUrl(question);
    chatLink.target = '_blank';
    chatLink.rel = 'noopener noreferrer';
    chatLink.click();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!root.hidden && !root.contains(event.target) && !openButton.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) close();
  });

  setOpenState(false);
}
