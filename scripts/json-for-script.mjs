export function jsonForScript(value) {
  const json = JSON.stringify(value);
  if (json === undefined) return 'null';

  return json
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}
