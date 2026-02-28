import { supabase } from '../../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = getTokenFromHeader(req.headers.authorization)
  const userId = verifyToken(token)

  if (!userId) {
    return res.status(401).json({ error: 'Не авторизован' })
  }

  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      from_user_id (username)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.status(200).json(data)
}