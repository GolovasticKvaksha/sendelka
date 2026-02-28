import { supabase } from '../../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = getTokenFromHeader(req.headers.authorization)
  const userId = verifyToken(token)

  if (!userId) {
    return res.status(401).json({ error: 'Не авторизован' })
  }

  const { notificationId, readAll } = req.body

  if (readAll) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ success: true })
  }

  if (notificationId) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ success: true })
  }

  res.status(400).json({ error: 'Missing notificationId or readAll' })
}