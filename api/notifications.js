import { supabase } from '../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
  try {
    const token = getTokenFromHeader(req.headers.authorization)
    const userId = verifyToken(token)

    if (!userId) {
      return res.status(200).json({ error: 'Не авторизован' })
    }

    const { action, notificationId } = req.body

    // =========================================
    // ПОЛУЧИТЬ ВСЕ УВЕДОМЛЕНИЯ
    // =========================================
    if (action === 'list') {
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
        return res.status(200).json({ error: error.message })
      }

      return res.status(200).json(data)
    }

    // =========================================
    // КОЛИЧЕСТВО НЕПРОЧИТАННЫХ
    // =========================================
    if (action === 'count') {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)

      if (error) {
        return res.status(200).json({ error: error.message })
      }

      return res.status(200).json({ count })
    }

    // =========================================
    // ОТМЕТИТЬ КАК ПРОЧИТАННОЕ
    // =========================================
    if (action === 'read') {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId)

      if (error) {
        return res.status(200).json({ error: error.message })
      }

      return res.status(200).json({ success: true })
    }

    // =========================================
    // ОТМЕТИТЬ ВСЕ КАК ПРОЧИТАННЫЕ
    // =========================================
    if (action === 'readAll') {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)

      if (error) {
        return res.status(200).json({ error: error.message })
      }

      return res.status(200).json({ success: true })
    }

    return res.status(200).json({ error: 'Unknown action' })

  } catch (err) {
    console.error('Notifications error:', err)
    return res.status(200).json({ error: 'Internal server error' })
  }
}