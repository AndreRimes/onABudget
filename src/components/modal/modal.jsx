import Overlay from "./overlay"
import { useEffect, useState } from "react";
import CompraInput from "./input";
import Image from "next/image";
import dots from '../../../public/3Dots.png'
import CreateMonth from "./createMonth";
import lixo from '../../../public/lixo.png'
import edit from '../../../public/edit.png'
import { useUser } from "@/Domain/userContext";

export default function Modal({ setIsModalOpen, month, setMonth }) {
    const [isInput, setIsInput] = useState();
    const [selected, setSelected] = useState()
    const { deleteCompra } = useUser();
    const [editCompra, setEditCompra] = useState(-1)

    async function handleDelete(index, month) {
        const deletedMonth = await deleteCompra(index, month)
        setMonth(deletedMonth);
    }


    return (
        <Overlay setIsModalOpen={setIsModalOpen}>
            <div onClick={(e) => e.stopPropagation()} className="bg-Dark text-white w-2/3 h-5/6 rounded-2xl flex items-center justify-center ">
                {Object.keys(month).length === 0 ? <CreateMonth setMonth={setMonth} /> : (<>
                    <div className="w-full h-[90%] flex flex-col items-center justify-center">
                        <div className="w-2/3 h-12 bg-Primary flex flex-row items-center justify-between px-10 rounded-2xl mb-10 ">
                            <h3 className="w-[11%] flex items-center justify-center">Data</h3>
                            <h3 className="w-[11%] flex items-center justify-center">Loja</h3>
                            <h3 className="w-[11%] flex items-center justify-center">Categoria</h3>
                            <h3 className="w-[11%] flex items-center justify-center">Preco</h3>
                            <h3 className="w-[11%] ">Ajustes</h3>
                        </div>
                        {isInput && <CompraInput index={-1} setEditCompra={setEditCompra}  dateValue={''} categoriaValue={''} storeValue={''} priceValue={''} setMonth={setMonth} setIsInput={setIsInput} month={month} />}
                        {month && month.compras && month.compras.map((compra, index) => (
                             editCompra === index ? <> <CompraInput index={index} key={index} setEditCompra={setEditCompra}  dateValue={compra.date} categoriaValue={compra.categoria} storeValue={compra.store} priceValue={compra.price} setMonth={setMonth} setIsInput={setIsInput} month={month} /> </> : <>
                                <div className="w-2/3 h-12 bg-Primary flex flex-row items-center justify-between px-10 rounded-2xl mb-5 " key={index}>
                                    <h3 className="w-[11%] flex items-center justify-center">{compra.date}</h3>
                                    <h3 className="w-[11%] flex items-center justify-center">{compra.store}</h3>
                                    <h3 className="w-[11%] flex items-center justify-center">{compra.categoria}</h3>
                                    <h3 className="w-[11%] flex items-center justify-center">${compra.price}</h3>
                                    <div className="w-[11%] flex items-center justify-center">
                                        {selected === index ?
                                            <>
                                                <Image onClick={() => handleDelete(index, month)} className="mr-4 cursor-pointer" src={lixo} width={24} height={24} />
                                                <Image onClick={() => setEditCompra(index)} className="cursor-pointer" src={edit} width={24} height={24} />
                                            </>
                                            : <>
                                                <Image src={dots} width={30} height={30} alt='3 dots' className="cursor-pointer" onClick={(e) => setSelected(index)} />
                                            </>}
                                    </div>
                                </div>
                            </>
                        ))}
                        <div className="font-semibold text-3xl w-2/3 flex justify-end">
                            <span onClick={() => setIsInput(!isInput)} className="hover:scale-125 transition-all duration-300 ease-out h-10 w-10 p-0 rounded-full bg-Primary flex items-center justify-center cursor-pointer">+</span>
                        </div>
                    </div>
                </>)}
            </div>
        </Overlay>
    )
}
