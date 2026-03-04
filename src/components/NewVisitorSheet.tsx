'use client'

import { useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (visitor: {
    first_name: string
    last_name: string
    phone?: string
    email?: string
    visitor_type: string
    referral_source?: string
  }, checkIn: boolean) => Promise<void>
}

export default function NewVisitorSheet({ open, onClose, onSave }: Props) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [visitorType, setVisitorType] = useState('first_time')
  const [referralSource, setReferralSource] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setFirstName('')
    setLastName('')
    setPhone('')
    setEmail('')
    setVisitorType('first_time')
    setReferralSource('')
  }

  const handleSave = async (checkIn: boolean) => {
    if (!firstName.trim() || !lastName.trim()) return
    setSaving(true)
    try {
      await onSave({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        visitor_type: visitorType,
        referral_source: referralSource || undefined,
      }, checkIn)
      reset()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 fade-in" onClick={onClose} />

      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl slide-up max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-8">
          <h2 className="text-xl font-bold text-[#10454f] mb-1">New Visitor</h2>
          <p className="text-sm text-gray-500 mb-5">Add a new person to the directory</p>

          {/* Visitor Type */}
          <div className="flex gap-2 mb-5">
            {[
              { value: 'first_time', label: 'First Time' },
              { value: 'returning', label: 'Returning' },
              { value: 'family', label: 'Family' },
            ].map((type) => (
              <button
                key={type.value}
                onClick={() => setVisitorType(type.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  visitorType === type.value
                    ? 'bg-[#3a9ca1] text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">First Name *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="w-full px-4 py-3 bg-gray-50 rounded-xl text-[#10454f] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3a9ca1]/30"
                autoCapitalize="words"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Last Name *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="w-full px-4 py-3 bg-gray-50 rounded-xl text-[#10454f] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3a9ca1]/30"
                autoCapitalize="words"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full px-4 py-3 bg-gray-50 rounded-xl text-[#10454f] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3a9ca1]/30"
            />
          </div>

          {/* Email */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-4 py-3 bg-gray-50 rounded-xl text-[#10454f] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3a9ca1]/30"
            />
          </div>

          {/* How did you hear about us */}
          <div className="mb-6">
            <label className="text-xs font-medium text-gray-500 mb-1 block">How did you hear about us?</label>
            <select
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl text-[#10454f] focus:outline-none focus:ring-2 focus:ring-[#3a9ca1]/30 appearance-none"
            >
              <option value="">Select...</option>
              <option value="friend">Friend / Family</option>
              <option value="online">Online Search</option>
              <option value="social_media">Social Media</option>
              <option value="drive_by">Drove By</option>
              <option value="event">Community Event</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleSave(false)}
              disabled={!firstName.trim() || !lastName.trim() || saving}
              className="flex-1 py-4 border-2 border-[#3a9ca1] text-[#3a9ca1] rounded-2xl font-semibold disabled:opacity-30 transition-all active:scale-95"
            >
              Save for Later
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={!firstName.trim() || !lastName.trim() || saving}
              className="flex-1 py-4 bg-[#3a9ca1] text-white rounded-2xl font-semibold disabled:opacity-30 transition-all active:scale-95"
            >
              {saving ? 'Saving...' : 'Save & Check In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
