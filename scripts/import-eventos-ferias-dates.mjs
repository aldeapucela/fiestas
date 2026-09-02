const DAY_MS = 24 * 60 * 60 * 1000;

export function occurrenceDatesFor(remote, verifiedOccurrences = {}, options = {}) {
  const startDate = datePart(remote.startsAt);
  const endDate = datePart(remote.endsAt);
  const maxDate = options.maxDate || null;

  if (!startDate) {
    return {
      dates: [],
      verified: false,
      reason: 'La fuente no proporciona una fecha de inicio válida.'
    };
  }

  if (!isDailySeries(remote)) {
    return {
      dates: [startDate],
      verified: true,
      source: 'Fecha de inicio de la fuente remota'
    };
  }

  const verification = verifiedOccurrences[String(remote.id)];
  const dates = Array.isArray(verification) ? verification : verification?.dates;
  if (!Array.isArray(dates) || !dates.length) {
    return {
      dates: datesBetween(startDate, endDate, maxDate),
      verified: false,
      reason: 'El intervalo remoto no demuestra que el evento ocurra cada día; falta una lista de fechas concretas verificada.'
    };
  }

  const normalizedDates = [...new Set(dates.map((date) => String(date).slice(0, 10)))].sort();
  const invalidDate = normalizedDates.find((date) => !/^2026-\d{2}-\d{2}$/.test(date));
  const outsideRange = normalizedDates.find((date) => date < startDate || (endDate && date > endDate));
  if (invalidDate || outsideRange) {
    return {
      dates: datesBetween(startDate, endDate, maxDate),
      verified: false,
      reason: invalidDate
        ? `La lista verificada contiene una fecha inválida: ${invalidDate}.`
        : `La lista verificada contiene una fecha fuera del intervalo remoto: ${outsideRange}.`
    };
  }

  return {
    dates: maxDate ? normalizedDates.filter((date) => date <= maxDate) : normalizedDates,
    verified: true,
    source: typeof verification === 'object' ? verification.source : 'Lista de fechas concretas verificada'
  };
}

export function occurrencesFor(remote, verifiedOccurrences = {}, options = {}) {
  const dateResolution = occurrenceDatesFor(remote, verifiedOccurrences, options);
  const verification = verifiedOccurrences[String(remote.id)];
  const configuredOccurrences = verification && typeof verification === 'object'
    ? verification.occurrences
    : null;

  if (!dateResolution.verified || !Array.isArray(configuredOccurrences)) {
    return {
      ...dateResolution,
      occurrences: dateResolution.dates.map((date) => ({ date }))
    };
  }

  const occurrences = configuredOccurrences.map(normalizeOccurrence);
  const validDates = new Set(dateResolution.dates);
  const invalidOccurrence = occurrences.find((occurrence) => !validDates.has(occurrence.date));
  const missingDate = dateResolution.dates.find((date) => !occurrences.some((occurrence) => occurrence.date === date));
  const duplicateKeys = new Set();
  const duplicateOccurrence = occurrences.find((occurrence) => {
    const key = [occurrence.date, occurrence.startTime || '', occurrence.endTime || '', occurrence.location || ''].join('|');
    if (duplicateKeys.has(key)) return true;
    duplicateKeys.add(key);
    return false;
  });

  if (invalidOccurrence || missingDate || duplicateOccurrence) {
    return {
      dates: dateResolution.dates,
      verified: false,
      reason: invalidOccurrence
        ? `La lista de ocurrencias contiene una fecha fuera de las fechas verificadas: ${invalidOccurrence.date}.`
        : missingDate
          ? `Falta una ocurrencia para la fecha verificada ${missingDate}.`
          : 'La lista de ocurrencias contiene una ocurrencia duplicada.',
      occurrences
    };
  }

  return {
    ...dateResolution,
    occurrences
  };
}

export function isDailySeries(remote) {
  const startDate = datePart(remote.startsAt);
  const endDate = datePart(remote.endsAt);
  if (!startDate || startDate === endDate) return false;
  const duration = Date.parse(remote.endsAt) - Date.parse(remote.startsAt);
  return !Number.isFinite(duration) || duration >= DAY_MS;
}

function datesBetween(startDate, endDate, maxDate = null) {
  if (!startDate || !endDate || endDate < startDate) return startDate ? [startDate] : [];
  const lastDate = maxDate && maxDate < endDate ? maxDate : endDate;
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${lastDate}T00:00:00Z`);
  const dates = [];
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function datePart(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function normalizeOccurrence(value = {}) {
  const occurrence = {
    date: String(value.date || '').slice(0, 10)
  };
  for (const key of ['key', 'startTime', 'endTime', 'location', 'performances']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      occurrence[key] = Array.isArray(value[key]) ? [...value[key]] : value[key];
    }
  }
  return occurrence;
}
