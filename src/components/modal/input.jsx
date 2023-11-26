import { useRef } from "react"
import { useUser } from "@/Domain/userContext";
export default function CompraInput({month}) {
    const {addCompra} = useUser();
    const dataRef = useRef();
    const lojaRef = useRef();
    const categoriaRef = useRef();
    const precoRef = useRef()

    function handleClicK(){
        const compra = {
            store:lojaRef.current.value,
            date:dataRef.current.value,
            categoria:categoriaRef.current.value,
            price: parseInt(precoRef.current.value)
        }
         addCompra(compra,month)   
    }


    return (
        <div className="w-2/3 h-12 bg-Primary flex flex-row items-center justify-between px-10 rounded-2xl mb-5">
            <input ref={dataRef} className="w-[11%] px-1 text-black bg-tx rounded-md"/>
            <input ref={lojaRef} className="w-[11%] px-1 text-black bg-tx rounded-md"/>
            <input ref={categoriaRef} className="w-[11%] px-1 text-black bg-tx rounded-md"/>
            <input ref={precoRef} className="w-[11%] px-1 text-black bg-tx rounded-md"/>
            <button onClick={handleClicK} className="bg-Secundary rounded-md w-[11%]">Salvar</button>
        </div>
    )
}