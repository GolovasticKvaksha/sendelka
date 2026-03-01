import { supabase } from '../lib/supabase.js'

export default async function handler(req, res) {
  try {
    const { username } = req.body

    if (!username) {
      return res.status(200).json({ error: 'Введите username' })
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, username, created_at, subscribers_count, posts_count, total_likes_received, is_admin')
      .eq('username', username)
      .single()

    if (error || !data) {
      return res.status(200).json({ error: 'Пользователь не найден' })
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('Search error:', err)
    return res.status(200).json({ error: 'Internal server error' })
  }
}