function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function eachWorkingDay(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    if (!isWeekend(cur)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function sprintDayIndex(startDate: string, asOfDate: string): number {
  return eachWorkingDay(parseDate(startDate), parseDate(asOfDate));
}

export function workingDaysBetween(startDate: string, endDate: string): number {
  return eachWorkingDay(parseDate(startDate), parseDate(endDate));
}

export function workingDaysUntil(
  sprintStart: string,
  asOfDate: string,
  freezeDay: number,
): number {
  const start = parseDate(sprintStart);
  let day = 0;
  const cur = new Date(start);
  let freezeDate = new Date(start);
  while (day < freezeDay) {
    if (!isWeekend(cur)) day++;
    if (day < freezeDay) cur.setUTCDate(cur.getUTCDate() + 1);
    freezeDate = new Date(cur);
  }
  const asOf = parseDate(asOfDate);
  if (asOf >= freezeDate) return 0;
  return eachWorkingDay(asOf, freezeDate) - 1;
}
