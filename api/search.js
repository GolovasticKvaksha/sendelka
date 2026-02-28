import { supabase } from '../lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { username } = req.query

  if (!username) {
    return res.status(400).json({ error: 'Введите username для поиска' })
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, username, created_at, subscribers_count, posts_count, total_likes_received')
    .eq('username', username)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }
    return res.status(500).json({ error: error.message })
  }

  res.status(200).json(data)
}
