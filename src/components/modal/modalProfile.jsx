import Overlay from "./overlay";
import { useState, useRef, useEffect } from "react";
import { useUser } from "@/Domain/userContext";
import useAuth from "@/Domain/hooks/useAuth";
import Image from "next/image";
import logoutImg from "../../../public/logout.png"

export default function ModalProfile({ user, setIsModalProfile }) {
    const [edit, setEdit] = useState('')
    const [message, setMessage] = useState('')
    const { updateUsername, updateEmail, updatePassword } = useUser();
    const { logout } = useAuth();
    const [numChar, setNumChar] = useState(window.innerWidth <= 1000 ? 15 : 26);


    const usernameRef = useRef(null);
    const emailRef = useRef(null);
    const senhaRef = useRef(null);
    const senha2Ref = useRef(null);

    function handleChange() {
        if (edit === 'username') {
            if (usernameRef.current.value < 3) {
                setMessage('Username Muito Curto');
                return
            }
            if (usernameRef.current.value === user.username) {
                setMessage('Username igual ao atual')
                return
            }
            setMessage('');

        } else if (edit === 'email') {
            const emailPattern = /^[a-z0-9.]+@[a-z0-9]+\.[a-z]+(\.[a-z]+)?$/i;
            if (!emailPattern.test(emailRef.current.value)) {
                setMessage('Email Invalido');
                return
            }
            if (emailRef.current.value === user.email) {
                setMessage('Email igual ao atual')
                return
            }
            setMessage('');

        } else if (edit === 'senha') {
            const password = senhaRef.current.value;
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
    }
    async function handleClick() {
        if (edit === 'username') {
            const newMessage = await updateUsername(usernameRef.current.value);
            setMessage(newMessage);
            usernameRef.current.value = ''
            setEdit('')
        } else if (edit === 'email') {
            const res = await updateEmail(emailRef.current.value);
        } else if (edit === 'senha') {
            const res = await updatePassword(senhaRef.current.value, senha2Ref.current.value)
        }
    }


    useEffect(() => {
        function handelResize() {
            if (window.innerWidth <= 700) {
                setNumChar(10);
            } else if (window.innerWidth <= 1000) {
                setNumChar(20);
            } else {
                setNumChar(26);
            }
        }


        window.addEventListener('resize', handelResize)


        return () => {
            window.removeEventListener('resize', handelResize);
        }
    }, [])



    return (
        <Overlay setIsModalOpen={setIsModalProfile}>
            <div onClick={(e) => e.stopPropagation()} className="bg-Dark animate-dropTop  text-white w-11/12 lg:w-2/3 h-5/6 rounded-2xl flex flex-col items-center justify-evenly">

                <div className="absolute translate-x-[30vw] -translate-y-[35vh]">
                    <p onClick={() => setIsModalProfile(false)} className="cursor-pointer font-bold text-xl hover:scale-110 transition-all duration-200 ease-out">X</p>
                </div>

                <h1 className="text-3xl font-semibold">Seu Perfil</h1>
                <div className="h-[2px] w-11/12  lg:w-[80%] bg-white"></div>
                <div className="w-11/12 lg:w-2/3 h-[70%]  bg-Primary rounded-xl p-10">


                    <div className="absolute translate-x-[65vw] lg:translate-x-[37vw] -translate-y-[3vh]">
                        <Image onClick={() => logout()} className="cursor-pointer hover:scale-125 transition-all duration-200 ease-out" src={logoutImg} width={20} height={20} alt='logout button' />
                    </div>

                    <div className="animate-notification w-full flex justify-center  ">
                        <h1 className="w-3/4 bg-Error flex center justify-center rounded-md text-lg font-semibold items-center">{message}</h1>
                    </div>

                    <div className="mb-3">
                        <h2 className="mb-2 ">Username:</h2>
                        {edit === 'username' ?
                            <>
                                <input placeholder="Username: " onChange={handleChange} ref={usernameRef} className="border-tx w-2/3 h-10 rounded-xl text-xl flex items-center px-4 text-black overflow-hidden" />
                                <div className="w-2/3 flex justify-end mt-3">
                                    {message === 'Username Muito Curto' || message === 'Username igual ao atual' ?
                                        <button className="bg-gray-600 cursor-not-allowed h-6 w-14 px-10 rounded-md flex items-center justify-center">Salvar</button>
                                        : <>
                                            <button onClick={handleClick} className="hover:scale-125 bg-Secundary h-6 w-14 px-10 rounded-md flex items-center justify-center trasition-all duration-300 ease-out cursor-pointer">Salvar</button>
                                        </>}
                                </div>
                            </>
                            :
                            <div onClick={() => setEdit('username')} className=" overflow-hidden hover:scale-110 hover:bg-tx hover:text-black hover:font-semibold trasition-all duration-300 ease-out cursor-pointer border border-tx w-2/3 h-10 rounded-xl text-xl flex items-center px-4">{user.username}</div>}
                    </div>

                    <div className="mb-3">
                        <h2 className="mb-2">Email:</h2>
                        {edit === 'email' ?
                            <>
                                <input placeholder="Email: " onChange={handleChange} ref={emailRef} className=" overflow-hidden border-tx w-2/3  h-10 rounded-xl text-xl flex items-center px-4 text-black" />
                                <div className="w-2/3 flex justify-end mt-3">
                                    {message === 'Email Invalido' || message === 'Email igual ao atual' ?
                                        <button className="bg-gray-600 cursor-not-allowed h-6 w-14 px-10 rounded-md flex items-center justify-center">Salvar</button>
                                        : <>
                                            <button onClick={handleClick} className="hover:scale-125 bg-Secundary h-6 w-14 px-10 rounded-md flex items-center justify-center trasition-all duration-300 ease-out cursor-pointer">Salvar</button>
                                        </>}
                                </div>
                            </>
                            :
                            <div onClick={() => setEdit('email')} className="hover:scale-110 hover:bg-tx hover:text-black hover:font-semibold  trasition-all duration-300 ease-out cursor-pointer border border-tx w-2/3  h-10 rounded-xl text-xl flex items-center px-4 overflow-hidden">
                                {user.email.length > numChar ? `${user.email.slice(0, numChar)}...` : user.email}
                            </div>
                        }
                    </div>

                    <div className="">
                        <h2 className="mb-2">Senha:</h2>
                        {edit === 'senha' ?
                            <>
                                <input placeholder="Senha: " type='password' onChange={handleChange} ref={senhaRef} className="  overflow-hidden mb-4 border-tx w-2/3  h-10 rounded-xl text-xl flex items-center px-4 text-black" />
                                <input placeholder="Confirmacao de senha: " type='password' onChange={handleChange} ref={senha2Ref} className=" overflow-hidden border-tx w-2/3  h-10 rounded-xl text-xl flex items-center px-4 text-black" />
                                <div className="w-2/3 flex justify-end mt-3">
                                    {message === 'Senha deve ter pelo menos 8 caracteres' || message === 'Senha deve conter pelo menos 1 número' || message === 'Senha deve conter pelo menos 1 caractere especial, como *' || message === 'As senhas não coincidem' ?
                                        <button className=" bg-gray-600 cursor-not-allowed h-6 w-14 px-10 rounded-md flex items-center justify-center">Salvar</button>
                                        : <>
                                            <button onClick={handleClick} className="hover:scale-125 bg-Secundary h-6 w-14 px-10 rounded-md flex items-center justify-center trasition-all duration-300 ease-out cursor-pointer">Salvar</button>
                                        </>}
                                </div>

                            </>
                            :
                            <div onClick={() => setEdit('senha')} className="  overflow-hidden hover:scale-110 hover:bg-tx hover:text-black hover:font-semibold  trasition-all duration-300 ease-out cursor-pointer  border border-tx  w-2/3 h-10 rounded-xl text-xl flex items-center px-4">
                                *******
                            </div>
                        }
                    </div>
                </div>
            </div>
        </Overlay >
    );
}
