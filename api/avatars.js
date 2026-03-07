import { supabase } from '../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
    try {
        const { action, avatarId, imageUrl } = req.body
        const token = getTokenFromHeader(req.headers.authorization)
        const userId = verifyToken(token)

        if (!userId) {
            return res.status(200).json({ error: 'Не авторизован' })
        }

        // ===== ПОЛУЧИТЬ ТЕКУЩУЮ АВАТАРКУ И ДОСТУПНЫЕ =====
        if (action === 'get_info') {
            const { data: user } = await supabase
                .from('users')
                .select('avatar, referrals_count, can_upload_avatar')
                .eq('id', userId)
                .single()

            const currentNumber = parseInt(user.avatar?.replace('avatar', '').replace('.jpg', '')) || 1

            return res.status(200).json({
                currentAvatar: user.avatar,
                currentNumber: currentNumber,
                referrals: user.referrals_count,
                canUpload: user.can_upload_avatar,
                maxAvailable: Math.min(1 + user.referrals_count, 8)
            })
        }

        // ===== ВЫБРАТЬ АВАТАРКУ =====
        if (action === 'select') {
            const avatarNumber = parseInt(avatarId)
            
            const { data: user } = await supabase
                .from('users')
                .select('referrals_count')
                .eq('id', userId)
                .single()

            const maxAvailable = Math.min(1 + user.referrals_count, 8)
            
            if (avatarNumber > maxAvailable) {
                return res.status(200).json({ error: 'Аватарка ещё не открыта' })
            }

            const avatarPath = `avatar${avatarNumber}.jpg`

            const { data, error } = await supabase
                .from('users')
                .update({ avatar: avatarPath })
                .eq('id', userId)
                .select()

            if (error) {
                return res.status(200).json({ error: error.message })
            }

            return res.status(200).json({ success: true, avatar: data[0]?.avatar })
        }

        // ===== ЗАГРУЗИТЬ СВОЮ АВАТАРКУ =====
        if (action === 'upload') {
            const { data: user } = await supabase
                .from('users')
                .select('can_upload_avatar')
                .eq('id', userId)
                .single()

            if (!user.can_upload_avatar) {
                return res.status(200).json({ error: 'Нужно 8 рефералов для загрузки своей аватарки' })
            }

            if (!imageUrl) {
                return res.status(200).json({ error: 'Ссылка на изображение обязательна' })
            }

            if (!imageUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) {
                return res.status(200).json({ error: 'Некорректная ссылка на изображение' })
            }

            const { data, error } = await supabase
                .from('users')
                .update({ avatar: imageUrl })
                .eq('id', userId)
                .select()

            if (error) {
                return res.status(200).json({ error: error.message })
            }

            return res.status(200).json({ success: true, avatar: data[0]?.avatar })
        }

        return res.status(200).json({ error: 'Unknown action' })

    } catch (err) {
        console.error('Avatars error:', err)
        return res.status(200).json({ error: 'Internal server error' })
    }
}