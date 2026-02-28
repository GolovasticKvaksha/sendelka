import { supabase } from '../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
  const { id, action } = req.query

  // GET /api/posts (лента)
  if (req.method === 'GET' && !id) {
    const currentUserId = req.query.userId
    const { data } = await supabase
      .from('posts')
      .select('*, users(id, username, is_admin)')
      .order('created_at', { ascending: false })
    return res.status(200).json(data)
  }

  // GET /api/posts/:id (один пост)
  if (req.method === 'GET' && id) {
    const { data } = await supabase
      .from('posts')
      .select('*, users(id, username)')
      .eq('id', id)
      .single()
    return res.status(200).json(data)
  }

  // POST /api/posts (создать)
  if (req.method === 'POST' && !action) {
    const token = getTokenFromHeader(req.headers.authorization)
    const userId = verifyToken(token)
    if (!userId) return res.status(200).json({ error: 'Не авторизован' })

    const { content } = req.body
    const { data } = await supabase
      .from('posts')
      .insert([{ content, user_id: userId }])
      .select()
    return res.status(200).json(data[0])
  }

  // POST /api/posts/like (лайк)
  if (req.method === 'POST' && action === 'like') {
    const token = getTokenFromHeader(req.headers.authorization)
    const userId = verifyToken(token)
    if (!userId) return res.status(200).json({ error: 'Не авторизован' })

    const { postId } = req.body
    const { data: existing } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle()

    if (existing) {
      await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId)
      return res.status(200).json({ liked: false })
    } else {
      await supabase.from('likes').insert([{ user_id: userId, post_id: postId }])
      return res.status(200).json({ liked: true })
    }
  }

  return res.status(200).json({ error: 'Not found' })
}