'use client'
import Link from "next/link"
import Image from "next/image"
import arrow from '../../../public/arrow.png'
import Error from "@/components/error"
import useAuth from "@/Domain/hooks/useAuth"
import { useState } from "react"
import email from '../../../public/email.png'
import Success from "@/components/success"

export default function PasswordReset() {
    const { resetPasswordEmail, loading } = useAuth();
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(false);
    const [message, setMessage] = useState('Insira o seu email');
    const [emailValue, setEmailValue] = useState('');

    async function handleClick() {
        try {
            const res = await resetPasswordEmail(emailValue);
            if (res) {
                setSuccess(res);
                setError(false);
            } else {
                setError(true);
                setSuccess(false);
            }
        } catch (e) {
            console.log(e);
        }
    }

    function handleChange(event) {
        const value = event.target.value;
        setEmailValue(value);

        const emailPattern = /^[a-z0-9.]+@[a-z0-9]+\.[a-z]+(\.[a-z]+)?$/i;
        if (!emailPattern.test(value)) {
            setMessage('Email Inválido');
        } else {
            setMessage('');
        }
    }

    return (
        <div className="w-screen h-screen top-0 left-0 flex items-center justify-center">
            <div className="w-11/12 h-3/5 xl:w-2/5 xl:h-3/5 bg-Primary rounded-xl flex flex-col justify-center items-center">
                {success && <Success message={"Email enviado. Feche esta janela e continue com o link enviado no email."} />}
                {error && <Error message={'Email Não Encontrado'} />}
                {!success && !error && <div className="w-1/2 h-8"></div>}
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
                        <div className="w-3/4 xl:w-1/2">
                            <div className="input-group">
                                <input
                                    onChange={handleChange}
                                    value={emailValue}
                                    type="email"
                                    className={`w-full input ${emailValue !== '' ? 'inputFocus' : ''}`}
                                    disabled={success}
                                />
                                <label className={`user-label ${emailValue !== '' ? 'labelFocus' : ''}`}>
                                    Email
                                </label>
                            </div>

                            {emailValue !== '' && <h1 className="text-Error font-semibold mt-1 ">{message}</h1>}
                        </div>
                    </div>
                    <button
                        onClick={() => handleClick()}
                        className={`${success || message !== '' ? "bg-gray-500 cursor-not-allowed" : "bg-Secundary hover:scale-110"
                            } w-3/4 xl:w-1/2 h-10 rounded-xl  transition-all ease-out duration-200`}
                        disabled={success || message !== ''}
                    >
                        Mandar
                    </button>
                </div>
            </div>
        </div>
    )
}
