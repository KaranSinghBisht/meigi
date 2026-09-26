/** A short address (0x9B4f…47e4, or with three dots) or a T-number: the tokens that must never break mid-string. */
const TOKEN = /(0x[0-9a-fA-F]{2,10}(?:…|\.\.\.)[0-9a-fA-F]{2,10}|T\d{13})/

/**
 * Prose from a service (a kernel check, a hold reason, the worded verdict) with its short tokens kept on one line.
 * Full-length addresses still wrap, so a narrow screen never scrolls sideways.
 */
export function TokenText({ text }: { readonly text: string }) {
  const parts = text.split(TOKEN)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}
