import { supabase } from '../lib/supabase.js'
import bcrypt from 'bcryptjs'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
  try {
    const { action } = req.body

    // =========================================
    // РЕГИСТРАЦИЯ
    // =========================================
    if (action === 'register') {
      const { username, password } = req.body
      const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress

      if (!username || !password) {
        return res.status(200).json({ error: 'Ник и пароль обязательны' })
      }

      if (username.length < 3 || password.length < 4) {
        return res.status(200).json({ error: 'Ник мин 3, пароль мин 4' })
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      const { data, error } = await supabase
        .from('users')
        .insert([{
          username,
          password: hashedPassword,
          ip_address: userIp,
          subscribers_count: 0,
          total_likes_received: 0,
          posts_count: 0,
          is_admin: false
        }])
        .select()

      if (error) {
        if (error.code === '23505') {
          return res.status(200).json({ error: 'Ник занят' })
        }
        return res.status(200).json({ error: error.message })
      }

      const user = data[0]
      delete user.password
      return res.status(200).json({ success: true, user })
    }

    // =========================================
    // ЛОГИН
    // =========================================
    if (action === 'login') {
      const { username, password } = req.body

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single()

      if (error || !data) {
        return res.status(200).json({ error: 'Неверный ник или пароль' })
      }

      const validPassword = await bcrypt.compare(password, data.password)
      if (!validPassword) {
        return res.status(200).json({ error: 'Неверный ник или пароль' })
      }

      await supabase
        .from('users')
        .update({ last_login: new Date() })
        .eq('id', data.id)

      delete data.password

      const token = Buffer.from(`${data.id}:${Date.now()}`).toString('base64')

      return res.status(200).json({ success: true, user: data, token })
    }

    // =========================================
    // ВЫХОД
    // =========================================
    if (action === 'logout') {
      return res.status(200).json({ success: true })
    }

    // =========================================
    // ПРОВЕРКА ТОКЕНА (ME)
    // =========================================
    if (action === 'me') {
      const token = getTokenFromHeader(req.headers.authorization)
      const userId = verifyToken(token)

      if (!userId) {
        return res.status(200).json({ error: 'Не авторизован' })
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, username, created_at, is_admin')
        .eq('id', userId)
        .single()

      if (error) {
        return res.status(200).json({ error: error.message })
      }

      return res.status(200).json(data)
    }

    return res.status(200).json({ error: 'Unknown action' })

  } catch (err) {
    console.error('Auth error:', err)
    return res.status(200).json({ error: 'Internal server error' })
  }
}