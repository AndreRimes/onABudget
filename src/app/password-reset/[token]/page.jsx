'use client'
import { useRouter } from 'next/navigation';
import useAuth from '@/Domain/hooks/useAuth';
import { useEffect, useState, useRef } from 'react';
import Error from '@/components/error';

export default function ConfirmPasswordReset({ params }) {
    const router = useRouter();
    const { verifyJWT, passwordReset } = useAuth();
    const [senha1, setSenha1] = useState('');
    const [senha2, setSenha2] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [message, setMessage] = useState('Insira Sua Nova Senha');

    const senha1Ref = useRef()
    const senha2Ref = useRef()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const isValidToken = await verifyJWT(params.token);
                if (isValidToken) {
                    setLoading(false);
                } else {
                    router.push('/');
                }
            } catch (error) {
                setError(true);
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
        setLoading(true);
        try {
            const res = await passwordReset(senha1, senha2, params.token);
            if (res) {
                setError(false);
                setLoading(false);
            } else {
                setError(true);
                setLoading(false);
            }
        } catch (e) {
            console.log(e);
            setLoading(false);
            setError(true);
        }
    }

    function handleChange(event) {
        const { name, value } = event.target;
    
        if (name === 'senha1') {
            setSenha1(value);
        } else if (name === 'senha2') {
            setSenha2(value);
        }
        console.log(senha1)

            const password = senha1Ref.current.value;
            const confirmPassword = senha2Ref.current.value;

            if (password.length < 8) {
                setMessage('Senha deve ter pelo menos 8 caracteres');
                return;
            }
            if (!/\d/.test(password)) {
                setMessage('Senha deve conter pelo menos 1 número');
                return;
            }
            if (!/[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]/.test(password)) {
                setMessage('Senha deve conter pelo menos 1 caractere especial');
                return;
            }

            if (password !== confirmPassword) {
                setMessage('As senhas não coincidem');
                return;
            }

            setMessage('');
    

    }

    return (
        <div className="w-screen h-screen top-0 left-0 flex items-center justify-center">
            <div className="w-2/5 h-3/5 bg-Primary rounded-xl flex flex-col justify-evenly items-center">
                {error ? <Error message={"Error ao atualizar a senha"} /> : <div className='h-8'></div>}
                <div className="w-full h-[2%] flex flex-col items-center">
                    <h1 className="text-2xl font-bold">Esqueceu sua Senha?</h1>
                    <div className="h-10 flex items-center justify-center"></div>
                </div>

                <div className="w-full h-2/3 flex flex-col items-center justify-evenly">
                    <div className="flex h-[80%] flex-col items-center justify-evenly  w-full">
                        <div className="w-1/2">
                            <div className="input-group">
                                <input
                                    ref={senha1Ref}
                                    onChange={handleChange}
                                    name="senha1"
                                    value={senha1}
                                    type="password"
                                    className={`w-full input ${senha1 !== '' ? 'inputFocus' : ''}`}
                                />
                                <label className={`user-label ${senha1 !== '' ? 'labelFocus' : ''}`}>
                                    Senha
                                </label>
                            </div>
                        </div>

                        <div className="w-1/2 ">
                            <div className="input-group">
                                <input
                                    ref={senha2Ref}
                                    onChange={handleChange}
                                    name="senha2"
                                    value={senha2}
                                    type="password"
                                    className={`w-full input ${senha2 !== '' ? 'inputFocus' : ''}`}
                                />
                                <label className={`user-label ${senha2 !== '' ? 'labelFocus' : ''}`}>
                                    Confirmacao de Senha
                                </label>
                            </div>
                        </div>
                        {(senha1 !== '' || senha2 !== '') && <h1 className='text-red-500 text-md font-semibold '>{message}</h1>}
                    </div>


                    <button
                        onClick={() => handleClick()}
                        className={`${loading || message !== '' ? "bg-gray-500 cursor-not-allowed" : "bg-Secundary hover:scale-110"} w-1/2 h-10 rounded-xl transition-all ease-out duration-200`}
                        disabled={loading || message !== ''}
                    >
                        Mandar
                    </button>
                </div>
            </div>
        </div >
    );
}
