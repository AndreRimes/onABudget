'use client'
import Image from 'next/image';
import graphImage from '../../../public/graph.png';
import useAuth from '@/Domain/hooks/useAuth';
import { useState } from 'react'
import Loading from '@/components/loading'
import Error from '@/components/error';
import Link from 'next/link';

export default function Signup() {
    const { signup, loading, error } = useAuth();
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('');
    const [validPassword, setValidPassword] = useState([false, false, false]);
    const [isValidEmail, setisValidEmail] = useState(false)


    async function handleClick() {
        const data = {
            "username": name,
            "email": email,
            "emailVisibility": true,
            "password": password,
            "passwordConfirm": password,
            "name": name
        }
        signup(data)
    }


    const handleChangePassword = (e) => {
        setPassword(e.target.value);

        const newValidPassword = [...validPassword]
        if (e.target.value.length < 8) {
            newValidPassword[0] = false

        } else {
            newValidPassword[0] = true
        }


        if (!/\d/.test(e.target.value)) {
            newValidPassword[1] = false
        } else {
            newValidPassword[1] = true

        }


        if (!/[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]/.test(e.target.value)) {
            newValidPassword[2] = false
        } else {
            newValidPassword[2] = true
        }

        setValidPassword(newValidPassword);

    }


    const handleChangeEmail = (e) => {
        setEmail(e.target.value);
        const emailPattern = /^[a-z0-9.]+@[a-z0-9]+\.[a-z]+(\.[a-z]+)?$/i;
        setisValidEmail(emailPattern.test(e.target.value));
    }

    const isButtonDisabled =
        email.trim() === '' ||
        name.trim() === '' ||
        !isValidEmail ||
        validPassword.includes(false);


    return (
        <div className="w-screen h-screen top-0 left-0 flex items-center justify-center">
            <div className="w-2/5 h-4/5 bg-Primary rounded-xl flex flex-col items-center">
                {error ? <Error message={'Email ja esta sendo utilizado'} /> : <div className='h-8'></div>}
                <h1 className="text-2xl font-semibold mb-4">Bem Vindo ao On A Budget</h1>
                <div className="w-32 h-32 rounded-full flex items-center justify-center border border-tx">
                    <Image src={graphImage} width={85} height={85} alt="graph image" />
                </div>
                <div className={`flex flex-col items-center justify-evenly ${password ===''? 'h-[50%]' : 'h-[56%]'} w-full`}>
                    <div className="w-1/2">
                        <div className="input-group">
                            <input
                                onChange={(e) => handleChangeEmail(e)}
                                type="email"
                                className={`w-full input ${email !== '' ? 'inputFocus' : ''}`}
                            />
                            <label className={`user-label ${email !== '' ? 'labelFocus' : ''} `}>Email</label>
                        </div>
                    </div>
                    <div className="w-1/2">
                        <div className="input-group">
                            <input
                                type="Nome"
                                className={`w-full input ${name !== '' ? 'inputFocus' : ''}`}
                                onChange={(e) => setName(e.target.value)}
                            />
                            <label className={`user-label ${name !== '' ? 'labelFocus' : ''} `}>Nome</label>
                        </div>
                    </div>
                    <div className="w-1/2">
                        <div className="input-group">
                            <input
                                type="password"
                                className={`w-full input ${password !== '' ? 'inputFocus' : ''}`}
                                onChange={(e) => handleChangePassword(e)}
                            />
                            <label className={`user-label ${password !== '' ? 'labelFocus' : ''} `}>Senha</label>
                        </div>
                        {password !== '' && <ul className='w-[200%]'>
                            <li className={`${validPassword[0] ? 'text-green-600' : 'text-red-600'}`} > Senha deve conter pelo menos 7 characteres</li>
                            <li className={`${validPassword[1] ? 'text-green-600' : 'text-red-600'}`} > Senha deve conter pelo menos 1 numero</li>
                            <li className={`${validPassword[2] ? 'text-green-600' : 'text-red-600'}`} > Senha deve conter pelo menos 1 charactere especial</li>
                        </ul>}

                        <Link href="/login" className='underline'>Ja possui uma conta? </Link>
                    </div>
                </div>
                
                {console.log('email:', email.trim())}
                {console.log('name:', name.trim())}
                {console.log('isValidEmail:', isValidEmail)}
                {console.log('validPassword:', validPassword)}
                

                {loading ? (
                    <Loading />
                ) : (
                    <button
                        onClick={() => handleClick()}
                        className={` w-1/2 h-10 rounded-xl  ${email.trim() === '' ||
                                name.trim() === '' ||
                                !isValidEmail ||
                                validPassword.includes(false) ?
                                'bg-gray-500 cursor-not-allowed' :
                                'bg-Secundary hover:scale-110 transition-all ease-out duration-200'
                            }`}
                        disabled={
                            email.trim() === '' ||
                            name.trim() === '' ||
                            !isValidEmail ||
                            validPassword.includes(false)}
                    >
                        Mandar
                    </button>
                )}
            </div>
        </div>
    )
}