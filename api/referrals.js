import { supabase } from '../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'
import bcrypt from 'bcryptjs'

export default async function handler(req, res) {
    try {
        const { action } = req.body

        // ===== РЕГИСТРАЦИЯ ПО РЕФЕРАЛКЕ =====
        if (action === 'register') {
            const { username, password, referrerUsername } = req.body
            const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress

            // Проверяем, не регистрировался ли уже этот IP
            const { data: existingRef } = await supabase
                .from('referrals')
                .select('id')
                .eq('referral_ip', userIp)
                .maybeSingle()

            if (existingRef) {
                return res.status(200).json({ error: 'С этого IP уже регистрировались по рефералке' })
            }

            // Ищем пригласившего
            let referrerId = null
            if (referrerUsername) {
                const { data: referrer } = await supabase
                    .from('users')
                    .select('id')
                    .eq('username', referrerUsername)
                    .maybeSingle()

                if (referrer) {
                    referrerId = referrer.id
                }
            }

            // Регистрируем нового пользователя
            const hashedPassword = await bcrypt.hash(password, 10)
            const { data: newUser, error } = await supabase
                .from('users')
                .insert([{
                    username,
                    password: hashedPassword,
                    ip_address: userIp,
                    avatar: 'avatar1.jpg',
                    referrer_id: referrerId
                }])
                .select()
                .single()

            if (error) {
                return res.status(200).json({ error: error.message })
            }

            // Если есть пригласивший - обрабатываем рефералку
			if (referrerId) {
				await supabase
					.from('referrals')
					.insert([{
						referrer_id: referrerId,
						referral_id: newUser.id,
						referral_ip: userIp
					}])
				
				// 👇 ДОБАВЛЯЕМ УВЕДОМЛЕНИЕ
				await supabase
					.from('notifications')
					.insert([{
						user_id: referrerId,
						type: 'referral',
						from_user_id: newUser.id,
						content: '👤 Новый пользователь зарегистрировался по твоей ссылке'
					}])
			}

            delete newUser.password
            return res.status(200).json({ success: true, user: newUser })
        }

        // ===== ПОЛУЧИТЬ РЕФЕРАЛОВ ПОЛЬЗОВАТЕЛЯ =====
        if (action === 'get_referrals') {
            const token = getTokenFromHeader(req.headers.authorization)
            const userId = verifyToken(token)

            if (!userId) {
                return res.status(200).json({ error: 'Не авторизован' })
            }

            const { data } = await supabase
                .from('referrals')
                .select(`
                    referral_id,
                    users!referrals_referral_id_fkey (username, created_at)
                `)
                .eq('referrer_id', userId)

            return res.status(200).json({ referrals: data })
        }

        return res.status(200).json({ error: 'Unknown action' })

    } catch (err) {
        console.error('Referrals error:', err)
        return res.status(200).json({ error: 'Internal server error' })
    }
}