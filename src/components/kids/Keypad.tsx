'use client'

/** Digits 1–9, 0 and backspace, sized for one free hand. */
export default function Keypad({
  onDigit,
  onDelete,
  disabled,
}: {
  onDigit: (d: string) => void
  onDelete: () => void
  disabled?: boolean
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
  return (
    <div className="grid grid-cols-3 gap-4 w-full max-w-[400px]" role="group" aria-label="Number pad">
      {keys.map((k) => {
        if (k === '') return <div key="blank" />
        if (k === 'del') {
          return (
            <button
              key="del"
              type="button"
              disabled={disabled}
              onClick={onDelete}
              aria-label="Delete last digit"
              className="kids-key flex items-center justify-center !bg-transparent !border-transparent disabled:opacity-40"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75 14.25 12m0 0 2.25 2.25M14.25 12l2.25-2.25M14.25 12 12 14.25m-2.58 4.92-6.374-6.375a1.125 1.125 0 0 1 0-1.59L9.42 4.83c.21-.211.497-.33.795-.33H19.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25h-9.284c-.298 0-.585-.119-.795-.33Z" />
              </svg>
            </button>
          )
        }
        return (
          <button key={k} type="button" disabled={disabled} onClick={() => onDigit(k)} className="kids-key disabled:opacity-40">
            {k}
          </button>
        )
      })}
    </div>
  )
}
