import Image from "next/image"
import calendario from '../../../public/calendario.png'
import { useRef } from "react"
import { useUser } from "@/Domain/userContext";


export default function CreateMonth({setMonth}) {
    const mesRef = useRef();
    const budgetRef = useRef();
    const {createMonth} = useUser();

   async function handleClick() {
        const data = {
            date: mesRef.current.value,
            budget: budgetRef.current.value,
            spent:0,
            compras: JSON.stringify([])
        }
        const newMonth = await createMonth(data);
        console.log("New Month: ",newMonth);
        setMonth(newMonth);
    }

    return (
        <div className="w-3/5 h-4/5">
            <div className="flex flex-col items-center justify-evenly h-[85%] w-full">
                <Image src={calendario} width={100} height={100} />
                <h1 className="text-4xl font-semibold">Novo Mes</h1>
                <div className="w-1/2">
                    <h3 className="ml-1">Data do Mes: </h3>
                    <input
                        ref={mesRef}
                        type="text"
                        placeholder="mes/ano "
                        className="bg-tx px-2 w-full h-10 text-Dark rounded-lg"
                    />
                </div>
                <div className="w-1/2">
                    <h3 className="ml-1">Budget: </h3>
                    <input
                        ref={budgetRef}
                        type="text"
                        placeholder="Budget: "
                        className="bg-tx px-2 w-full h-10 text-Dark rounded-lg"
                    />
                </div>
                <button
                    onClick={() => handleClick()}
                    className="bg-Secundary w-1/2 h-10 rounded-xl hover:scale-110 transition-all ease-out duration-200 mt-4"
                >
                    Criar
                </button>
            </div>
        </div>
    )
}