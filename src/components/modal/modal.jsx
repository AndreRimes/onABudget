import Overlay from "./overlay"
import { useState } from "react";
import CompraInput from "./input";
import Image from "next/image";
import dots from '../../../public/3Dots.png'

export default function Modal({ setIsModalOpen, month }) {
    const [isInput, setIsInput] = useState();

    return (
        <Overlay setIsModalOpen={setIsModalOpen}>
            <div onClick={(e) => e.stopPropagation()} className="bg-Dark text-white w-2/3 h-5/6 rounded-2xl flex items-center justify-center ">
                <div className="w-full h-[90%] flex flex-col items-center justify-center">
                    <div className="w-2/3 h-12 bg-Primary flex flex-row items-center justify-between px-10 rounded-2xl mb-10 ">
                        <h3 className="w-[11%] flex items-center justify-center">Data</h3>
                        <h3 className="w-[11%] flex items-center justify-center">Loja</h3>
                        <h3 className="w-[11%] flex items-center justify-center">Categoria</h3>
                        <h3 className="w-[11%] flex items-center justify-center">Preco</h3>
                        <h3 className="w-[11%] ">Ajustes</h3>
                    </div>
                    {isInput && <CompraInput month={month} />}
                    {month && month.compras && month.compras.map((compra, index) => (
                        <div className="w-2/3 h-12 bg-Primary flex flex-row items-center justify-between px-10 rounded-2xl mb-5 " key={index}>
                            <h3 className="w-[11%] flex items-center justify-center">{compra.date}</h3>
                            <h3 className="w-[11%] flex items-center justify-center">{compra.store}</h3>
                            <h3 className="w-[11%] flex items-center justify-center">{compra.categoria}</h3>
                            <h3 className="w-[11%] flex items-center justify-center">${compra.price}</h3>
                            <div className="w-[11%] flex items-center justify-center">
                                <Image src={dots} width={30} height={30} alt='3 dots' />
                            </div>
                        </div>
                    ))}
                    <div className="font-semibold text-3xl w-2/3 flex justify-end">
                        <span onClick={() => setIsInput(!isInput)} className="h-10 w-10 p-0 rounded-full bg-Primary flex items-center justify-center cursor-pointer">+</span>
                    </div>
                </div>
            </div>
        </Overlay>
    )
}
