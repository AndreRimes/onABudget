import { Revel } from "./Revel"
import Link from "next/link"

export default function Hero() {
    return (
        <div className="w-1/2 h-full flex flex-col items-center justify-center p-4">
            <div className="text-3xl w-">
                <Revel>
                    Bem Vindo Ao
                </Revel>
                <Revel>
                    <span
                        className="text-[#9400D3] text-4xl font-bold">
                        On A Budget
                    </span>
                </Revel>
                <Revel>
                    O seu app de planejamento financeiro
                </Revel>
            </div>
            <div className="w-[80%] py-10">
                <Revel>
                    <Link href="/signup" >
                        <button className="bg-[#9400D3] text-lg w-[40%] h-10 rounded-md">Cadastro</button>
                    </Link>
                    <Link href="/login">
                        <button className="border border-[#9400D3] text-lg w-[40%] h-10 rounded-md ml-10 hover:bg-[#9400D3] transition-all duration-200 ease-out">Login</button>
                    </Link>

                </Revel>
            </div>
        </div>
    )
}