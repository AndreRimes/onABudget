import pb from '../pocketbase';
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../userContext';

export default function useAuth() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    const {setTeste} = useUser();
    const router = useRouter()

    function logout() {
        pb.authStore.clear()
        router.push('/login')
    }

    function isLoged() {
        console.log()
        if (!pb.authStore.isValid ||  !pb.authStore?.model?.id) {
            router.push('/login')
        }
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
        setLoading(true)
        try {
            const user = await pb.collection('users').create(data)
            setLoading(false)
            setError(false)
            router.push('/login')
        } catch (e) {
            console.log(e)
            setLoading(false)
            setError(true)
        }
    }
        return { logout, login, loading, error, isLoged, signup };
    }