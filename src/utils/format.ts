export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${date}T00:00:00+07:00`));
export const formatTimestamp = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));
export const isFutureSlot = (date: string, time: string) =>
  new Date(`${date}T${time}:00+07:00`).getTime() > Date.now();
