// Text whose characters slide in when they change (a ticking clock or countdown).
// Each character is keyed by its value, so a change remounts it and plays the
// entrance (.oxy-dg-in in oxygen.css). Layout stays the same as plain text.
export default function RollDigits({ text }) {
  return (
    <span className="oxy-dg-row" aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} className="oxy-dg" aria-hidden="true">
          <i key={ch} className="oxy-dg-in">{ch}</i>
        </span>
      ))}
    </span>
  )
}
