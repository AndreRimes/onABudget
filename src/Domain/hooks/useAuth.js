import pb from '../pocketbase';
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../userContext';

export default function useAuth() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    const { setTeste } = useUser();
    const router = useRouter()

    function logout() {
        pb.authStore.clear()
        router.push('/login')
    }

    function isLoged() {
        if (!pb.authStore.isValid || !pb.authStore?.model?.id) {
            return false
        }
        return true
    }

    async function login({ email, password }) {
        setLoading(true)
        try {
            const user = await pb.collection('users').authWithPassword(email, password);
            setTeste(true)
            setLoading(false)
            setError(false)
            router.push('/')
        } catch (e) {
            console.log(e)
            setLoading(false)
            setError(true)
        }
    }

    async function signup(data) {
        setLoading(true);
        try {
            const user = await pb.collection('users').create(data);
            console.log(user)
            setLoading(false)
            setError(false)
            router.push('/login')
        } catch (e) {
            console.log(e)
            setLoading(false)
            setError(true)
        }
    }

    async function resetPasswordEmail(email) {
        setLoading(true)
        try {
            const res = await pb.collection('users').requestPasswordReset(email);
            setLoading(false)
            setError(false)
            return true
        } catch (e) {
            setError(true)
            return false
        }

    }


    async function verifyJWT(token) {
        setLoading(true)
        pb.authStore.save(token, null);
        if (!pb.authStore.isValid) {
            setLoading(false);
            setError(true);
            router.push('/');
            return false
        } else {
            setLoading(false);
            setError(false);
            return true
        }
    }

    async function passwordReset(pass1, pass2, token) {
        try {
            const res = await pb.collection('users').confirmPasswordReset(token, pass1, pass2);
            router.push('/login')
            return true
        }
        catch (e) {
            return false
        }
    }


    return { logout, login, loading, error, isLoged, resetPasswordEmail, signup, verifyJWT, passwordReset };
}