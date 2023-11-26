'use client'
import Image from 'next/image';
import graphImage from '../../../public/graph.png';
import useAuth from '@/Domain/hooks/useAuth';
import { useState } from 'react'
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
                {error?<Error/>:<div className='h-8'></div>}
                <h1 className="text-2xl font-semibold mb-4">Bem Vindo ao On A Budget</h1>
                <div className="w-32 h-32 rounded-full flex items-center justify-center border border-tx">
                    <Image src={graphImage} width={85} height={85} alt="graph image" />
                </div>
                <div className="flex flex-col items-center justify-evenly h-2/5 w-full">
                    <div className="w-1/2">
                        <h3 className="ml-1">Email: </h3>
                        <input
                            type="text"
                            placeholder="email: "
                            className="bg-tx px-2 w-full h-10 text-Dark rounded-lg"
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="w-1/2">
                        <h3 className="ml-1">Senha: </h3>
                        <input
                            type="password"
                            placeholder="Senha: "
                            className="bg-tx px-2 w-full h-10 text-Dark rounded-lg"
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <Link href="/signup" className='underline'>Nao possui uma Conta? </Link>
                    </div>
                </div>
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
    );

}
