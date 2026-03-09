'use client'

import { useState } from 'react'

const CHECKIN_URL = 'https://checkin.newsongtn.cc/self'
const QR_API_URL = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(CHECKIN_URL)}`

export default function QRCodePage() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(CHECKIN_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(QR_API_URL)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nsfc-checkin-qr.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(QR_API_URL, '_blank')
    }
  }

  return (
    <div className="min-h-screen bg-[#fffff0] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="w-16 h-16 rounded-full bg-[#10454f] flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
          NS
        </div>
        <h1 className="text-2xl font-bold text-[#10454f] mb-1">Self Check-In QR Code</h1>
        <p className="text-gray-500 text-sm mb-6">
          Display this QR code on screen for members to scan and check in
        </p>

        {/* QR Code */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <img
            src={QR_API_URL}
            alt="Check-in QR Code"
            width={400}
            height={400}
            className="w-full max-w-[400px] mx-auto rounded-lg"
          />
          <p className="text-xs text-gray-400 mt-4 break-all">{CHECKIN_URL}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="flex-1 bg-[#10454f] text-white font-semibold py-3 px-4 rounded-xl hover:bg-[#1f6d73] transition-colors"
          >
            Download PNG
          </button>
          <button
            onClick={handleCopy}
            className="flex-1 bg-white text-[#10454f] font-semibold py-3 px-4 rounded-xl border-2 border-[#10454f]/20 hover:border-[#10454f]/40 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Save the image and add it to your ProPresenter announcement slides.
          Members scan with their phone camera to open the check-in page.
        </p>
      </div>
    </div>
  )
}
