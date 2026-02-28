import { supabase } from '../../lib/supabase.js'

export default async function handler(req, res) {
  // Разрешаем только GET
  if (req.method !== 'GET') {
    return res.status(200).json({ error: 'Method not allowed' }) // Не 405, а 200 с ошибкой
  }

  try {
    const { username } = req.query
    const currentUserId = req.query.currentUserId

    console.log('📝 Запрос профиля:', username)

    if (!username) {
      return res.status(200).json({ error: 'Username не указан' })
    }

    // Получаем пользователя
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle() // maybeSingle вместо single

    if (userError || !user) {
      console.log('❌ Пользователь не найден')
      return res.status(200).json({ error: 'Пользователь не найден' })
    }

    // Получаем посты
    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // Проверяем подписку
    let isSubscribed = false
    if (currentUserId) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', user.id)
        .maybeSingle()
      
      isSubscribed = !!sub
    }

    // Убираем пароль из ответа
    delete user.password

    // Всегда возвращаем 200 с данными
    res.status(200).json({
      ...user,
      posts: posts || [],
      isSubscribed
    })

  } catch (err) {
    console.error('Критическая ошибка:', err)
    // Даже при падении возвращаем 200
    res.status(200).json({ error: 'Внутренняя ошибка сервера' })
  }
}