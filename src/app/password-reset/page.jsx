'use client'
import Link from "next/link"
import Image from "next/image"
import arrow from '../../../public/arrow.png'
import Error from "@/components/error"
import useAuth from "@/Domain/hooks/useAuth"
import { useRef, useState } from "react"
import email from '../../../public/email.png'
import Success from "@/components/success"


export default function PasswordReset() {
    const { resetPasswordEmail, loading } = useAuth();
    const [sucess, setSuccess] = useState(false);
    const [error, setError] = useState(false);
    const [message,setMessage] = useState('Email Invalido')
    const emailRef = useRef(null)

    async function handleClick() {
        try {
            const res = await resetPasswordEmail(emailRef.current.value);
            if (res) {
                setSuccess(res)
                setError(false)
            }
            else {
                setError(true)
                setSuccess(false)
            }
        } catch (e) {
            console.log(e);
        }
    }

    function handleChange() {
        const emailPattern = /^[a-z0-9.]+@[a-z0-9]+\.[a-z]+(\.[a-z]+)?$/i;
        if (!emailPattern.test(emailRef.current.value)) {
            setMessage('Email Invalido');
        } else {
            setMessage('');
        }
    }


    return (
        <div className="w-screen h-screen top-0 left-0 flex items-center justify-center">
            <div className="w-2/5 h-3/5 bg-Primary rounded-xl flex flex-col justify-center items-center">
                {sucess && <Success message={"Email enviado. Feche esta janela e continue com o link enviado no email."} />}
                {error && <Error message={'Email Nao Encontrado'} />}
                {!sucess && !error && <div className="w-1/2 h-8"></div>}
                <div className="w-full h-2/3 flex flex-col items-center justify-evenly">
                    <div className="w-11/12 h-1/3">
                        <Link href='/login'>
                            <Image src={arrow} height={24} width={24} alt='arrow left' className="hover:scale-125 transition-all duration-300 ease-out " />
                        </Link>
                    </div>
                    <div className="flex items-center justify-center mb-5">
                        <h1 className="text-2xl font-bold">Esqueceu sua Senha?</h1>
                    </div>
                    <div className="min-w-[110px] min-h-[110px] rounded-full flex items-center justify-center border border-tx">
                        <Image src={email} width={80} height={80} alt="graph image" />
                    </div>
                </div>

                <div className="w-full h-2/3 flex flex-col items-center justify-start">
                    <div className="flex flex-col items-center justify-evenly h-2/5 w-full mb-2">
                        <div className="w-1/2">
                            <h3 className="ml-1">Email: </h3>
                            <input
                                ref={emailRef}
                                type="email"
                                placeholder="Email: "
                                className={`bg-tx px-2 w-full h-10 text-Dark rounded-lg font-semibold text-lg ${sucess ? 'cursor-not-allowed' : ''}`}
                                disabled={sucess}
                                onChange={handleChange}
                            />
                            <h1 className="text-Error font-semibold mt-1 ">{message}</h1>
                        </div>
                    </div>
                    <button
                        onClick={() => handleClick()}
                        className={`${sucess || message !== '' ? "bg-gray-500 cursor-not-allowed" : "bg-Secundary hover:scale-110"
                            } w-1/2 h-10 rounded-xl  transition-all ease-out duration-200`}
                        disabled={sucess}
                        
                    >
                        Mandar
                    </button>
                </div>
            </div>
        </div>
    )
}