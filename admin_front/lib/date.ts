export function formatJstTimestamp(value: string | null | undefined): string {
  if (!value) return "--/--/-- --:--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--/--/-- --:--"

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${partMap.year}/${partMap.month}/${partMap.day} ${partMap.hour}:${partMap.minute}`
}
