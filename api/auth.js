import { supabase } from '../lib/supabase.js'
import bcrypt from 'bcryptjs'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
  const { path } = req.query  // Vercel передаёт путь в query

  // REGISTER
  if (req.method === 'POST' && req.url.includes('/register')) {
    const { username, password } = req.body
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress

    const hashedPassword = await bcrypt.hash(password, 10)
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword, ip_address: userIp }])
      .select()

    if (error) return res.status(200).json({ error: error.message })
    delete data[0].password
    return res.status(200).json({ success: true, user: data[0] })
  }

  // LOGIN
  if (req.method === 'POST' && req.url.includes('/login')) {
    const { username, password } = req.body
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single()

    if (error || !data) return res.status(200).json({ error: 'Неверный ник или пароль' })

    const valid = await bcrypt.compare(password, data.password)
    if (!valid) return res.status(200).json({ error: 'Неверный ник или пароль' })

    delete data.password
    const token = Buffer.from(`${data.id}:${Date.now()}`).toString('base64')
    return res.status(200).json({ success: true, user: data, token })
  }

  // LOGOUT
  if (req.method === 'POST' && req.url.includes('/logout')) {
    return res.status(200).json({ success: true })
  }

  // ME
  if (req.method === 'GET' && req.url.includes('/me')) {
    const token = getTokenFromHeader(req.headers.authorization)
    const userId = verifyToken(token)
    if (!userId) return res.status(200).json({ error: 'Не авторизован' })

    const { data } = await supabase
      .from('users')
      .select('id, username, created_at')
      .eq('id', userId)
      .single()

    return res.status(200).json(data)
  }

  return res.status(200).json({ error: 'Not found' })
}