interface ThresholdPickerProps {
  readonly max: number
  readonly value: number
  readonly onChange: (threshold: number) => void
}

/** How many of the enrolled officers must approve each change: a segmented choice, 1 of n … n of n. */
export function ThresholdPicker({ max, value, onChange }: ThresholdPickerProps) {
  return (
    <fieldset className="threshold">
      <legend className="threshold__legend">Approvals needed for each change</legend>
      <div className="threshold__options">
        {Array.from({ length: max }, (_, index) => index + 1).map((n) => (
          <label key={n} className="threshold__option">
            <input type="radio" name="threshold" value={n} checked={value === n} onChange={() => onChange(n)} />
            <span>
              {n} of {max}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
