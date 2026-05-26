export function normalizePlanDisplayTitle(title: string) {
  return title.replace(/\b(Unit|Stage) (\d{1,2}) - /g, (_match, kind: string, number: string) => `${kind} ${number.padStart(2, "0")}: `);
}
