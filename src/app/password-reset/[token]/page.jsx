'use client'
import { useRouter } from 'next/navigation';
import useAuth from '@/Domain/hooks/useAuth';
import { useEffect, useRef, useState } from 'react';
import Loading from '@/components/loading';
import Error from '@/components/error';

export default function ConfirmPasswordReset({ params }) {
    const router = useRouter()
    const { verifyJWT, passwordReset } = useAuth();
    const senha1Ref = useRef();
    const senha2Ref = useRef();
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const isValidToken = await verifyJWT(params.token);
                if (isValidToken) {
                    setLoading(false)
                } else {
                    router.push('/');
                }
            } catch (error) {
                setError(true)
            } finally {
                setLoading(false);
            }
        };

        if (!params.token) {
            router.push('/login');
            return;
        }

        fetchData();
    }, [params]);

    async function handleClick() {
        const res = await passwordReset(senha1Ref.current.value, senha2Ref.current.value, params.token);
    }



    return (
        <div className="w-screen h-screen top-0 left-0 flex items-center justify-center">
            <div className="w-2/5 h-3/5 bg-Primary rounded-xl flex flex-col justify-center items-center">
                {loading ? <Loading /> : <>
                    {!error ? <Error /> : <div className='h-8'></div>}
                    <div className="w-full h-[10%] flex flex-col items-center">
                        <div className="h-10 flex items-center justify-center">
                            <h1 className="text-2xl font-bold">Esqueceu sua Senha?</h1>
                        </div>
                    </div>

                    <div className="w-full h-1/2 flex flex-col items-center justify-evenly">
                        <div className="flex flex-col items-center justify-evenly h-2/5 w-full">
                            <div className="w-1/2 mb-3">
                                <h3 className="ml-1 font-semibold text-lg">Senha: </h3>
                                <input
                                    ref={senha1Ref}
                                    type="password"
                                    placeholder="Senha: "
                                    className="bg-tx px-2 w-full h-10 text-Dark rounded-lg font-semibold text-lg"
                                />
                            </div>

                            <div className="w-1/2 mb-3">
                                <h3 className="ml-1 font-semibold text-lg">Confimar Senha: </h3>
                                <input
                                    ref={senha2Ref}
                                    type="password"
                                    placeholder="Confimar Senha: "
                                    className="bg-tx px-2 w-full h-10 text-Dark rounded-lg font-semibold text-lg"
                                />
                            </div>
                        </div>
                        {loading ? (
                            <Loading />
                        ) : (
                            <button
                                onClick={() => handleClick()}
                                className="bg-Secundary w-1/2 h-10 rounded-xl hover:scale-110 transition-all ease-out duration-200 mt-3"
                            >
                                Salvar
                            </button>
                        )}
                    </div>
                </>}
            </div>
        </div >
    )
}