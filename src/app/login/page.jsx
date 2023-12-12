'use client'
import Image from 'next/image';
import graphImage from '../../../public/graph.png';
import useAuth from '@/Domain/hooks/useAuth';
import { useState,useRef } from 'react'
import Loading from '@/components/loading'
import Error from '@/components/error';
import Link from 'next/link';

export default function Login() {
    const { login, loading, error } = useAuth();
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')


    function handleClick() {
        login({ email: email, password: password });
    }

    return (
        <div className="w-screen h-screen top-0 left-0 flex items-center justify-center">
            <div className="w-2/5 h-4/5 bg-Primary rounded-xl flex flex-col items-center">
                {error ? <Error message={'Error Senha ou email Invalidos'} /> : <div className='h-8'></div>}
                <div className='w-full h-2/6 flex flex-col items-center justify-evenly  '>
                    <h1 className="text-2xl font-semibold mb-4">Bem Vindo ao On A Budget</h1>
                    <div className="w-32 h-32 rounded-full flex items-center justify-center border border-tx">
                        <Image src={graphImage} width={85} height={85} alt="graph image" />
                    </div>
                </div>

                <div className="flex flex-col items-center justify-evenly h-[35%] w-full">
                    <div className="w-1/2">
                        <div className="input-group">
                            <input 
                            onChange={(e)=> setEmail(e.target.value)}
                            type="email"
                            className={`w-full input ${email!== '' ? 'inputFocus' : '' }`}
                            />
                            <label className={`user-label ${email!== '' ? 'labelFocus' : '' } `}>Email</label>
                        </div>
                    </div>

                    <div className="w-1/2 h-2/5">
                        <div className="input-group">
                            <input
                                type="password"
                                className={`w-full input ${password !== '' ? 'inputFocus' : ''}`}
                                onChange={(e) => setPassword(e.target.value)}  
                            />
                                <label className={`user-label ${password !== '' ? 'labelFocus' : ''} `}>Senha</label>
                        </div>

                        <div className='flex flex-col justify-envenly '>
                            <Link href="/signup" className='underline mt-1'>Nao possui uma Conta? </Link>
                            <Link href='/password-reset' className='underline mt-2'>Esqueceu sua Senha?</Link>
                        </div>
                    </div>
                </div>
                <div className='w-full flex items-center justify-center'>
                    {loading ? (
                    <Loading />
                    ) : (
                        <button
                            onClick={() => handleClick()}
                            className="bg-Secundary w-1/2 h-10 rounded-xl hover:scale-110 transition-all ease-out duration-200 mt-3"
                        >
                            Mandar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

}
