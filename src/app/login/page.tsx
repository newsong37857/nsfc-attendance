'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    if (pin.length < 4) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })

    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError('Invalid PIN')
      setPin('')
      setLoading(false)
    }
  }

  const handleKeyPress = (digit: string) => {
    if (pin.length < 6) {
      const newPin = pin + digit
      setPin(newPin)
      setError('')
    }
  }

  const handleDelete = () => {
    setPin(pin.slice(0, -1))
    setError('')
  }

  return (
    <div className="min-h-screen bg-[#10454f] flex flex-col items-center justify-center px-6">
      {/* Logo / Church Name */}
      <div className="text-center mb-12">
        <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-[#3a9ca1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m-7-9H4m16 0h1M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white">New Song Fellowship</h1>
        <p className="text-[#3a9ca1] mt-1">Attendance Check-In</p>
      </div>

      {/* PIN Dots */}
      <div className="flex gap-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all duration-200 ${
              i < pin.length ? 'bg-[#3a9ca1] scale-110' : 'bg-white/20'
            }`}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-300 text-sm mb-4 animate-pulse">{error}</p>
      )}

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-4 max-w-[280px] w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
          if (key === '') return <div key="empty" />
          if (key === 'del') {
            return (
              <button
                key="del"
                onClick={handleDelete}
                className="w-20 h-20 rounded-full flex items-center justify-center text-white/60 active:bg-white/10 transition-colors mx-auto"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
                </svg>
              </button>
            )
          }
          return (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              disabled={loading}
              className="w-20 h-20 rounded-full bg-white/10 text-white text-2xl font-light flex items-center justify-center active:bg-white/20 transition-colors mx-auto disabled:opacity-50"
            >
              {key}
            </button>
          )
        })}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={pin.length < 4 || loading}
        className="mt-8 w-full max-w-[280px] py-4 bg-[#3a9ca1] text-white rounded-2xl font-semibold text-lg disabled:opacity-30 transition-all active:scale-95"
      >
        {loading ? 'Checking...' : 'Enter'}
      </button>
    </div>
  )
}
