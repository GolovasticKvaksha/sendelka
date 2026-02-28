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

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.status(200).json({ count })
}