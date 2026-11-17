/** Strict ISO calendar timestamp; reject Date.parse's rollover/short-date coercions. */
export function timestamp(value) {
  if (typeof value !== 'string') return NaN;
  const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return NaN;
  const [year,month,day,hour,minute,second]=parts.slice(1,7).map(Number);
  if (month<1||month>12||day<1||day>31||hour>23||minute>59||second>59) return NaN;
  const calendar=new Date(0); calendar.setUTCFullYear(year,month-1,day);
  if (calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day) return NaN;
  return Date.parse(value);
}
