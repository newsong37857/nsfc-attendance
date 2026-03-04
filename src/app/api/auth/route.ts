import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const { pin } = await request.json()
  const correctPin = process.env.APP_PIN || '1234'

  if (pin === correctPin) {
    const cookieStore = await cookies()
    cookieStore.set('nsfc-auth', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12, // 12 hours
      path: '/',
    })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('nsfc-auth')
  return NextResponse.json({ success: true })
}
